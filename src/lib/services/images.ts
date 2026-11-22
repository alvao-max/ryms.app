import fs from "node:fs";
import { bi } from "../i18n";
import path from "node:path";
import { dataDir, getDb, newId } from "../db";
import { nowISO } from "../dates";

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export type ImageMime = "image/jpeg" | "image/png" | "image/webp";
export class ImageError extends Error {}

/** Filtypen avgörs av innehållet (magiska byte), aldrig av filnamn eller uppgiven typ. */
export function sniffImage(buf: Uint8Array): ImageMime | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 && buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a) return "image/png";
  if (buf.length >= 12 && Buffer.from(buf.subarray(0, 4)).toString("latin1") === "RIFF" && Buffer.from(buf.subarray(8, 12)).toString("latin1") === "WEBP") return "image/webp";
  return null;
}

export function validateImage(buf: Uint8Array): ImageMime {
  if (buf.length === 0) throw new ImageError(bi("Bilden är tom.", "The image is empty."));
  if (buf.length > MAX_IMAGE_BYTES) throw new ImageError(bi("Bilden är för stor. Största tillåtna storlek är 8 MB.", "The image is too large. The maximum size is 8 MB."));
  const mime = sniffImage(buf);
  if (!mime) throw new ImageError(bi("Filtypen stöds inte. Använd JPEG, PNG eller WebP.", "File type not supported. Use JPEG, PNG or WebP."));
  return mime;
}

function uploadsDir(): string {
  return path.join(dataDir(), "uploads");
}
const EXT: Record<ImageMime, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** Sparar en bild privat (utanför webbroten). Görs bara när användaren uttryckligen valt att spara. */
export function saveImage(userId: string, buf: Uint8Array): string {
  const mime = validateImage(buf);
  const id = newId();
  const file = `${id}.${EXT[mime]}`;
  const dir = path.join(uploadsDir(), userId);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(dir, file), buf, { mode: 0o600 });
  getDb().prepare("INSERT INTO images (id, user_id, file, mime, size, created_at) VALUES (?,?,?,?,?,?)").run(id, userId, file, mime, buf.length, nowISO());
  return id;
}

/** Läser en bild – bara om den tillhör användaren. */
export function readImage(userId: string, id: string): { data: Buffer; mime: string } | null {
  const row = getDb().prepare("SELECT file, mime FROM images WHERE id = ? AND user_id = ?").get(id, userId) as { file: string; mime: string } | undefined;
  if (!row) return null;
  const p = path.join(uploadsDir(), userId, path.basename(row.file));
  if (!fs.existsSync(p)) return null;
  return { data: fs.readFileSync(p), mime: row.mime };
}

export function deleteImage(userId: string, id: string): boolean {
  const db = getDb();
  const row = db.prepare("SELECT file FROM images WHERE id = ? AND user_id = ?").get(id, userId) as { file: string } | undefined;
  if (!row) return false;
  fs.rmSync(path.join(uploadsDir(), userId, path.basename(row.file)), { force: true });
  db.prepare("DELETE FROM images WHERE id = ? AND user_id = ?").run(id, userId);
  db.prepare("UPDATE checks SET image_id = NULL WHERE user_id = ? AND image_id = ?").run(userId, id);
  return true;
}

export function deleteAllImages(userId: string): number {
  const rows = getDb().prepare("SELECT id FROM images WHERE user_id = ?").all(userId) as { id: string }[];
  for (const r of rows) deleteImage(userId, r.id);
  const dir = path.join(uploadsDir(), userId);
  if (/^[0-9a-f-]{36}$/.test(userId) && fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  return rows.length;
}

export function countImages(userId: string): number {
  return (getDb().prepare("SELECT COUNT(*) AS n FROM images WHERE user_id = ?").get(userId) as { n: number }).n;
}
