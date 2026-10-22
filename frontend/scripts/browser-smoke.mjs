import { chromium } from "@playwright/test";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
const backend = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../backend",
);
const require = createRequire(path.join(backend, "app.js"));
require("dotenv").config({ path: path.join(backend, ".env") });
const mysql = require("mysql2/promise");
const db = await mysql.createConnection({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});
const [schemas] = await db.query(
  "SELECT schema_name FROM information_schema.schemata WHERE schema_name REGEXP '^bornobabyshop_test_[0-9]+$' ORDER BY schema_name DESC LIMIT 1",
);
if (!schemas.length)
  throw new Error(
    "Run the real-MySQL integration test before this browser test",
  );
const database = schemas[0].SCHEMA_NAME || schemas[0].schema_name;
const [products] = await db.query(
  `SELECT barcode,id FROM \`${database}\`.products ORDER BY id LIMIT 1`,
);
await db.end();
const server = spawn(process.execPath, ["app.js"], {
  cwd: backend,
  env: {
    ...process.env,
    DB_NAME: database,
    PORT: "3101",
    NODE_ENV: "test",
    CORS_ORIGINS: "http://127.0.0.1:3101",
  },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});
let serverErrors = "";
server.stderr.on("data", (v) => {
  serverErrors += String(v);
});
const origin = "http://127.0.0.1:3101";
let browser;
let page;
try {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(origin + "/health");
      if (r.ok) break;
    } catch {}
    if (i === 59) throw new Error("Test server did not start: " + serverErrors);
    await new Promise((r) => setTimeout(r, 200));
  }
  browser = await chromium.launch({ channel: "msedge", headless: true });
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on("console", (message) => {
    if (message.type() === "error")
      console.error("Browser console:", message.text());
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin);
  await page.getByLabel("Email address").fill("integration@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("integration-password");
  await page.getByRole("button", { name: "Sign in to workspace" }).click();
  await page.getByRole("heading", { name: /Good to see you/ }).waitFor();
  await page.getByText("Loading your workspace…").waitFor({ state: "hidden" });
  await page.getByRole("heading", { name: "Sales performance" }).waitFor();
  await fs.mkdir(path.resolve("test-results"), { recursive: true });
  await page.screenshot({
    path: "test-results/dashboard-light.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
  await page.screenshot({
    path: "test-results/dashboard-dark.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await page.getByRole("link", { name: "Products CATALOG" }).click();
  await page.getByRole("button", { name: "Create product" }).waitFor();
  await page.getByRole("button", { name: "Create product" }).click();
  const browserProductName = `Browser toy ${Date.now()}`;
  await page
    .getByRole("dialog")
    .getByLabel("Product name")
    .fill(browserProductName);
  await page
    .getByRole("dialog")
    .getByLabel(/^Sale price/)
    .fill("125");
  await page.locator("input[type=file]").setInputFiles("public/logo.png");
  await page.getByRole("button", { name: "Save product" }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByText(browserProductName, { exact: true }).waitFor();
  await page.screenshot({
    path: "test-results/product-catalog.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "Offline sale", exact: true }).click();
  const barcode = page.getByRole("textbox", {
    name: "Scan five-character barcode",
  });
  await barcode.fill(products[0].barcode);
  await barcode.press("Enter");
  await page.locator(".items-table tbody tr").waitFor();
  await page.getByRole("button", { name: "Browse catalog" }).click();
  await page.getByRole("dialog").waitFor();
  assert.equal(
    await page
      .getByRole("dialog")
      .getByRole("textbox", { name: "Scan five-character barcode" })
      .evaluate((el) => document.activeElement === el),
    true,
    "picker must focus barcode",
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /Use .* selected items/ })
    .click();
  await page.getByLabel("Phone number").fill("01700000001");
  await page.getByRole("button", { name: "Find customer by phone" }).click();
  await page.getByText("Customer found", { exact: true }).waitFor();
  assert.equal(
    await page.locator(".items-table tbody tr").count(),
    1,
    "customer lookup notifications must preserve the basket",
  );
  await page.getByLabel("Customer name").fill("Browser customer");
  await page.getByRole("button", { name: "Continue to checkout" }).click();
  await page.getByRole("dialog", { name: "Ready for checkout" }).waitFor();
  // Stub the browser print dialog while verifying order creation and receipt content.
  await page.evaluate(() => {
    window.print = () => {
      window.__printed = true;
    };
  });
  await page.getByRole("button", { name: "Create order", exact: true }).click();
  await page
    .getByRole("dialog", { name: "A little joy, on its way" })
    .waitFor();
  await page.locator(".receipt").getByText("Browser customer").waitFor();
  await page.screenshot({
    path: "test-results/pos-receipt.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "New sale", exact: true }).click();
  await page
    .getByRole("link", { name: "Bulk online entry", exact: true })
    .click();
  const csv = `order_ref,customer_name,customer_phone,customer_address,item_type,barcode,quantity\nBROWSER-CSV,CSV Customer,01700000002,Dhaka,product,${products[0].barcode},1\n`;
  await page.locator("input[type=file]").setInputFiles({
    name: "orders.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await page.getByRole("heading", { name: "Review 1 orders" }).waitFor();
  await page.screenshot({
    path: "test-results/csv-preview.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "Reports", exact: true }).click();
  await page.getByRole("heading", { name: "Reports", exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Monthly product sales by sales person" })
    .click();
  await page
    .getByRole("heading", { name: "Monthly product sales by sales person" })
    .waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("link", { name: "Dashboard", exact: true }).click();
  await page.getByRole("heading", { name: /Good to see you/ }).waitFor();
  await page.getByRole("heading", { name: "Sales performance" }).waitFor();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
    "mobile layout must fit viewport",
  );
  await page.screenshot({
    path: "test-results/dashboard-mobile.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    "Browser smoke passed: login, charts, themes, product create, barcode picker, checkout/receipt, CSV preview, reports, mobile navigation.",
  );
  console.log("Screenshots saved in frontend/test-results/");
} catch (error) {
  await fs.mkdir(path.resolve("test-results"), { recursive: true });
  await page
    ?.screenshot({ path: "test-results/browser-failure.png", fullPage: true })
    .catch(() => {});
  if (page)
    console.error(
      "Browser body:",
      (await page.locator("body").innerText()).slice(0, 1500),
    );
  throw error;
} finally {
  await browser?.close();
  server.kill();
}
