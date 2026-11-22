/* eslint-disable @typescript-eslint/no-require-imports */
// Kör webbläsarversionen (preview/dist/index.html) i iPhone-storlek och kontrollerar huvudflödet.
const { chromium, devices } = require("playwright");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const html = fs.readFileSync(path.join(__dirname, "dist/index.html"));
const norm = (s) => s.replace(/ /g, " ").replace(/\s+/g, " ").trim();
(async () => {
  const server = http.createServer((_q, r) => r.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(html)).listen(3230);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices["iPhone 14"], locale: "sv-SE" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => m.type() === "error" && errors.push("console: " + m.text().slice(0, 300)));
  const has = async (sel, needle) => {
    await page.waitForFunction(([s, n]) => (document.querySelector(s)?.innerText ?? "").replace(/ /g, " ").includes(n), [sel, needle], { timeout: 15000 });
  };
  const log = [];
  const step = async (name, fn) => {
    try {
      await fn();
      log.push("  ✓ " + name);
    } catch (e) {
      log.push("  ✗ " + name + "\n      " + String(e.message).split("\n")[0]);
    }
  };
  await page.goto("http://localhost:3230/");
  await step("startar på välkomstsidan", () => has("body", "Prova demon"));
  await step("demo → hem med 6 831 kr kvar till lön", async () => {
    await page.click("[data-testid=start-demo]");
    await has("[data-testid=left-figure]", "6 831");
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(__dirname, "dist/live-home.png") });
  });
  await step("uträkningen öppnas", async () => {
    await page.click("[data-testid=left-figure]");
    await has("dialog[open]", "Disponibelt nu");
    await page.click("dialog[open] .iconbtn");
  });
  await step("Ryms det? med exempelbild → Ja, 201 kr kvar", async () => {
    await page.click("[data-testid=cta]");
    await page.click("[data-testid=sample-jacka]");
    await page.waitForSelector(".flow[data-step=confirm]");
    await page.click("[data-testid=check]");
    await has("[data-testid=answer]", "201 kr kvar");
    await page.screenshot({ path: path.join(__dirname, "dist/live-answer.png") });
  });
  await step("Jag köpte den → budgeten uppdateras", async () => {
    await page.click("[data-testid=bought]");
    await page.click("[data-testid=confirm-bought]");
    await page.waitForSelector("[data-testid=done]");
    await page.click("[data-testid=to-home]");
    await has("[data-testid=cat-Kläder]", "201 kr");
  });
  await step("byta demobudget", async () => {
    await page.selectOption("[data-testid=demo-budget]", "tajt");
    await has("[data-testid=left-figure]", "519");
  });
  await step("flikar: Plan, ändra budget bara denna månad", async () => {
    await page.click(".tabbar a[href='/plan']");
    await has("[data-testid=plan-month]", "2026");
    await page.click("[data-testid=budget-Kläder]");
    await page.fill("dialog[open] [data-testid=budget-amount]", "1 000");
    await page.check("dialog[open] input[name=scope][value=month]");
    await page.click("dialog[open] button.btn");
    await has("[data-testid=budget-Kläder]", "1 000 kr");
  });
  await step("Sparat, Transaktioner och Bank öppnas", async () => {
    await page.click(".tabbar a[href='/sparat']");
    await has(".page-head", "Sparat");
    await page.click(".topbar .iconbtn >> nth=0");
    await page.click("dialog[open] a[href='/transaktioner']");
    await has(".page", "ICA");
    await page.click(".topbar .iconbtn >> nth=0");
    await page.click("dialog[open] a[href='/installningar']");
    await has("[data-testid=bank-status]", "Demobank");
  });
  await step("språk: engelska", async () => {
    await page.click("[data-testid=lang-en]");
    await has(".page-head", "Settings");
    await page.click(".tabbar a[href='/']");
    await has(".hero-main", "LEFT UNTIL PAYDAY");
    await page.click("[data-testid=lang-sv] >> visible=true").catch(() => {});
  });
  await step("bilder laddas (bakgrund och logotyp)", async () => {
    const ok = await page.evaluate(() => [...document.images].filter((i) => i.offsetParent !== null).every((i) => i.complete && i.naturalWidth > 0));
    if (!ok) throw new Error("någon bild laddades inte");
  });
  console.log(log.join("\n"));
  if (errors.length) console.log("Fel i sidan:\n  " + [...new Set(errors)].join("\n  "));
  await browser.close();
  server.close();
})();
