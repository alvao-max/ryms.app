import { NextResponse } from "next/server";
import { pick } from "@/lib/i18n";
import { getT } from "@/lib/locale";
import { ImageError, MAX_IMAGE_BYTES, saveImage } from "@/lib/services/images";
import { currentUser, sameOrigin } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Sparar en bild – anropas bara när användaren själv valt "Spara bilden också". */
export async function POST(req: Request) {
  const { t, locale } = await getT();
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: t("Inte inloggad", "Not signed in") }, { status: 401 });
  if (!(await sameOrigin())) return NextResponse.json({ error: t("Otillåtet anrop", "Request not allowed") }, { status: 403 });
  if (Number(req.headers.get("content-length") ?? 0) > MAX_IMAGE_BYTES + 64 * 1024) return NextResponse.json({ error: t("Bilden är för stor. Största tillåtna storlek är 8 MB.", "The image is too large. The maximum size is 8 MB.") }, { status: 413 });
  try {
    const file = (await req.formData()).get("image");
    if (!(file instanceof File)) return NextResponse.json({ error: t("Ingen bild skickades.", "No image was sent.") }, { status: 400 });
    return NextResponse.json({ imageId: saveImage(user.id, new Uint8Array(await file.arrayBuffer())) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof ImageError ? pick(e.message, locale) : t("Bilden kunde inte sparas.", "The image could not be saved.") }, { status: 400 });
  }
}
