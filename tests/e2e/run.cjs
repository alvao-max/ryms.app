/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Genomgång av huvudflödet i iPhone-storlek mot en riktig server och en tom databas.
 *   npm run build && npm run test:e2e
 * Skärmbilder sparas i tests/e2e/shots/.
 */
const { chromium, devices } = require("playwright");
const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");
const PORT = Number(process.env.E2E_PORT || 3210);
const BASE = `http://localhost:${PORT}`;
const SHOTS = path.join(__dirname, "shots");
const TODAY = "2026-11-18"; // onsdag: elräkning på fredag, lön på måndag

const results = [];
let failed = 0;
async function step(name, fn) {
  try {
    await fn();
    results.push(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    results.push(`  ✗ ${name}\n      ${String(e.message).split("\n")[0]}`);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
const norm = (s) => s.replace(/ /g, " ").replace(/\s+/g, " ").trim();
async function text(page, sel) {
  return norm(await page.locator(sel).first().innerText());
}
async function expectText(page, sel, needle) {
  const t = await text(page, sel);
  assert(t.includes(needle), `väntade "${needle}" i ${sel}, fick: "${t.slice(0, 220)}"`);
}

async function startServer(dataDir) {
  if (!fs.existsSync(path.join(ROOT, ".next", "BUILD_ID"))) {
    console.log("Bygger appen…");
    const b = spawnSync("npx", ["next", "build"], { cwd: ROOT, stdio: "inherit" });
    if (b.status !== 0) throw new Error("Bygget misslyckades");
  }
  const env = { ...process.env, RYMS_DATA_DIR: dataDir, RYMS_TODAY: TODAY, RYMS_AI: "off", PORT: String(PORT), NODE_ENV: "production", RYMS_ALLOW_DEV_KEY: "1" };
  delete env.ENABLEBANKING_APP_ID;
  const proc = spawn(process.execPath, [path.join(ROOT, "node_modules/next/dist/bin/next"), "start", "-p", String(PORT)], { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"] });
  let log = "";
  proc.stdout.on("data", (d) => (log += d));
  proc.stderr.on("data", (d) => (log += d));
  try {
    await fetch(`${BASE}/valkommen`);
    proc.kill();
    throw new Error(`Port ${PORT} används redan. Stäng den servern eller sätt E2E_PORT.`);
  } catch (e) {
    if (String(e.message).startsWith("Port")) throw e;
  }
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`${BASE}/valkommen`);
      if (r.ok) return { proc, log: () => log };
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  proc.kill();
  throw new Error("Servern startade inte:\n" + log);
}

async function demo(browser) {
  const ctx = await browser.newContext({ ...devices["iPhone 14"], locale: "sv-SE" });
  const page = await ctx.newPage();
  page.on("dialog", (d) => d.accept());
  page.on("pageerror", (e) => results.push(`  ! sidfel: ${e.message}`));
  await page.goto(`${BASE}/valkommen`);
  await page.click("[data-testid=start-demo]");
  await page.waitForURL(`${BASE}/`);
  return { ctx, page };
}
async function switchBudget(page, key) {
  await page.selectOption("[data-testid=demo-budget]", key);
  await page.waitForFunction((k) => document.querySelector("[data-testid=demo-budget]")?.value === k && !document.querySelector("[data-testid=demo-budget]")?.disabled, key);
  await page.waitForLoadState("networkidle");
}
async function sample(page, key) {
  await page.goto(`${BASE}/ryms-det`);
  await page.click(`[data-testid=sample-${key}]`);
  await page.waitForSelector(".flow[data-step=confirm]");
}
async function check(page) {
  await page.click("[data-testid=check]");
  await page.waitForSelector("[data-testid=result]");
}
const shot = (page, name, full = false) => page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: full });

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ryms-e2e-"));
  const server = await startServer(dataDir);
  const browser = await chromium.launch();
  try {
    // ───────────────────────── Demo: hem + huvudflöde
    const { ctx, page } = await demo(browser);

    await step("Välkomstsidan och demon öppnas utan konto eller bank", async () => {
      await expectText(page, ".demobar", "Påhittade uppgifter");
      await expectText(page, "[data-testid=bank-badge]", "DEMOBANK");
      assert(!(await page.content()).includes("Bank ansluten"), "demon får inte visa 'Bank ansluten'");
    });
    await step("Hem: 'Kvar till lön' 6 831 kr och huvudknappen syns utan att skrolla", async () => {
      await expectText(page, "[data-testid=left-figure]", "6 831");
      const box = await page.locator("[data-testid=cta]").boundingBox();
      const vh = page.viewportSize().height;
      assert(box && box.y + box.height < vh - 90, `knappen hamnar under flikfältet (y=${box?.y}, höjd ${vh})`);
      await shot(page, "01-hem");
      await shot(page, "02-hem-hela", true);
    });
    await step("Tryck på en siffra visar uträkningen", async () => {
      await page.click("[data-testid=left-figure]");
      await expectText(page, "dialog[open]", "Disponibelt nu");
      await expectText(page, "dialog[open]", "Elräkningen");
      await expectText(page, "dialog[open]", "Planerat sparande: Resa till Lissabon");
      await shot(page, "03-utrakning");
      await page.click("dialog[open] [aria-label=Stäng]");
    });
    await step("Ett tryck från hem till köpkollen med foto, skärmbild eller egen inmatning", async () => {
      await page.click("[data-testid=cta]");
      await page.waitForSelector(".flow[data-step=start]");
      await expectText(page, ".flow", "Ta en bild");
      await expectText(page, ".flow", "Ladda upp en bild");
      await expectText(page, ".flow", "Skriv själv");
      await shot(page, "04-ryms-det-start");
    });
    await step("Fall 1a: jacka 699 kr mot 900 kr → exakt 201 kr kvar", async () => {
      await page.click("[data-testid=sample-jacka]");
      await page.waitForSelector(".flow[data-step=confirm]");
      assert((await page.inputValue("[data-testid=item]")) === "Vinterjacka", "varan föreslås");
      assert((await page.inputValue("[data-testid=price]")) === "699", "priset föreslås");
      await shot(page, "05-bekrafta");
      await check(page);
      await expectText(page, "[data-testid=headline]", "Ja, det ryms");
      await expectText(page, "[data-testid=answer]", "Du har 900 kr kvar till kläder. Efter köpet på 699 kr har du 201 kr kvar, och ditt planerade sparande på 1 500 kr ryms fortfarande.");
      await shot(page, "06-svar-ja");
      await shot(page, "07-svar-ja-hela", true);
    });
    await step("Samma köp jämförs mot de andra budgetarna (299 kr fattas, 399 kr av reservationen, 180 kr till elräkningen)", async () => {
      const t = await text(page, "[data-testid=compare]");
      assert(t.includes("det fattas 299 kr"), "299 saknas: " + t);
      assert(t.includes("ta 399 kr av pengarna för ”Vinterkängor”"), "399 saknas");
      assert(t.includes("sakna 180 kr till elräkningen på fredag"), "180 saknas");
    });
    await step("Okänt köp från banken: appen frågar, svaret hamnar i rätt kategori och frågan försvinner", async () => {
      await page.goto(`${BASE}/`);
      await expectText(page, "[data-testid=category-ask]", "VAD VAR DET HÄR KÖPET?");
      await expectText(page, "[data-testid=ask-description]", "PRESSBYRÅN CENTRALEN");
      await expectText(page, "[data-testid=category-ask]", "1 av 2");
      await expectText(page, "[data-testid=cat-Mat]", "1 350 kr");
      await shot(page, "29-fraga-kategori", true);
      await page.click("[data-testid=ask-Mat]");
      await page.waitForFunction(() => document.querySelector("[data-testid=ask-description]")?.textContent.includes("BLOMSTERLANDET"));
      await expectText(page, "[data-testid=cat-Mat]", "1 291 kr");
      await page.click("[data-testid=ask-Hem]");
      await page.waitForSelector("[data-testid=category-ask]", { state: "detached" });
      await expectText(page, "[data-testid=cat-Hem]", "351 kr");
    });
    await step("Inget ändras i budgeten förrän användaren bekräftar", async () => {
      await page.goto(`${BASE}/`);
      await expectText(page, "[data-testid=cat-Kläder]", "900 kr");
      // Cirklarna överst visar använt belopp, och ringen andelen av budgeten (600 av 1 500 kr = 40 %).
      await expectText(page, "[data-testid=chip-Kläder]", "600");
      const dash = await page.locator("[data-testid=chip-Kläder] circle.fill").getAttribute("stroke-dasharray");
      const [on, all] = dash.split(" ").map(Number);
      assert(Math.abs(on / all - 0.4) < 0.005, `ringen visar ${on / all}, väntade 0,4`);
    });

    // ───────────────────────── Fall 4: rätta pris, spara, kolla igen
    await step("Fall 4: rätta ett felläst pris och spara till senare (budgeten oförändrad)", async () => {
      await sample(page, "jacka");
      await page.fill("[data-testid=price]", "6 990"); // som om bilden lästs fel
      await check(page);
      await expectText(page, "[data-testid=headline]", "Det ryms inte");
      await page.click("[data-testid=edit]");
      await page.fill("[data-testid=price]", "699");
      await check(page);
      await expectText(page, "[data-testid=answer]", "201 kr kvar");
      await page.click("[data-testid=save]");
      await page.click("[data-testid=confirm-save]");
      await page.waitForSelector("[data-testid=done]");
      await expectText(page, "[data-testid=done]", "Budgeten är oförändrad");
      await page.goto(`${BASE}/sparat`);
      await expectText(page, "[data-testid=saved-item]", "Vinterjacka");
      await expectText(page, "[data-testid=saved-item]", "699 kr");
      await expectText(page, "[data-testid=saved-verdict]", "Ryms nu");
      await shot(page, "08-sparat");
    });
    await step("Fall 6a: ändra bara november – oktober och december ligger kvar", async () => {
      await page.goto(`${BASE}/plan`);
      await expectText(page, "[data-testid=plan-month]", "november 2026");
      await shot(page, "09-plan", true);
      await page.click("[data-testid=budget-Kläder]");
      await page.fill("dialog[open] [data-testid=budget-amount]", "1 000");
      await page.check("dialog[open] input[name=scope][value=month]");
      await shot(page, "10-plan-andra");
      await page.click("dialog[open] button.btn");
      await page.waitForSelector("dialog[open]", { state: "detached" }).catch(() => {});
      await page.waitForFunction(() => document.querySelector("[data-testid=budget-Kläder]")?.textContent.replace(/ /g, " ").includes("1 000 kr"));
      await expectText(page, "[data-testid=budget-Kläder]", "ändrad bara i november");
      await page.goto(`${BASE}/plan?m=2026-12`);
      await expectText(page, "[data-testid=budget-Kläder]", "1 500 kr");
      await page.goto(`${BASE}/plan?m=2026-10`);
      await expectText(page, "[data-testid=budget-Kläder]", "1 500 kr");
    });
    await step("Fall 4 (forts.): 'Kolla igen' räknar mot den aktuella budgeten → nu fattas 299 kr", async () => {
      await page.goto(`${BASE}/sparat`);
      await expectText(page, "[data-testid=saved-verdict]", "Ryms inte nu");
      await page.click("[data-testid=recheck]");
      await page.waitForSelector(".flow[data-step=confirm]");
      assert((await page.inputValue("[data-testid=price]")) === "699", "sparat pris används");
      await check(page);
      await expectText(page, "[data-testid=answer]", "Du har 400 kr kvar till kläder. Köpet kostar 699 kr, så det fattas 299 kr i budgeten för kläder.");
      await shot(page, "11-svar-fattas");
    });
    await step("Flytt mellan kategorier föreslås och kräver bekräftelse", async () => {
      await expectText(page, "[data-testid=move]", "Flytta 299 kr från mat");
      await page.click("[data-testid=move]");
      await page.click("[data-testid=confirm-move]");
      await page.waitForFunction(() => document.querySelector("[data-testid=headline]")?.textContent.includes("Ja, det ryms"));
      await expectText(page, "[data-testid=answer]", "Efter köpet på 699 kr har du 0 kr kvar");
    });

    // ───────────────────────── Fall 2: planerade kängor
    await step("Fall 2: 1 500 kr varav 1 200 reserverat → 300 kr kvar till annat; jackan tar 399 kr av reservationen", async () => {
      await page.goto(`${BASE}/`);
      await switchBudget(page, "kangor");
      await expectText(page, "[data-testid=cat-Kläder]", "300 kr");
      await expectText(page, "[data-testid=cat-Kläder]", "1 200 kr reserverat för Vinterkängor");
      await shot(page, "12-hem-reserverat");
      await sample(page, "jacka");
      await check(page);
      await expectText(page, "[data-testid=headline]", "Det tar av en reservation");
      await expectText(page, "[data-testid=answer]", "skulle ta 399 kr av pengarna för ”Vinterkängor”");
      await shot(page, "13-svar-reservation");
    });
    await step("Fall 2: 'Är det här ”Vinterkängor” som du planerade för?' → köpet använder reservationen en gång", async () => {
      await sample(page, "kangor");
      await page.waitForSelector("[data-testid=planned-question]");
      await expectText(page, "[data-testid=planned-question]", "Är det här ”Vinterkängor” som du planerade för?");
      await shot(page, "14-planerat-fraga");
      await page.click("[data-testid=planned-yes]");
      await check(page);
      await expectText(page, "[data-testid=answer]", "Du har reserverat 1 200 kr för ”Vinterkängor”. Köpet på 1 149 kr ryms i reservationen");
      await page.click("[data-testid=bought]");
      await expectText(page, "dialog[open]", "Ingenting betalas via Ryms");
      await page.click("[data-testid=confirm-bought]");
      await page.waitForSelector("[data-testid=done]");
      await page.click("[data-testid=to-home]");
      await page.waitForURL(`${BASE}/`);
      await expectText(page, "[data-testid=cat-Kläder]", "351 kr");
      await expectText(page, "[data-testid=cat-Kläder]", "1 149 kr av 1 500 kr använt");
    });
    await step("Fall 5: bankimporten efter ett manuellt köp ger ett köp, även när importen upprepas", async () => {
      await page.goto(`${BASE}/installningar`);
      const sync = page.locator("button", { hasText: "Hämta från demobanken" });
      await sync.click();
      await page.waitForSelector(".okmsg");
      await expectText(page, ".okmsg", "matchades mot banken");
      await sync.click();
      await page.waitForFunction(() => document.querySelector(".okmsg")?.textContent.includes("Inget nytt"));
      await page.goto(`${BASE}/transaktioner`);
      const n = await page.locator(".row", { hasText: "Vinterkängor" }).count();
      assert(n === 1, `väntade 1 rad för kängorna, fick ${n}`);
      await expectText(page, ".row:has-text('Vinterkängor')", "bekräftat av banken");
      await shot(page, "15-transaktioner", true);
      await page.goto(`${BASE}/`);
      await expectText(page, "[data-testid=cat-Kläder]", "351 kr");
    });

    // ───────────────────────── Fall 3: räkning före lön
    await step("Fall 3: ryms i kategorin, men 180 kr saknas till elräkningen på fredag", async () => {
      await switchBudget(page, "tajt");
      await expectText(page, "[data-testid=left-figure]", "519");
      await shot(page, "16-hem-tajt");
      await sample(page, "jacka");
      await check(page);
      await expectText(page, "[data-testid=headline]", "Vänta till efter lön");
      await expectText(page, "[data-testid=answer]", "Det ryms i budgeten för kläder. Du har 900 kr kvar till kläder. Efter köpet på 699 kr har du 201 kr kvar. Däremot skulle du sakna 180 kr till elräkningen på fredag. Efter lönen på måndag kan du kolla igen.");
      await shot(page, "17-svar-rakning");
      await page.click("[data-testid=skip]");
      await page.waitForSelector("[data-testid=done]");
      await expectText(page, "[data-testid=done]", "Inga pengar har flyttats till sparande");
    });

    // ───────────────────────── Bildanalysens frågor
    await step("Flera priser → en kort fråga; inget pris → frågar, hittar aldrig på", async () => {
      await sample(page, "horlurar");
      await expectText(page, "[data-testid=question]", "Jag ser flera priser. Vilket gäller?");
      assert((await page.inputValue("[data-testid=price]")) === "", "priset ska vara tomt tills användaren valt");
      await shot(page, "18-fraga-flera-priser");
      await page.click(".pill:has-text('899')");
      assert((await page.inputValue("[data-testid=price]")) === "899", "valt pris fylls i");
      await sample(page, "lampa");
      await expectText(page, "[data-testid=question]", "Jag ser inget pris i bilden. Vad kostar den?");
      assert((await page.inputValue("[data-testid=price]")) === "", "inget pris hittas på");
      await page.click("[data-testid=check]");
      await expectText(page, ".error", "Ange vad den kostar");
    });

    // ───────────────────────── Bilder, uppladdning och åtkomst
    let imageId = null;
    await step("Uppladdning: fel filtyp avvisas, analys kräver godkännande, bild sparas bara på begäran", async () => {
      await page.goto(`${BASE}/`);
      const r = await page.evaluate(async () => {
        const c = document.createElement("canvas");
        c.width = c.height = 40;
        c.getContext("2d").fillRect(0, 0, 40, 40);
        const jpg = await new Promise((res) => c.toBlob(res, "image/jpeg"));
        const post = async (url, blob, name) => {
          const fd = new FormData();
          fd.set("image", new File([blob], name, { type: blob.type }));
          const x = await fetch(url, { method: "POST", body: fd });
          return { status: x.status, body: await x.json() };
        };
        return {
          noConsent: await post("/api/analyze", jpg, "a.jpg"),
          fake: await post("/api/images", new Blob(["<svg onload=alert(1)>"], { type: "image/jpeg" }), "x.jpg"),
          saved: await post("/api/images", jpg, "a.jpg"),
        };
      });
      assert(r.noConsent.status === 403, "analys utan godkännande ska nekas");
      assert(r.fake.status === 400 && /Filtypen stöds inte/.test(r.fake.body.error), "falsk bild ska avvisas");
      assert(r.saved.status === 200 && r.saved.body.imageId, "riktig bild sparas");
      imageId = r.saved.body.imageId;
      const own = await page.evaluate(async (id) => (await fetch(`/api/images/${id}`)).status, imageId);
      assert(own === 200, "ägaren ser sin bild");
    });

    // ───────────────────────── Nytt konto: onboarding, utan bank och utan AI
    const ctx2 = await browser.newContext({ ...devices["iPhone 14"], locale: "sv-SE" });
    const p2 = await ctx2.newPage();
    p2.on("dialog", (d) => d.accept());
    await step("Skapa konto → kom igång → översikt med eget saldo", async () => {
      await p2.goto(`${BASE}/skapa-konto`);
      await p2.fill("input[name=name]", "Maja");
      await p2.fill("input[name=email]", "maja@example.com");
      await p2.fill("input[name=password]", "ett-langt-losenord");
      await p2.click("button.btn");
      await p2.waitForURL(`${BASE}/kom-igang`);
      await shot(p2, "19-kom-igang");
      await p2.click("[data-testid=ob-next]");
      await p2.fill("[data-testid=ob-payday]", "2026-11-25");
      await p2.fill("[data-testid=ob-income]", "27 500");
      await p2.click("[data-testid=ob-next]");
      await p2.fill("[data-testid=ob-bill-0]", "7 200");
      await p2.click("[data-testid=ob-next]");
      await p2.fill("[data-testid=ob-cat-Kläder]", "1 500");
      await shot(p2, "20-kom-igang-budget");
      await p2.click("[data-testid=ob-next]");
      await p2.click("[data-testid=ob-next]");
      await p2.fill("[data-testid=ob-balance]", "4 000");
      await p2.click("[data-testid=ob-next]");
      await p2.waitForURL(`${BASE}/`);
      await expectText(p2, "[data-testid=left-figure]", "4 000");
      await expectText(p2, "[data-testid=bank-badge]", "EGET SALDO");
      await expectText(p2, ".hero-main", "Uppskattning");
      await shot(p2, "21-hem-eget-saldo", true);
    });
    await step("Manuell köpkoll fungerar utan bank och utan AI-tjänst", async () => {
      await p2.goto(`${BASE}/ryms-det`);
      await expectText(p2, ".flow", "Bildanalysen är inte påslagen");
      await p2.click("[data-testid=manual]");
      await p2.fill("[data-testid=item]", "Jacka");
      await p2.fill("[data-testid=price]", "699");
      await p2.selectOption("[data-testid=category]", { label: "Kläder" });
      await check(p2);
      await expectText(p2, "[data-testid=answer]", "Du har 1 500 kr kvar till kläder. Efter köpet på 699 kr har du 801 kr kvar");
      await p2.click("[data-testid=bought]");
      await p2.click("[data-testid=confirm-bought]");
      await p2.waitForSelector("[data-testid=done]");
      await p2.goto(`${BASE}/`);
      await expectText(p2, "[data-testid=left-figure]", "3 301");
      await expectText(p2, "[data-testid=cat-Kläder]", "801 kr");
    });
    await step("Bankkoppling: förklaring före anslutning; visar aldrig 'Bank ansluten' utan riktig anslutning", async () => {
      await p2.goto(`${BASE}/installningar/bank`);
      await expectText(p2, ".page", "Enable Banking");
      await expectText(p2, ".page", "Ryms kan inte: betala, föra över eller flytta pengar");
      await expectText(p2, ".page", "inte aktiverad i den här installationen");
      await shot(p2, "22-anslut-bank", true);
      await p2.goto(`${BASE}/installningar`);
      await expectText(p2, "[data-testid=bank-status]", "Ingen bank ansluten");
      const cb = await p2.goto(`${BASE}/api/bank/callback?code=x&state=pahittad`);
      assert(cb.url().includes("fel=okand"), "okänt state ska avvisas");
      await p2.goto(`${BASE}/installningar`);
      await expectText(p2, "[data-testid=bank-status]", "Ingen bank ansluten");
    });
    await step("Fall 6c: en annan användare (och utloggad) kommer inte åt bilden, sparade saker eller transaktioner", async () => {
      const other = await p2.evaluate(async (id) => (await fetch(`/api/images/${id}`)).status, imageId);
      assert(other === 404, `annan användare fick ${other} på bilden`);
      const anon = await fetch(`${BASE}/api/images/${imageId}`);
      assert(anon.status === 404, "utloggad ska få 404");
      await p2.goto(`${BASE}/sparat`);
      assert(!(await p2.content()).includes("Vinterjacka"), "andra användarens sparade sak syns");
      await p2.goto(`${BASE}/transaktioner`);
      const c = await p2.content();
      assert(!c.includes("ICA NÄRA") && !c.includes("Vinterkängor"), "andra användarens transaktioner syns");
      const sak = await page.evaluate(() => fetch("/sparat").then((r) => r.text()).then((t) => (t.match(/ryms-det\?sak=([0-9a-f-]{36})/) || [])[1]));
      if (sak) {
        await p2.goto(`${BASE}/ryms-det?sak=${sak}`);
        assert(!(await p2.content()).includes("Vinterjacka"), "sparad sak läcker via id");
      }
      const anonHome = await fetch(`${BASE}/plan`, { redirect: "manual" });
      assert(anonHome.status >= 300 && anonHome.status < 400, "utloggad ska skickas till välkomstsidan");
    });

    // ───────────────────────── Fall 6b: radera bilder, koppla från bank
    await step("Fall 6b: radera sparade bilder", async () => {
      await page.goto(`${BASE}/installningar`);
      await expectText(page, "[data-testid=image-count]", "1 st");
      await shot(page, "23-bank-och-integritet", true);
      await page.locator("button", { hasText: "Radera alla sparade bilder" }).click();
      await page.waitForFunction(() => document.querySelector("[data-testid=image-count]")?.textContent.includes("0 st"));
      const gone = await page.evaluate(async (id) => (await fetch(`/api/images/${id}`)).status, imageId);
      assert(gone === 404, "bilden ska vara borta");
      const files = fs.existsSync(path.join(dataDir, "uploads")) ? fs.readdirSync(path.join(dataDir, "uploads"), { recursive: true }).filter((f) => /\.(jpg|png|webp)$/.test(String(f))) : [];
      assert(files.length === 0, "bildfilen ligger kvar på disk");
    });
    await step("Fall 6b: koppla från banken stoppar hämtningar; radering av bankdata är ett eget steg", async () => {
      await page.locator("button", { hasText: "Koppla från demobanken" }).click();
      await page.waitForFunction(() => document.querySelector("[data-testid=bank-status]")?.textContent.includes("frånkopplad"));
      assert((await page.locator("button", { hasText: "Hämta från demobanken" }).count()) === 0, "hämtning ska inte gå efter frånkoppling");
      await page.goto(`${BASE}/transaktioner`);
      await expectText(page, ".page", "ICA NÄRA");
      await page.goto(`${BASE}/installningar`);
      await page.locator("button", { hasText: "Radera importerad bankdata" }).click();
      await page.waitForFunction(() => document.querySelector("[data-testid=bank-status]")?.textContent.includes("Ingen bank ansluten"));
      await page.goto(`${BASE}/transaktioner`);
      assert(!(await page.content()).includes("ICA NÄRA"), "bankdata ska vara raderad");
    });
    await step("Radera kontot tar bort allt och loggar ut", async () => {
      await p2.goto(`${BASE}/installningar`);
      await p2.locator("button", { hasText: "Radera kontot…" }).click();
      await p2.fill("dialog[open] input[name=confirm]", "RADERA");
      await p2.locator("dialog[open] button", { hasText: "Radera kontot för gott" }).click();
      await p2.waitForURL(/valkommen/);
      await p2.goto(`${BASE}/logga-in`);
      await p2.fill("input[name=email]", "maja@example.com");
      await p2.fill("input[name=password]", "ett-langt-losenord");
      await p2.click("button.btn");
      await expectText(p2, ".error", "Fel e-postadress eller lösenord");
    });

    // ───────────────────────── Dator
    await step("Endast mobil: på en bred skärm visas appen som en telefonbred kolumn", async () => {
      const d = await browser.newContext({ viewport: { width: 1320, height: 860 }, deviceScaleFactor: 1, locale: "sv-SE" });
      const dp = await d.newPage();
      await dp.goto(`${BASE}/valkommen`);
      await dp.click("[data-testid=start-demo]");
      await dp.waitForURL(`${BASE}/`);
      const shell = await dp.locator(".shell").boundingBox();
      assert(shell.width <= 481, `kolumnen är ${shell.width}px bred`);
      await d.close();
    });
    await step("Språk: byt till engelska och tillbaka; svaret och siffrorna följer med", async () => {
      const c = await browser.newContext({ ...devices["iPhone 14"], locale: "sv-SE" });
      const ep = await c.newPage();
      await ep.goto(`${BASE}/valkommen`);
      await expectText(ep, ".welcome", "Prova demon");
      await ep.click("[data-testid=lang-en]");
      await ep.waitForFunction(() => document.body.innerText.includes("Try the demo"));
      await shot(ep, "26-welcome-en");
      await ep.click("[data-testid=start-demo]");
      await ep.waitForURL(`${BASE}/`);
      await expectText(ep, ".hero-main", "LEFT UNTIL PAYDAY");
      await expectText(ep, "[data-testid=left-figure]", "6 831");
      await expectText(ep, "[data-testid=cat-Clothes]", "900 kr");
      await shot(ep, "27-home-en");
      await ep.goto(`${BASE}/ryms-det`);
      await ep.click("[data-testid=sample-jacka]");
      await ep.waitForSelector(".flow[data-step=confirm]");
      await ep.click("[data-testid=check]");
      await ep.waitForSelector("[data-testid=result]");
      await expectText(ep, "[data-testid=headline]", "Yes, it fits");
      await expectText(ep, "[data-testid=answer]", "You have 900 kr left for clothes. After this 699 kr purchase you have 201 kr left");
      await shot(ep, "28-answer-en");
      await ep.goto(`${BASE}/installningar`);
      await ep.click("[data-testid=lang-sv]");
      await ep.waitForFunction(() => document.body.innerText.includes("Inställningar"));
      await c.close();
    });
    await step("Valuta: byts i inställningarna och gäller alla belopp, utan omräkning", async () => {
      const c = await browser.newContext({ ...devices["iPhone 14"], locale: "sv-SE" });
      const cp = await c.newPage();
      await cp.goto(`${BASE}/valkommen`);
      assert((await cp.locator("[data-testid=currency]").count()) === 0, "valutaval ska inte finnas på välkomstsidan");
      await cp.click("[data-testid=start-demo]");
      await cp.waitForURL(`${BASE}/`);
      assert((await cp.locator("[data-testid=lang]").count()) === 0, "språkval ska inte finnas på startsidan");
      await cp.goto(`${BASE}/installningar`);
      await cp.selectOption("[data-testid=currency]", "EUR");
      await cp.waitForFunction(() => document.body.innerText.replace(/\u00a0/g, " ").includes("9 480 €"));
      await cp.goto(`${BASE}/`);
      await expectText(cp, "[data-testid=cat-Kläder]", "900 €");
      await expectText(cp, ".hero-main", "6 831 €");
      await cp.goto(`${BASE}/installningar`);
      await cp.selectOption("[data-testid=currency]", "USD");
      await cp.waitForFunction(() => document.body.innerText.includes("$9"));
      await cp.selectOption("[data-testid=currency]", "SEK");
      await cp.waitForFunction(() => document.body.innerText.replace(/\u00a0/g, " ").includes("9 480 kr"));
      await c.close();
    });
    await step("Landningssidan: fungerar på dator och mobil, och leder till App Store", async () => {
      for (const [w, h] of [[1440, 900], [390, 780]]) {
        const c = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: w > 1000 ? 1 : 2, locale: "sv-SE" });
        const lp = await c.newPage();
        await lp.goto(`${BASE}/`);
        await expectText(lp, "[data-testid=landing] h1", "Ryms det?");
        await expectText(lp, "[data-testid=landing]", "Från prislapp till svar på några sekunder");
        const over = await lp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        assert(over <= 1, `landningssidan är ${over}px för bred vid ${w}px`);
        const imgs = await lp.evaluate(() => [...document.images].filter((i) => i.offsetParent !== null).every((i) => i.complete && i.naturalWidth > 0));
        assert(imgs, "en bild på landningssidan laddades inte");
        await lp.waitForTimeout(400);
        await lp.screenshot({ path: path.join(SHOTS, w > 1000 ? "30-landning-dator.png" : "31-landning-mobil.png") });
        await lp.screenshot({ path: path.join(SHOTS, w > 1000 ? "32-landning-dator-hela.png" : "33-landning-mobil-hela.png"), fullPage: true });
        if (w > 1000) {
          const copy = await lp.locator(".lp-hero-copy").boundingBox();
          const photo = await lp.locator(".lp-hero-photo").boundingBox();
          assert(photo.width >= 1439 && copy.x + copy.width < 1440 * 0.3, "på dator ska fotot fylla bredden och texten stå till vänster om telefonen");
        }
        // Hemsidan leder till App Store – ingen demo och ingen inloggning här.
        assert((await lp.locator("[data-testid=app-store]").count()) === 1, "App Store-knappen saknas i hjälten");
        assert((await lp.locator("[data-testid=start-demo]").count()) === 0, "demon ska inte finnas på landningssidan");
        assert(!(await lp.locator("[data-testid=landing]").innerText()).includes("Logga in"), "inloggning ska inte finnas på landningssidan");
        if (w < 1000) {
          const photo = await lp.locator(".lp-hero-photo").boundingBox();
          const h1 = await lp.locator(".lp-hero-copy h1").boundingBox();
          assert(photo.y < 5 && h1.y > photo.y + 200, "på mobil ska bilden ligga överst och rubriken under");
        }
        await c.close();
      }
    });
    await step("Nedre menyn krymper när man skrollar ned och växer tillbaka när man skrollar upp", async () => {
      const c = await browser.newContext({ ...devices["iPhone 14"], locale: "sv-SE" });
      const tp = await c.newPage();
      await tp.goto(`${BASE}/valkommen`);
      await tp.click("[data-testid=start-demo]");
      await tp.waitForSelector("[data-testid=left-figure]");
      const cls = () => tp.locator("[data-testid=tabbar]").getAttribute("class");
      assert(!(await cls()).includes("compact"), "menyn ska vara fullstor överst");
      await tp.mouse.wheel(0, 700);
      await tp.waitForFunction(() => document.querySelector("[data-testid=tabbar]").className.includes("compact"));
      await tp.mouse.wheel(0, -200);
      await tp.waitForFunction(() => !document.querySelector("[data-testid=tabbar]").className.includes("compact"));
      await tp.click(".tabbar a[href='/plan']");
      await tp.waitForSelector("[data-testid=plan-month]");
      await c.close();
    });
    await step("Ingen sida skrollar i sidled på iPhone", async () => {
      const { ctx: c3, page: p3 } = await demo(browser);
      for (const u of ["/", "/plan", "/sparat", "/transaktioner", "/installningar", "/installningar/bank", "/ryms-det"]) {
        await p3.goto(BASE + u);
        const over = await p3.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        assert(over <= 1, `${u} är ${over}px för bred`);
      }
      await c3.close();
    });

    await ctx.close();
    await ctx2.close();
  } finally {
    await browser.close();
    server.proc.kill();
    try {
      fs.rmSync(dataDir, { recursive: true, force: true });
    } catch {}
  }
  console.log(results.join("\n"));
  console.log(failed ? `\n${failed} steg misslyckades.` : `\nAlla ${results.length} steg gick igenom.`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
