import { NextResponse } from "next/server";
import { completeConnection } from "@/lib/services/bank";
import { appUrl, currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Hit skickar banktjänsten tillbaka användaren efter inloggningen hos banken. */
export async function GET(req: Request) {
  const base = await appUrl();
  const user = await currentUser();
  if (!user) return NextResponse.redirect(`${base}/valkommen`);
  const q = new URL(req.url).searchParams;
  const r = await completeConnection(user, { code: q.get("code"), state: q.get("state"), error: q.get("error") });
  if (r.ok) return NextResponse.redirect(`${base}/installningar/bank?steg=konton&id=${r.connectionId}`);
  return NextResponse.redirect(`${base}/installningar/bank?fel=${r.reason === "cancelled" ? "avbruten" : r.reason === "unknown_state" ? "okand" : "misslyckades"}`);
}
