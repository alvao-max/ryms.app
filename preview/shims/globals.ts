import { Buffer as B } from "buffer";
const g = globalThis as unknown as { Buffer?: unknown; process?: unknown };
g.Buffer ??= B;
g.process ??= { env: { RYMS_DB: ":memory:", RYMS_ALLOW_DEV_KEY: "1", RYMS_AI: "off" }, cwd: () => "/" };
export const Buffer = B;
export const process = g.process as { env: Record<string, string | undefined>; cwd: () => string };

// Webbläsarens Buffer saknar "base64url".
const proto = B.prototype as unknown as { toString: (enc?: string, ...r: unknown[]) => string };
const orig = proto.toString;
proto.toString = function (enc?: string, ...r: unknown[]) {
  if (enc === "base64url") return orig.call(this, "base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return orig.call(this, enc, ...r);
};
