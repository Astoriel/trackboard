const http = require("node:http");

const port = Number(process.env.PORT || 9000);
const events = [];

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    return json(res, 200, { ok: true, received: events.length });
  }
  if (req.method === "GET" && req.url === "/events") {
    return json(res, 200, { events });
  }
  if (req.method === "POST" && req.url === "/track") {
    const body = await readBody(req);
    try {
      events.push(JSON.parse(body || "{}"));
    } catch {
      events.push({ raw: body });
    }
    return json(res, 202, { accepted: true, received: events.length });
  }
  return json(res, 404, { error: "not_found" });
});

server.listen(port, () => {
  console.log(`fake destination listening on :${port}`);
});

function json(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}
