// Bygger webbläsarversionen till en enda fil: preview/dist/index.html
//   node preview/build.mjs
import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const shim = (f) => path.join(here, "shims", f);

const serverToBrowser = {
  name: "ryms-server-to-browser",
  setup(b) {
    b.onLoad({ filter: /[\\/]src[\\/].*\.tsx?$/ }, async (args) => {
      let code = await fs.promises.readFile(args.path, "utf8");
      if (/^\s*"use client"/.test(code)) {
        // Markera klientkomponenter så att förhandsvisningens renderare lämnar dem åt React.
        const names = [...code.matchAll(/export (?:default )?(?:async )?function (\w+)/g)].map((m) => m[1]);
        code += "\n" + names.map((n) => `try { ${n}.$$client = true; } catch {}`).join("\n");
      }
      if (args.path.endsWith(path.join("app", "actions.ts"))) {
        const names = [];
        code = code.replace(/export async function (\w+)/g, (_, n) => (names.push(n), `async function __a_${n}`));
        code += `\nimport { wrapAction as __wrap } from ${JSON.stringify(shim("runtime.ts"))};\n` + names.map((n) => `export const ${n} = __wrap(__a_${n});`).join("\n");
      }
      return { contents: code, loader: args.path.endsWith("x") ? "tsx" : "ts" };
    });
  },
};

const mime = { ".jpg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml" };
const assets = {};
for (const f of ["bg/hero.jpg", "bg/login.jpg", "landing/spiral.jpg", "brand/ryms-wordmark.png", "demo/jacka.svg", "demo/kangor.svg", "demo/horlurar.svg", "demo/lampa.svg"]) {
  assets["/" + f] = `data:${mime[path.extname(f)]};base64,${fs.readFileSync(path.join(root, "public", f)).toString("base64")}`;
}

// Appen startar på välkomstskärmen; med PREVIEW=landing byggs i stället hemsidans landningssida.
const landing = process.env.PREVIEW === "landing";
const out = path.join(here, landing ? "dist-landing" : "dist");
await build({
  entryPoints: [path.join(here, "main.tsx")],
  outdir: out,
  bundle: true,
  minify: true,
  format: "iife",
  target: "es2022",
  jsx: "automatic",
  tsconfig: path.join(root, "tsconfig.json"),
  loader: { ".woff2": "dataurl", ".woff": "dataurl" },
  inject: [shim("globals.ts")],
  define: { "process.env.NODE_ENV": '"production"', __ASSETS__: JSON.stringify(assets), __START__: JSON.stringify(landing ? "/" : "/valkommen"), global: "globalThis" },
  alias: {
    "better-sqlite3": shim("sqlite.ts"),
    "next/headers": shim("next-headers.ts"),
    "next/navigation": shim("next-navigation.ts"),
    "next/link": shim("next-link.tsx"),
    "next/cache": shim("next-cache.ts"),
    "next/server": shim("next-server.ts"),
    "node:crypto": shim("node-crypto.ts"),
    "node:fs": shim("node-fs.ts"),
    "node:path": shim("node-path.ts"),
    fs: shim("node-fs.ts"),
    path: shim("node-path.ts"),
    crypto: shim("node-crypto.ts"),
    "@anthropic-ai/sdk/helpers/zod": shim("anthropic.ts"),
    "@anthropic-ai/sdk": shim("anthropic.ts"),
  },
  plugins: [serverToBrowser],
  logLevel: "warning",
});

const js = fs.readFileSync(path.join(out, "main.js"), "utf8").replace(/<\/script/gi, "<\\/script");
const css = fs.readFileSync(path.join(out, "main.css"), "utf8");
const html = `<!DOCTYPE html>
<html lang="sv"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<title>${landing ? "Ryms – landningssida" : "Ryms"}</title>
<style>${css}</style></head>
<body><div id="app"></div>
<script>${js}</script></body></html>`;
fs.writeFileSync(path.join(out, "index.html"), html);
console.log("index.html", Math.round(html.length / 1024), "kB");
