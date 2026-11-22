import { Buffer } from "buffer";
/** Filer hålls i minnet i webbläsaren. */
export const files = new Map<string, Uint8Array>();
const fs = {
  existsSync: (p: string) => files.has(p) || [...files.keys()].some((k) => k.startsWith(p + "/")),
  mkdirSync() {},
  writeFileSync: (p: string, d: Uint8Array) => void files.set(p, d),
  readFileSync: (p: string) => Buffer.from(files.get(p) ?? new Uint8Array()),
  rmSync: (p: string) => {
    for (const k of [...files.keys()]) if (k === p || k.startsWith(p + "/")) files.delete(k);
  },
  mkdtempSync: (p: string) => p,
};
export default fs;
