import { Buffer } from "buffer";
// Förenklad krypto för förhandsvisningen. Ingen riktig bank eller inloggning hanteras här.
function sha256bytes(data: Uint8Array): Uint8Array {
  const K = new Uint32Array(64);
  let n = 0;
  for (let c = 2; n < 64; c++) {
    let p = true;
    for (let i = 2; i * i <= c; i++) if (c % i === 0) p = false;
    if (p) K[n++] = (Math.cbrt(c) * 2 ** 32) | 0;
  }
  const H = new Uint32Array(8);
  n = 0;
  for (let c = 2; n < 8; c++) {
    let p = true;
    for (let i = 2; i * i <= c; i++) if (c % i === 0) p = false;
    if (p) H[n++] = (Math.sqrt(c) * 2 ** 32) | 0;
  }
  const len = data.length;
  const padded = new Uint8Array(((len + 9 + 63) >> 6) << 6);
  padded.set(data);
  padded[len] = 0x80;
  const dv = new DataView(padded.buffer);
  dv.setUint32(padded.length - 4, len * 8);
  dv.setUint32(padded.length - 8, Math.floor((len * 8) / 2 ** 32));
  const w = new Uint32Array(64);
  const rotr = (x: number, r: number) => (x >>> r) | (x << (32 - r));
  for (let o = 0; o < padded.length; o += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(o + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const t1 = (h + S1 + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
  }
  const out = new Uint8Array(32);
  const odv = new DataView(out.buffer);
  H.forEach((v, i) => odv.setUint32(i * 4, v));
  return out;
}
const toBytes = (d: string | Uint8Array) => (typeof d === "string" ? new TextEncoder().encode(d) : d);
export function createHash(_alg: string) {
  const parts: Uint8Array[] = [];
  const api = {
    update(d: string | Uint8Array) {
      parts.push(toBytes(d));
      return api;
    },
    digest(enc?: string) {
      const all = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
      let o = 0;
      for (const p of parts) {
        all.set(p, o);
        o += p.length;
      }
      const b = Buffer.from(sha256bytes(all));
      return enc ? b.toString(enc as BufferEncoding) : b;
    },
  };
  return api;
}
export function randomBytes(n: number) {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(n)));
}
export function scryptSync(password: string, salt: Uint8Array, len: number) {
  const h = Buffer.from(sha256bytes(new Uint8Array([...toBytes(password), ...salt])));
  return Buffer.concat([h, h, h]).subarray(0, len);
}
export function timingSafeEqual(a: Uint8Array, b: Uint8Array) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}
const passthrough = () => {
  let buf = Buffer.alloc(0);
  return {
    update(d: string | Uint8Array, enc?: string) {
      buf = Buffer.concat([buf, typeof d === "string" ? Buffer.from(d, enc as BufferEncoding) : Buffer.from(d)]);
      return Buffer.alloc(0);
    },
    final: () => buf,
    getAuthTag: () => Buffer.alloc(16),
    setAuthTag() {},
  };
};
export const createCipheriv = passthrough;
export const createDecipheriv = passthrough;
export function createSign() {
  throw new Error("Inte tillgängligt i förhandsvisningen");
}
