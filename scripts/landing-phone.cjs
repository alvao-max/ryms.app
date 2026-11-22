/* eslint-disable @typescript-eslint/no-require-imports */
// Ritar en telefon med appens skärmbild (genomskinlig bakgrund) → assets/landing/phone.png
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.resolve(__dirname, "..");
const shot = fs.readFileSync(path.join(ROOT, "public/landing/app-home.jpg")).toString("base64");
const html = `<!doctype html><html><body style="margin:0;background:transparent">
<div style="width:520px;height:1010px;display:grid;place-items:center;perspective:2600px">
 <div style="position:relative;width:400px;height:860px;transform:rotateY(-9deg) rotateX(3deg) rotateZ(5deg);transform-style:preserve-3d">
  <div style="position:absolute;inset:0;border-radius:68px;background:linear-gradient(115deg,#6d6f73 0%,#2a2b2e 18%,#101113 50%,#3a3b3f 82%,#8a8c90 100%);box-shadow:inset 0 0 0 2px rgba(255,255,255,.22),inset 0 0 0 5px #0b0b0d"></div>
  <div style="position:absolute;left:-4px;top:210px;width:5px;height:64px;border-radius:3px;background:#3a3b3f"></div>
  <div style="position:absolute;left:-4px;top:296px;width:5px;height:64px;border-radius:3px;background:#3a3b3f"></div>
  <div style="position:absolute;right:-4px;top:250px;width:5px;height:104px;border-radius:3px;background:#55575b"></div>
  <div style="position:absolute;inset:11px;border-radius:58px;overflow:hidden;background:#000">
   <img src="data:image/jpeg;base64,${shot}" style="width:100%;height:100%;object-fit:cover;object-position:top;display:block">
   <div style="position:absolute;top:13px;left:50%;width:118px;height:34px;margin-left:-59px;border-radius:20px;background:#050506"></div>
   <div style="position:absolute;top:19px;left:34px;font:600 16px -apple-system,Helvetica,Arial;color:#f5f3ee">9:41</div>
   <div style="position:absolute;inset:0;background:linear-gradient(118deg,rgba(255,255,255,.16) 0%,rgba(255,255,255,0) 26%,rgba(255,255,255,0) 100%)"></div>
  </div>
 </div>
</div></body></html>`;
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 520, height: 1010 }, deviceScaleFactor: 3 })).newPage();
  await p.setContent(html);
  await p.waitForTimeout(300);
  await p.screenshot({ path: path.join(ROOT, "assets/landing/phone.png"), omitBackground: true });
  await b.close();
  console.log("phone.png");
})();
