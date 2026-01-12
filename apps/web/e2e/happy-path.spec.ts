import { test, expect } from "@playwright/test";

test("smoke: landing, login, and register pages render", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /analytics tracking/i })).toBeVisible();
  await expect(page.getByRole("banner").getByRole("link", { name: /sign in/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /get started/i })).toBeVisible();

  await page.getByRole("banner").getByRole("link", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText(/sign in to your account/i)).toBeVisible();
  await expect(page.getByLabel(/email/i)).toBeVisible();
  await expect(page.getByLabel(/password/i)).toBeVisible();

  await page.getByRole("link", { name: /create one free/i }).click();
  await expect(page).toHaveURL(/\/register$/);
  await expect(page.getByText(/create a new account/i)).toBeVisible();
  await expect(page.getByLabel(/your name/i)).toBeVisible();
  await expect(page.getByLabel(/work email/i)).toBeVisible();
});
