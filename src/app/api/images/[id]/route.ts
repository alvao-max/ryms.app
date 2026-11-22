import { getT } from "@/lib/locale";
import { readImage } from "@/lib/services/images";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Bilder ligger utanför webbroten och lämnas bara ut till sin ägare. Andra får 404. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  const { id } = await ctx.params;
  const img = user ? readImage(user.id, id) : null;
  if (!img) return new Response((await getT()).t("Hittades inte", "Not found"), { status: 404 });
  return new Response(new Uint8Array(img.data), {
    headers: {
      "Content-Type": img.mime,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
}
