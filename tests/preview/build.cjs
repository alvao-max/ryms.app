/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Bygger en förhandsvisning: riktiga skärmbilder av appen i telefonstorlek, på svenska och engelska,
 * samlade i en fristående HTML-sida (tests/preview/ryms-preview.html).
 *   npm run build && node tests/preview/build.cjs
 */
const { chromium, devices } = require("playwright");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");
const PORT = 3220;
const BASE = `http://localhost:${PORT}`;

async function startServer(dataDir) {
  const env = { ...process.env, RYMS_DATA_DIR: dataDir, RYMS_TODAY: "2026-11-18", RYMS_AI: "off", NODE_ENV: "production", RYMS_ALLOW_DEV_KEY: "1" };
  const proc = spawn(process.execPath, [path.join(ROOT, "node_modules/next/dist/bin/next"), "start", "-p", String(PORT)], { cwd: ROOT, env, stdio: "ignore" });
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(`${BASE}/valkommen`)).ok) return proc;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  proc.kill();
  throw new Error("Servern startade inte");
}

const SCREENS = [
  ["hem", "Hem", "Home"],
  ["utrakning", "Uträkning", "Calculation"],
  ["start", "Ryms det?", "Ryms det?"],
  ["bekrafta", "Bekräfta", "Confirm"],
  ["svar-ja", "Svar: ryms", "Answer: fits"],
  ["svar-rakning", "Svar: räkning före lön", "Answer: bill before payday"],
  ["svar-reservation", "Svar: reservation", "Answer: reservation"],
  ["plan", "Plan", "Plan"],
  ["sparat", "Sparat", "Saved"],
  ["transaktioner", "Transaktioner", "Transactions"],
  ["bank", "Inställningar", "Settings"],
  ["valkommen", "Välkommen", "Welcome"],
];

async function capture(browser, lang) {
  const shots = {};
  const ctx = await browser.newContext({ ...devices["iPhone 14"], deviceScaleFactor: 2, locale: "sv-SE" });
  const page = await ctx.newPage();
  const snap = async (key, full = true) => {
    if (full) await page.addStyleTag({ content: ".tabbar{display:none!important}.shell{padding-bottom:24px!important}" });
    await page.waitForTimeout(250);
    shots[key] = (await page.screenshot({ type: "jpeg", quality: 72, fullPage: full })).toString("base64");
  };
  const budget = async (key) => {
    await page.selectOption("[data-testid=demo-budget]", key);
    await page.waitForFunction((k) => document.querySelector("[data-testid=demo-budget]")?.value === k && !document.querySelector("[data-testid=demo-budget]")?.disabled, key);
    await page.waitForLoadState("networkidle");
  };
  const sample = async (key) => {
    await page.goto(`${BASE}/ryms-det`);
    await page.click(`[data-testid=sample-${key}]`);
    await page.waitForSelector(".flow[data-step=confirm]");
  };
  const check = async () => {
    await page.click("[data-testid=check]");
    await page.waitForSelector("[data-testid=result]");
  };

  await page.goto(`${BASE}/valkommen`);
  if (lang === "en") {
    await page.click("[data-testid=lang-en]");
    await page.waitForFunction(() => document.documentElement.lang === "en");
  }
  await snap("valkommen", false);
  await page.click("[data-testid=start-demo]");
  await page.waitForURL(`${BASE}/`);
  await snap("hem", false);
  await page.click("[data-testid=left-figure]");
  await snap("utrakning", false);
  await page.goto(`${BASE}/ryms-det`);
  await snap("start", false);
  await sample("jacka");
  await snap("bekrafta", false);
  await check();
  await snap("svar-ja");
  await page.click("[data-testid=save]");
  await page.click("[data-testid=confirm-save]");
  await page.waitForSelector("[data-testid=done]");
  await page.goto(`${BASE}/plan`);
  await snap("plan");
  await page.goto(`${BASE}/sparat`);
  await snap("sparat");
  await page.goto(`${BASE}/transaktioner`);
  await snap("transaktioner");
  await page.goto(`${BASE}/installningar`);
  await snap("bank");
  await page.goto(`${BASE}/`);
  await budget("kangor");
  await sample("jacka");
  await check();
  await snap("svar-reservation");
  await page.goto(`${BASE}/`);
  await budget("tajt");
  await sample("jacka");
  await check();
  await snap("svar-rakning");
  await ctx.close();
  return shots;
}

(async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ryms-preview-"));
  const server = await startServer(dataDir);
  const browser = await chromium.launch();
  let data;
  try {
    data = { sv: await capture(browser, "sv"), en: await capture(browser, "en") };
  } finally {
    await browser.close();
    server.kill();
    try {
      fs.rmSync(dataDir, { recursive: true, force: true });
    } catch {}
  }
  const html = `<!DOCTYPE html>
<html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ryms – förhandsvisning</title>
<style>
  :root{color-scheme:dark;--bg:#0b0e0d;--panel:#151917;--line:rgba(244,240,230,.12);--text:#f4f0e6;--muted:rgba(244,240,230,.62);--accent:#bba6f2}
  *{box-sizing:border-box} html,body{margin:0;background:var(--bg);color:var(--text);font:15px/1.45 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
  .wrap{max-width:980px;margin:0 auto;padding:22px 18px 40px;display:grid;gap:22px;grid-template-columns:minmax(0,1fr)}
  header{display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between}
  h1{font-size:20px;margin:0;font-weight:600;letter-spacing:-.01em} header p{margin:2px 0 0;color:var(--muted);font-size:13px}
  .seg{display:inline-flex;padding:3px;border-radius:999px;background:var(--panel);border:1px solid var(--line)}
  .seg button{all:unset;cursor:pointer;padding:7px 14px;border-radius:999px;font-size:13px;color:var(--muted)}
  .seg button[aria-pressed=true]{background:var(--text);color:#15130f;font-weight:600}
  .seg button:focus-visible,nav button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
  .main{display:grid;gap:20px;grid-template-columns:minmax(0,1fr)}
  nav{display:flex;gap:8px;overflow-x:auto;padding-bottom:4px;scrollbar-width:thin}
  nav button{all:unset;cursor:pointer;white-space:nowrap;padding:9px 14px;border-radius:999px;border:1px solid var(--line);font-size:13.5px;color:var(--muted)}
  nav button[aria-current=true]{background:var(--panel);color:var(--text);border-color:rgba(187,166,242,.5)}
  .phone{justify-self:center;width:min(100%,360px);aspect-ratio:390/700;border-radius:44px;padding:10px;background:#1c1f1d;border:1px solid rgba(255,255,255,.14);box-shadow:0 30px 80px rgba(0,0,0,.5)}
  .screen{width:100%;height:100%;border-radius:34px;overflow-y:auto;overflow-x:hidden;background:#000;scrollbar-width:none}
  .screen::-webkit-scrollbar{display:none} .screen img{display:block;width:100%;height:auto}
  .hint{text-align:center;color:var(--muted);font-size:12.5px;margin:0}
  @media (min-width:820px){.main{grid-template-columns:230px minmax(0,1fr);align-items:start}nav{flex-direction:column;overflow:visible}nav button{white-space:normal}}
</style></head><body><div class="wrap">
<header><div><h1>Ryms – förhandsvisning</h1><p>Riktiga skärmbilder av appen i telefonstorlek. Skrolla inne i telefonen.</p></div>
<div class="seg" role="group" aria-label="Språk"><button data-lang="sv" aria-pressed="true">Svenska</button><button data-lang="en" aria-pressed="false">English</button></div></header>
<div class="main"><nav id="nav" aria-label="Skärmar"></nav>
<div><div class="phone"><div class="screen" id="screen" tabindex="0"><img id="img" alt=""></div></div><p class="hint" id="hint"></p></div></div>
</div>
<script>
const SCREENS=${JSON.stringify(SCREENS)};
const SHOTS=${JSON.stringify(data)};
let lang="sv",cur=SCREENS[0][0];
try{lang=localStorage.getItem("ryms-preview-lang")||"sv"}catch{}
const nav=document.getElementById("nav"),img=document.getElementById("img"),screen=document.getElementById("screen"),hint=document.getElementById("hint");
function render(){
  nav.innerHTML="";
  for(const [key,sv,en] of SCREENS){const b=document.createElement("button");b.textContent=lang==="en"?en:sv;b.setAttribute("aria-current",String(key===cur));b.onclick=()=>{cur=key;location.hash=key;render()};nav.appendChild(b)}
  const s=SCREENS.find(x=>x[0]===cur);img.src="data:image/jpeg;base64,"+SHOTS[lang][cur];img.alt=(lang==="en"?s[2]:s[1]);screen.scrollTop=0;
  hint.textContent=lang==="en"?"Demo data is fictional.":"Demouppgifterna är påhittade.";
  document.querySelectorAll("[data-lang]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.lang===lang)));
}
document.querySelectorAll("[data-lang]").forEach(b=>b.onclick=()=>{lang=b.dataset.lang;try{localStorage.setItem("ryms-preview-lang",lang)}catch{};render()});
function fromHash(){const h=location.hash.slice(1);if(SCREENS.some(s=>s[0]===h))cur=h;render()}
addEventListener("hashchange",fromHash);fromHash();
</script></body></html>`;
  const out = path.join(__dirname, "ryms-preview.html");
  fs.writeFileSync(out, html);
  console.log("Skrev", out, Math.round(html.length / 1024), "kB");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
