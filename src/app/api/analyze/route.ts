import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { pick } from "@/lib/i18n";
import { getT } from "@/lib/locale";
import { aiConfigured, analyzeProductImage, demoSuggestion } from "@/lib/services/analyze";
import { ImageError, MAX_IMAGE_BYTES, validateImage } from "@/lib/services/images";
import { currentUser, sameOrigin } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Bildanalys. Bilden hålls bara i minnet under anropet och sparas aldrig här.
 * Det enda som följer med bilden är namnen på användarens budgetkategorier.
 */
export async function POST(req: Request) {
  const { t, locale } = await getT();
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: t("Inte inloggad", "Not signed in") }, { status: 401 });
  if (!(await sameOrigin())) return NextResponse.json({ error: t("Otillåtet anrop", "Request not allowed") }, { status: 403 });

  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_IMAGE_BYTES + 64 * 1024) return NextResponse.json({ error: t("Bilden är för stor. Största tillåtna storlek är 8 MB.", "The image is too large. The maximum size is 8 MB.") }, { status: 413 });
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: t("Kunde inte läsa bilden.", "Could not read the image.") }, { status: 400 });
  }
  const categories = getDb().prepare("SELECT name, icon FROM categories WHERE user_id = ? AND archived = 0 ORDER BY sort").all(user.id) as { name: string; icon: string }[];

  // Demons exempelbilder: förbestämda svar, ingen AI-tjänst inblandad.
  const sample = form.get("sample");
  if (typeof sample === "string") {
    const suggestion = user.is_demo ? demoSuggestion(sample, categories, locale) : null;
    if (!suggestion) return NextResponse.json({ error: t("Okänd exempelbild", "Unknown sample image") }, { status: 400 });
    return NextResponse.json({ suggestion });
  }

  const file = form.get("image");
  if (!(file instanceof File)) return NextResponse.json({ error: t("Ingen bild skickades.", "No image was sent.") }, { status: 400 });
  if (!user.ai_consent_at) return NextResponse.json({ error: t("Du behöver godkänna bildanalysen först.", "You need to approve image analysis first.") }, { status: 403 });
  let bytes: Uint8Array;
  let mime;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
    mime = validateImage(bytes);
  } catch (e) {
    return NextResponse.json({ error: e instanceof ImageError ? pick(e.message, locale) : t("Kunde inte läsa bilden.", "Could not read the image.") }, { status: 400 });
  }
  if (!aiConfigured()) return NextResponse.json({ unavailable: true });
  try {
    return NextResponse.json({ suggestion: await analyzeProductImage(bytes, mime, categories.map((c) => c.name), locale) });
  } catch {
    return NextResponse.json({ unavailable: true });
  }
}
