import { getDb } from "../db";
import { disconnectBank } from "./bank";
import { deleteAllImages } from "./images";
import type { User } from "./users";

/** Raderar kontot och allt som hör till det: plan, köp, bilder, bankdata och sessioner. */
export async function deleteAccount(user: User): Promise<void> {
  const db = getDb();
  const ids = user.is_demo && user.demo_group ? (db.prepare("SELECT id FROM users WHERE demo_group = ?").all(user.demo_group) as { id: string }[]).map((r) => r.id) : [user.id];
  const conns = db.prepare("SELECT id FROM bank_connections WHERE user_id = ? AND status IN ('active','expired','error')").all(user.id) as { id: string }[];
  for (const c of conns) {
    try {
      await disconnectBank(user, c.id);
    } catch {}
  }
  for (const id of ids) {
    deleteAllImages(id);
    db.prepare("DELETE FROM users WHERE id = ?").run(id);
  }
}
