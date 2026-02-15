import { chromium } from "playwright";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const APP = process.env.APP_URL || "http://localhost:3100";
const API = process.env.API_URL || "http://localhost:8000/api/v1";
const ROOT_API = API.replace(/\/api\/v1$/, "");
const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const email = `stress-${suffix}@example.com`;
const password = "Password123!";
const planName = `Stress Plan ${suffix}`;
const orgName = `Stress Org ${suffix}`;
const importFile = path.join(os.tmpdir(), `trackboard-import-${suffix}.json`);

const importPayload = {
  global_properties: [
    {
      name: "user_id",
      type: "string",
      required: true,
      description: "Canonical user identifier",
      constraints: {},
      examples: [],
    },
  ],
  events: [
    {
      event_name: "signup_completed",
      description: "A user completed signup",
      category: "activation",
      properties: [
        {
          name: "signup_method",
          type: "string",
          required: true,
          description: "The signup provider",
          constraints: {},
          examples: ["google"],
        },
      ],
      global_properties: ["user_id"],
    },
  ],
};

fs.writeFileSync(importFile, JSON.stringify(importPayload, null, 2));

function splitPath(pathname) {
  return pathname.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
}

function compileTemplate(template) {
  const parts = splitPath(template);
  return {
    template,
    match(pathname) {
      const normalizedPath = pathname.startsWith("/api/v1") ? pathname : `/api/v1${pathname}`;
      const pathParts = splitPath(normalizedPath);
      if (pathParts.length !== parts.length) return false;
      return parts.every((part, index) => part.startsWith("{") || part === pathParts[index]);
    },
  };
}

async function fetchExpectedRoutes() {
  const response = await fetch(`${ROOT_API}/openapi.json`);
  if (!response.ok) throw new Error(`OpenAPI fetch failed: ${response.status}`);
  const spec = await response.json();
  const routes = [];

  for (const [template, methods] of Object.entries(spec.paths)) {
    for (const method of Object.keys(methods)) {
      const upper = method.toUpperCase();
      if (["GET", "POST", "PATCH", "DELETE"].includes(upper)) {
        routes.push({ method: upper, template, compiled: compileTemplate(template) });
      }
    }
  }

  routes.sort((a, b) => `${a.method} ${a.template}`.localeCompare(`${b.method} ${b.template}`));
  return routes;
}

function routeKey(route) {
  return `${route.method} ${route.template}`;
}

function normalizeRoute(expectedRoutes, method, url) {
  const parsed = new URL(url);
  const candidates = expectedRoutes.filter(
    (route) => route.method === method && route.compiled.match(parsed.pathname),
  );

  if (candidates.length === 0) return `${method} ${parsed.pathname}`;

  candidates.sort((a, b) => {
    const aDynamic = a.template.split("{").length - 1;
    const bDynamic = b.template.split("{").length - 1;
    return aDynamic - bDynamic || b.template.length - a.template.length;
  });

  return routeKey(candidates[0]);
}

async function step(name, fn) {
  const started = Date.now();
  process.stdout.write(`\nSTEP ${name} ... `);
  await fn();
  console.log(`ok (${Date.now() - started}ms)`);
}

async function waitBackend(page, method, matcher, timeout = 20000) {
  const response = await page.waitForResponse(
    (res) => {
      if (!res.url().startsWith(API)) return false;
      if (res.request().method() !== method) return false;
      const url = res.url();
      if (typeof matcher === "string") return url.includes(matcher);
      return matcher.test(url);
    },
    { timeout },
  );

  if (response.status() >= 500) {
    throw new Error(`${method} ${response.url()} returned ${response.status()}`);
  }

  return response;
}

async function clickAndWait(page, method, matcher, clicker, timeout) {
  const [response] = await Promise.all([waitBackend(page, method, matcher, timeout), clicker()]);
  return response;
}

async function blur(page) {
  await page.locator("body").click({ position: { x: 4, y: 4 } });
}

async function setReactField(locator, value) {
  await locator.evaluate((node, nextValue) => {
    const prototype =
      node instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const valueSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    valueSetter?.call(node, nextValue);
    node.dispatchEvent(new Event("input", { bubbles: true }));
    node.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

async function firstJsonResponse(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function parseRequestBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};

  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function startMockAiServer() {
  const server = http.createServer(async (request, response) => {
    if (request.method !== "POST" || !request.url?.endsWith("/chat/completions")) {
      response.writeHead(404, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "not_found" }));
      return;
    }

    const body = await parseRequestBody(request);
    const prompt = (body.messages ?? [])
      .map((message) => message?.content ?? "")
      .join("\n")
      .toLowerCase();
    const content = prompt.includes("identify any pairs")
      ? {
          duplicates: [
            {
              event_a: "signup_completed_v1",
              event_b: "ai_payload_generated",
              confidence: "medium",
              reason: "Mock semantic check completed for stress coverage.",
            },
          ],
        }
      : {
          event_name: "ai_payload_generated",
          description: "Generated from the mock AI provider during frontend stress coverage.",
          category: "ai-assisted",
          properties: [
            {
              name: "user_id",
              type: "string",
              required: true,
              description: "Canonical user id from the sample payload.",
            },
            {
              name: "plan",
              type: "string",
              required: false,
              description: "Plan tier from the sample payload.",
            },
          ],
        };

    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(
      JSON.stringify({
        id: `chatcmpl_mock_${suffix}`,
        object: "chat.completion",
        choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(content) } }],
      }),
    );
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Mock AI server did not return a TCP address.");
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

function inputByValue(page, value) {
  const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return page.locator(`input[value="${escaped}"]`);
}

async function main() {
  const expectedRoutes = await fetchExpectedRoutes();
  const expectedKeys = expectedRoutes.map(routeKey);
  const mockAi = await startMockAiServer();
  const covered = new Set();
  const seen = [];
  const failures = [];
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1440, height: 1100 },
  });
  const page = await context.newPage();

  page.on("dialog", (dialog) => dialog.accept());
  page.on("response", async (response) => {
    if (!response.url().startsWith(API)) return;
    const method = response.request().method();
    const key = normalizeRoute(expectedRoutes, method, response.url());
    covered.add(key);
    seen.push({ key, status: response.status(), url: response.url() });
    if (response.status() >= 400) {
      failures.push({
        key,
        status: response.status(),
        url: response.url(),
        text: await response.text().catch(() => ""),
      });
    }
  });

  let planId;
  let branchId;
  let mergeRequestId;
  let activeApiKey;
  let keyToRevokeId;
  let versionIds = [];

  try {
    await step("register and land on plans", async () => {
      await page.goto(`${APP}/register`, { waitUntil: "domcontentloaded" });
      await page.getByLabel("Your name").fill("Stress Runner");
      await page.getByLabel("Work email").fill(email);
      await page.getByLabel("Organization name").fill(orgName);
      await page.getByLabel("Password").fill(password);
      await clickAndWait(page, "POST", "/auth/register", () =>
        page.getByRole("button", { name: /^Get started$/i }).click(),
      );
      await page.waitForURL("**/plans", { timeout: 20000 });
      await page.getByRole("heading", { name: /Tracking Plans/i }).waitFor({ timeout: 20000 });
    });

    await step("auth refresh interceptor", async () => {
      await page.evaluate(() => localStorage.setItem("access_token", "expired-token-for-stress-test"));
      await Promise.all([
        waitBackend(page, "POST", "/auth/refresh", 20000),
        page.goto(`${APP}/plans`, { waitUntil: "domcontentloaded" }),
      ]);
      await page.getByRole("heading", { name: /Tracking Plans/i }).waitFor({ timeout: 20000 });
    });

    await step("create plan", async () => {
      await page.getByRole("button", { name: /New Plan/i }).click();
      await page.getByPlaceholder(/Plan name/i).fill(planName);
      const response = await clickAndWait(page, "POST", /\/plans$/, () =>
        page.getByRole("button", { name: /^Create$/i }).click(),
      );
      const data = await firstJsonResponse(response);
      planId = data?.id;
      if (!planId) throw new Error("Plan id was not returned by create endpoint.");
      await page.waitForURL(`**/plans/${planId}`, { timeout: 20000 });
      await page.getByRole("heading", { name: new RegExp(planName) }).waitFor({ timeout: 20000 });
    });

    await step("open plan and import JSON snapshot", async () => {
      await page.goto(`${APP}/plans/${planId}/settings`, { waitUntil: "domcontentloaded" });
      await page.getByRole("heading", { name: /Workspace settings/i }).waitFor({ timeout: 20000 });
      await page.getByText(/Current draft revision: r\d+/i).waitFor({ timeout: 20000 });
      const [fileChooser] = await Promise.all([
        page.waitForEvent("filechooser"),
        page.locator('input[type="file"]').click(),
      ]);
      await Promise.all([
        waitBackend(page, "POST", `/plans/${planId}/import`, 30000),
        fileChooser.setFiles(importFile),
      ]);
      await page.getByText(/Import successful/i).waitFor({ timeout: 20000 });
      await page.locator("input.input").first().fill(`${planName} Governed`);
      await page.locator("textarea").first().fill("Stress-tested source-of-truth workspace.");
      await clickAndWait(page, "PATCH", `/plans/${planId}`, () =>
        page.getByRole("button", { name: /Save details/i }).click(),
      );
      await page.getByText(/Workspace updated/i).waitFor({ timeout: 20000 });
    });

    await step("configure mock AI provider", async () => {
      await Promise.all([
        waitBackend(page, "GET", "/org/ai-provider"),
        page.goto(`${APP}/settings`, { waitUntil: "domcontentloaded" }),
      ]);
      await page.getByRole("heading", { name: /AI Provider/i }).waitFor({ timeout: 20000 });
      await page.getByLabel(/Enable AI tools/i).check();
      await page
        .getByPlaceholder(/api\.openai\.com|localhost:1234/i)
        .fill(`${mockAi.baseUrl}/v1`);
      await page.getByPlaceholder("gpt-4o-mini").fill("mock-trackboard-model");
      await page.getByPlaceholder(/Paste provider key|Saved on backend/i).fill("tb_mock_ai_key");
      await clickAndWait(page, "PATCH", "/org/ai-provider", () =>
        page.getByRole("button", { name: /Save AI settings/i }).click(),
      );
      await page.getByText(/Status: enabled \/ key saved/i).waitFor({ timeout: 20000 });
    });

    await step("editor event/global/property mutations and search", async () => {
      await page.goto(`${APP}/plans/${planId}`, { waitUntil: "domcontentloaded" });
      await page.getByText(/Governance score/i).waitFor({ timeout: 20000 });

      await page.getByPlaceholder(/Filter events via backend/i).fill("signup");
      await waitBackend(page, "GET", /\/plans\/[^/]+\/events\?q=signup/);
      await page.getByText(/matched/i).waitFor({ timeout: 20000 });

      await inputByValue(page, "signup_completed").first().fill("signup_completed_v1");
      await Promise.all([waitBackend(page, "PATCH", "/events/"), blur(page)]);
      await page.getByPlaceholder(/Filter events via backend/i).fill("");
      await inputByValue(page, "signup_completed_v1").waitFor({ timeout: 20000 });

      await page.getByPlaceholder("category").first().fill("activation-core");
      await Promise.all([waitBackend(page, "PATCH", "/events/"), blur(page)]);
      await page.locator("select.input").filter({ hasText: /active/ }).first().selectOption("planned");
      await waitBackend(page, "PATCH", "/events/");
      await page
        .locator('textarea[placeholder^="Describe when this event fires"]')
        .first()
        .fill("Validated signup completion event for contract stress testing.");
      await Promise.all([waitBackend(page, "PATCH", "/events/"), blur(page)]);

      await inputByValue(page, "signup_method").first().fill("signup_provider");
      await Promise.all([waitBackend(page, "PATCH", "/properties/"), blur(page)]);
      await page.getByPlaceholder(/^description$/i).first().fill("Provider used to complete signup.");
      await Promise.all([waitBackend(page, "PATCH", "/properties/"), blur(page)]);

      await page.getByPlaceholder("device_os").fill("session_id");
      const createGlobal = await clickAndWait(page, "POST", `/plans/${planId}/global-properties`, () =>
        page.getByRole("button", { name: /Add global property/i }).click(),
      );
      const globalData = await firstJsonResponse(createGlobal);
      const globalId = globalData?.id;
      if (!globalId) throw new Error("Global property id missing.");
      await inputByValue(page, "session_id").first().fill("session_key");
      await Promise.all([waitBackend(page, "PATCH", "/global-properties/"), blur(page)]);
      await inputByValue(page, "session_key").waitFor({ timeout: 20000 });

      const linkSelect = page.locator("select").filter({ hasText: /Link global property/ }).first();
      await linkSelect.selectOption(globalId);
      await waitBackend(page, "POST", /\/events\/[^/]+\/global-properties\/[^/]+/);
      await page.getByTitle("Unlink global property").filter({ hasText: /session_key/ }).click();
      await waitBackend(page, "DELETE", /\/events\/[^/]+\/global-properties\/[^/]+/);

      await page.getByText("Search anything...").click();
      await page.getByPlaceholder(/Search events/i).fill("signup");
      await waitBackend(page, "GET", `/plans/${planId}/search?q=signup`);
      await page.keyboard.press("Escape");
    });

    await step("AI generate, add and duplicate analysis", async () => {
      await page.goto(`${APP}/plans/${planId}`, { waitUntil: "domcontentloaded" });
      await page.getByText(/Optional AI assistant/i).waitFor({ timeout: 20000 });
      await page.getByPlaceholder(/signup_completed/i).fill(
        JSON.stringify(
          {
            event: "ai_payload_generated",
            properties: { user_id: "usr_ai_123", plan: "team" },
          },
          null,
          2,
        ),
      );
      await clickAndWait(page, "POST", `/plans/${planId}/ai/generate`, () =>
        page.getByRole("button", { name: /Generate draft/i }).click(),
        30000,
      );
      await page.getByText("ai_payload_generated", { exact: true }).last().waitFor({ timeout: 20000 });
      await clickAndWait(page, "POST", `/plans/${planId}/events`, () =>
        page.getByRole("button", { name: /Add generated event/i }).click(),
      );
      await inputByValue(page, "ai_payload_generated").waitFor({ timeout: 20000 });
      await clickAndWait(page, "GET", `/plans/${planId}/ai/analyze`, () =>
        page.getByRole("button", { name: /Analyze duplicates/i }).click(),
        30000,
      );
      await page.getByText(/Mock semantic check completed/i).waitFor({ timeout: 20000 });
    });

    await step("dictionary global-property list surface", async () => {
      await Promise.all([
        waitBackend(page, "GET", `/plans/${planId}/global-properties`),
        page.goto(`${APP}/plans/${planId}/dictionary`, { waitUntil: "domcontentloaded" }),
      ]);
      await page.getByRole("heading", { name: /Data dictionary/i }).waitFor({ timeout: 20000 });
    });

    await step("comments and delete flows", async () => {
      await page.goto(`${APP}/plans/${planId}`, { waitUntil: "domcontentloaded" });
      await page.getByTitle("Open comments").first().click();
      await waitBackend(page, "GET", /\/events\/[^/]+\/comments/);
      await page.getByPlaceholder(/Add a review note/i).fill("Stress review note");
      const commentResponse = await clickAndWait(page, "POST", /\/events\/[^/]+\/comments/, () =>
        page.getByRole("button", { name: /^Comment$/i }).click(),
      );
      const comment = await firstJsonResponse(commentResponse);
      if (!comment?.id) throw new Error("Comment id missing.");
      await page.getByTitle("Delete comment").click();
      await waitBackend(page, "DELETE", `/comments/${comment.id}`);

      await page.getByPlaceholder("event_name").fill("debug_tmp_event");
      const eventResponse = await clickAndWait(page, "POST", `/plans/${planId}/events`, () =>
        page.getByRole("button", { name: /Add event/i }).click(),
      );
      const tempEvent = await firstJsonResponse(eventResponse);
      if (!tempEvent?.id) throw new Error("Temp event id missing.");
      const tempEventInput = inputByValue(page, "debug_tmp_event").first();
      await tempEventInput.waitFor({ timeout: 20000 });
      const tempEventCard = tempEventInput.locator(
        'xpath=ancestor::div[contains(@class, "rounded-[1.5rem]")][1]',
      );
      await tempEventCard.locator('input[placeholder="new_property"]').fill("debug_tmp_prop");
      const propertyResponse = await clickAndWait(page, "POST", /\/events\/[^/]+\/properties/, () =>
        tempEventCard.getByRole("button", { name: /Add property/i }).click(),
      );
      const tempProperty = await firstJsonResponse(propertyResponse);
      if (!tempProperty?.id) throw new Error("Temp property id missing.");
      await tempEventCard.getByTitle("Delete property").click();
      await waitBackend(page, "DELETE", `/properties/${tempProperty.id}`);
      const tempEventInputAfterPropertyDelete = inputByValue(page, "debug_tmp_event").first();
      await tempEventInputAfterPropertyDelete.waitFor({ timeout: 20000 });
      const tempEventCardAfterPropertyDelete = tempEventInputAfterPropertyDelete.locator(
        'xpath=ancestor::div[contains(@class, "rounded-[1.5rem]")][1]',
      );
      await tempEventCardAfterPropertyDelete.getByTitle("Delete event").click();
      await waitBackend(page, "DELETE", `/events/${tempEvent.id}`);

      await page.getByTitle("Delete global property").last().click();
      await waitBackend(page, "DELETE", "/global-properties/");
    });

    await step("publish v1 and key lifecycle", async () => {
      await page.goto(`${APP}/plans/${planId}`, { waitUntil: "domcontentloaded" });
      await clickAndWait(page, "POST", `/plans/${planId}/publish`, () =>
        page.getByRole("button", { name: /^Publish$/i }).click(),
      );
      await page.getByText(/Published/i).waitFor({ timeout: 20000 });

      await page.goto(`${APP}/plans/${planId}/settings`, { waitUntil: "domcontentloaded" });
      await page.getByPlaceholder(/Label/i).fill(`stress key ${suffix}`);
      const createKeyResponse = await clickAndWait(page, "POST", `/plans/${planId}/keys`, () =>
        page.getByRole("button", { name: /^Create$/i }).click(),
      );
      const createdKey = await firstJsonResponse(createKeyResponse);
      if (!createdKey?.id || !createdKey?.full_key) throw new Error("Created API key missing fields.");
      const rotateResponse = await clickAndWait(page, "POST", `/keys/${createdKey.id}/rotate`, () =>
        page.getByRole("button", { name: /^Rotate$/i }).first().click(),
      );
      const rotatedKey = await firstJsonResponse(rotateResponse);
      if (!rotatedKey?.id || !rotatedKey?.full_key) throw new Error("Rotated API key missing fields.");
      activeApiKey = rotatedKey.full_key;
      keyToRevokeId = rotatedKey.id;

      await clickAndWait(page, "GET", `/plans/${planId}/export`, async () => {
        const [download] = await Promise.all([
          page.waitForEvent("download"),
          page.getByRole("button", { name: /Export JSON/i }).click(),
        ]);
        await download.failure().catch(() => null);
      });
    });

    await step("validation playground single and batch then DLQ", async () => {
      await page.goto(`${APP}/plans/${planId}/playground`, { waitUntil: "networkidle" });
      await page.getByRole("heading", { name: /Validation playground/i }).waitFor({ timeout: 20000 });
      await page.waitForTimeout(500);
      const apiKeyInput = page.locator('input[type="password"]').first();
      const payloadEditor = page.locator("textarea").first();
      const singlePayload = JSON.stringify(
        {
          event: "signup_completed_v1",
          properties: { user_id: "usr_123", signup_provider: "google" },
        },
        null,
        2,
      );
      await setReactField(apiKeyInput, activeApiKey);
      await setReactField(payloadEditor, singlePayload);
      if ((await apiKeyInput.inputValue()) !== activeApiKey) {
        throw new Error("Validation API key input did not retain the rotated key.");
      }
      if ((await payloadEditor.inputValue()) !== singlePayload) {
        throw new Error("Validation payload editor did not retain the single payload.");
      }
      await page.waitForTimeout(150);
      if ((await apiKeyInput.inputValue()) !== activeApiKey) {
        await setReactField(apiKeyInput, activeApiKey);
      }
      if ((await payloadEditor.inputValue()) !== singlePayload) {
        await setReactField(payloadEditor, singlePayload);
      }
      await clickAndWait(page, "POST", /\/validate$/, () =>
        page.getByRole("button", { name: /Run Validation/i }).click(),
      );
      await page.getByText(/^Valid$/i).first().waitFor({ timeout: 20000 });

      await page.getByLabel(/Batch endpoint/i).check();
      await page.locator("select").first().selectOption("block");
      const batchPayload = JSON.stringify(
        {
          events: [
            { event: "signup_completed_v1", properties: { user_id: "usr_456", signup_provider: "email" } },
            { event: "signup_completed_v1", properties: { user_id: "usr_789" } },
          ],
        },
        null,
        2,
      );
      await setReactField(payloadEditor, batchPayload);
      if ((await payloadEditor.inputValue()) !== batchPayload) {
        throw new Error("Validation payload editor did not retain the batch payload.");
      }
      await page.waitForTimeout(150);
      if ((await apiKeyInput.inputValue()) !== activeApiKey) {
        await setReactField(apiKeyInput, activeApiKey);
      }
      if ((await payloadEditor.inputValue()) !== batchPayload) {
        await setReactField(payloadEditor, batchPayload);
      }
      await clickAndWait(page, "POST", "/validate/batch", () =>
        page.getByRole("button", { name: /Run Batch Validation/i }).click(),
      );
      await page.getByText(/^Invalid$/i).first().waitFor({ timeout: 20000 });

      await page.goto(`${APP}/plans/${planId}/observability`, { waitUntil: "domcontentloaded" });
      await waitBackend(page, "GET", `/plans/${planId}/dlq`);
      await waitBackend(page, "GET", `/plans/${planId}/validate/stats`);
      await page.getByPlaceholder(/Filter by event/i).fill("signup");
      await page.getByPlaceholder(/Version id/i).fill("");
      await page.locator("select").last().selectOption("24h");
      await page.getByText(/Showing/i).waitFor({ timeout: 20000 });
    });

    await step("branch, merge request, merge and publish v2", async () => {
      await page.goto(`${APP}/plans/${planId}`, { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: /^Branch$/i }).click();
      await page.getByPlaceholder("feature/new-checkout").fill(`stress-branch-${suffix}`);
      const branchResponse = await clickAndWait(page, "POST", `/plans/${planId}/branch`, () =>
        page.getByRole("button", { name: /^Create$/i }).click(),
      );
      const branch = await firstJsonResponse(branchResponse);
      branchId = branch?.id;
      if (!branchId) throw new Error("Branch id missing.");
      await page.waitForURL(`**/plans/${branchId}`, { timeout: 20000 });

      await page.getByPlaceholder("event_name").fill("refund_requested");
      const branchEventResponse = await clickAndWait(page, "POST", `/plans/${branchId}/events`, () =>
        page.getByRole("button", { name: /Add event/i }).click(),
      );
      const branchEvent = await firstJsonResponse(branchEventResponse);
      if (!branchEvent?.id) throw new Error("Branch event id missing.");
      await page.getByPlaceholder("new_property").last().fill("refund_id");
      await clickAndWait(page, "POST", /\/events\/[^/]+\/properties/, () =>
        page.getByRole("button", { name: /Add property/i }).last().click(),
      );

      await page.getByRole("link", { name: /Open Merge Request/i }).click();
      await page.getByRole("heading", { name: /Open merge request/i }).waitFor({ timeout: 20000 });
      await page.getByPlaceholder(/Describe the changes/i).fill("Stress branch adds refund contract.");
      const mrResponse = await clickAndWait(page, "POST", `/plans/${planId}/merge-requests`, () =>
        page.getByRole("button", { name: /Create Merge Request/i }).click(),
      );
      const mr = await firstJsonResponse(mrResponse);
      mergeRequestId = mr?.id;
      if (!mergeRequestId) throw new Error("MR id missing.");
      await Promise.all([
        waitBackend(page, "GET", `/merge-requests/${mergeRequestId}`),
        page.goto(`${APP}/plans/${planId}/merge-requests/${mergeRequestId}`, {
          waitUntil: "domcontentloaded",
        }),
      ]);
      await clickAndWait(page, "POST", `/merge-requests/${mergeRequestId}/merge`, () =>
        page.getByRole("button", { name: /Merge into main/i }).click(),
      );
      await page.waitForURL(`**/plans/${planId}`, { timeout: 20000 });

      await Promise.all([
        waitBackend(page, "GET", `/plans/${planId}/merge-requests`),
        page.goto(`${APP}/plans/${planId}/merge-requests`, { waitUntil: "domcontentloaded" }),
      ]);
      await page.getByRole("heading", { name: /Merge review/i }).waitFor({ timeout: 20000 });

      await page.goto(`${APP}/plans/${planId}`, { waitUntil: "domcontentloaded" });
      await clickAndWait(page, "POST", `/plans/${planId}/publish`, () =>
        page.getByRole("button", { name: /^Publish$/i }).click(),
      );
    });

    await step("versions diff and restore", async () => {
      const [versionsResponse] = await Promise.all([
        waitBackend(page, "GET", `/plans/${planId}/versions`),
        page.goto(`${APP}/plans/${planId}/versions`, { waitUntil: "domcontentloaded" }),
      ]);
      const versions = await firstJsonResponse(versionsResponse);
      versionIds = Array.isArray(versions) ? versions.map((item) => item.id) : [];
      if (versionIds.length < 2) throw new Error(`Expected at least 2 versions, got ${versionIds.length}`);
      await page.getByText(/v2/i).first().click();
      await page.getByText(/v1/i).first().click();
      await clickAndWait(page, "GET", /\/versions\/[^/]+\/diff\/[^/]+/, () =>
        page.getByRole("button", { name: /^Compare$/i }).click(),
      );
      await page.getByText(/Diff summary/i).waitFor({ timeout: 20000 });
      await clickAndWait(page, "POST", `/versions/${versionIds[1]}/restore`, () =>
        page.getByRole("button", { name: /Restore to draft/i }).last().click(),
      );
    });

    await step("code generation and live stats", async () => {
      await Promise.all([
        waitBackend(page, "GET", `/plans/${planId}/generate/typescript`, 30000),
        page.goto(`${APP}/plans/${planId}/generate`, { waitUntil: "domcontentloaded" }),
      ]);
      await page.getByText(/tracking-events.ts/i).waitFor({ timeout: 30000 });
      await clickAndWait(page, "GET", `/plans/${planId}/generate/json-schema`, () =>
        page.getByRole("button", { name: /JSON Schema/i }).click(),
      );

      await Promise.all([
        waitBackend(page, "GET", `/plans/${planId}/validate/stats`),
        page.goto(`${APP}/plans/${planId}/live`, { waitUntil: "domcontentloaded" }),
      ]);
      await page.getByText(/Live validation/i).waitFor({ timeout: 20000 });
    });

    await step("org health and org update", async () => {
      await Promise.all([
        waitBackend(page, "GET", "/health/live"),
        waitBackend(page, "GET", "/health/ready"),
        waitBackend(page, "GET", "/health/version"),
        page.goto(`${APP}/settings`, { waitUntil: "domcontentloaded" }),
      ]);
      const orgInput = page.locator("input.input").first();
      await orgInput.waitFor({ timeout: 20000 });
      await orgInput.fill(`${orgName} Updated`);
      await clickAndWait(page, "PATCH", "/org", () =>
        page.getByRole("button", { name: /Save Changes/i }).click(),
      );
    });

    await step("login flow and revoke active key", async () => {
      await page.evaluate(() => {
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        localStorage.removeItem("trackboard-auth");
      });
      await page.goto(`${APP}/login`, { waitUntil: "domcontentloaded" });
      await page.getByLabel("Email").fill(email);
      await page.getByLabel("Password").fill(password);
      await clickAndWait(page, "POST", "/auth/login", () =>
        page.getByRole("button", { name: /^Sign in/i }).click(),
      );
      await page.waitForURL("**/plans", { timeout: 20000 });
      await page.goto(`${APP}/plans/${planId}/settings`, { waitUntil: "domcontentloaded" });
      await page.getByTitle("Revoke API key").first().click();
      await waitBackend(page, "DELETE", `/keys/${keyToRevokeId}`);
    });

    const uncovered = expectedKeys.filter((key) => !covered.has(key));
    const unexpected = [...covered].filter((key) => !expectedKeys.includes(key)).sort();
    const nonExpectedFailures = failures.filter((failure) => ![401, 403, 404].includes(failure.status));

    console.log("\nCOVERED_ENDPOINTS");
    expectedKeys.filter((key) => covered.has(key)).forEach((key) => console.log(`  ${key}`));
    console.log("\nUNCOVERED_ENDPOINTS");
    uncovered.forEach((key) => console.log(`  ${key}`));
    if (!uncovered.length) console.log("  none");
    console.log("\nUNEXPECTED_API_ROUTES");
    unexpected.forEach((key) => console.log(`  ${key}`));
    if (!unexpected.length) console.log("  none");
    console.log("\nHTTP_FAILURES");
    failures.forEach((failure) => console.log(`  ${failure.status} ${failure.key} ${failure.url}`));
    if (!failures.length) console.log("  none");
    console.log("\nSUMMARY_JSON");
    console.log(
      JSON.stringify(
        {
          expected: expectedKeys.length,
          covered: expectedKeys.length - uncovered.length,
          uncovered,
          unexpected,
          failures: failures.map(({ key, status, url }) => ({ key, status, url })),
          planId,
          branchId,
          mergeRequestId,
          versions: versionIds.length,
        },
        null,
        2,
      ),
    );

    if (uncovered.length || nonExpectedFailures.length) {
      process.exitCode = 2;
    }
  } catch (error) {
    const screenshotDir = path.join(process.cwd(), ".screenshots");
    fs.mkdirSync(screenshotDir, { recursive: true });
    const screenshotPath = path.join(screenshotDir, `stress-failure-${Date.now()}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => null);
    console.error("\nSTRESS_FAILED");
    console.error(error?.stack || error);
    console.error(`SCREENSHOT ${screenshotPath}`);
    console.error("\nSEEN_API_CALLS");
    seen.forEach((item) => console.error(`${item.status} ${item.key} ${item.url}`));
    process.exitCode = 1;
  } finally {
    await browser.close().catch(() => null);
    await mockAi.close().catch(() => null);
    fs.rmSync(importFile, { force: true });
  }
}

main();
