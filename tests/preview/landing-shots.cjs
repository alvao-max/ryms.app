/* eslint-disable @typescript-eslint/no-require-imports */
// Tar skärmbilderna som visas i telefonen på landningssidan: node tests/preview/landing-shots.cjs (kräver npm run build)
const { chromium } = require("playwright");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const ROOT = path.resolve(__dirname, "../..");
const BASE = "http://localhost:3240";
(async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ryms-landing-"));
  const env = { ...process.env, RYMS_DATA_DIR: dataDir, RYMS_TODAY: "2026-11-18", RYMS_AI: "off", NODE_ENV: "production", RYMS_ALLOW_DEV_KEY: "1" };
  const server = spawn(process.execPath, [path.join(ROOT, "node_modules/next/dist/bin/next"), "start", "-p", "3240"], { cwd: ROOT, env, stdio: "ignore" });
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(`${BASE}/valkommen`)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "sv-SE" });
    const page = await ctx.newPage();
    const snap = async (name) => {
      await page.addStyleTag({ content: ".demobar{display:none!important}.topbar,.flow-top{margin-top:44px!important}*{animation:none!important}" });
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(ROOT, "public/landing", name), type: "jpeg", quality: 84 });
    };
    await page.goto(`${BASE}/valkommen`);
    await page.click("[data-testid=start-demo]");
    await page.waitForSelector("[data-testid=left-figure]");
    await snap("app-home.jpg");
    await page.goto(`${BASE}/ryms-det`);
    await page.click("[data-testid=sample-jacka]");
    await page.waitForSelector(".flow[data-step=confirm]");
    await page.click("[data-testid=check]");
    await page.waitForSelector("[data-testid=result]");
    await snap("app-answer.jpg");
  } finally {
    await browser.close();
    server.kill();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
  console.log("klart");
})();
