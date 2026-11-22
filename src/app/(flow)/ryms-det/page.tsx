import { redirect } from "next/navigation";
import { DemoStrip } from "@/components/Frame";
import { RymsDetFlow } from "@/components/RymsDetFlow";
import { monthOf, todayISO } from "@/lib/dates";
import { aiConfigured, DEMO_SAMPLES } from "@/lib/services/analyze";
import { getMonthPlan } from "@/lib/services/plan";
import { getCheck } from "@/lib/services/purchases";
import { getLocale } from "@/lib/locale";
import { requireUser } from "@/lib/session";

export default async function RymsDetPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  if (!user.onboarded) redirect("/kom-igang");
  const q = await searchParams;
  const locale = await getLocale();
  const categories = getMonthPlan(user.id, monthOf(todayISO())).categories.map((c) => ({ id: c.id, name: c.name }));

  let initial: Parameters<typeof RymsDetFlow>[0]["initial"];
  if (q.sak) {
    const c = getCheck(user, q.sak);
    if (c) initial = { checkId: c.id, itemName: c.item_name, priceOre: c.price_ore, categoryId: c.category_id, plannedPurchaseId: c.planned_purchase_id, imageId: c.image_id };
  } else if (q.vara) {
    const price = Number(q.pris);
    initial = { itemName: q.vara.slice(0, 80), priceOre: Number.isInteger(price) && price > 0 ? price : null, categoryId: categories.find((c) => c.name === q.kat)?.id ?? null, auto: q.auto === "1" };
  }

  return (
    <>
      <DemoStrip user={user} />
      <RymsDetFlow
        key={`${user.id}:${q.sak ?? ""}:${q.vara ?? ""}:${q.pris ?? ""}`}
        categories={categories}
        aiAvailable={aiConfigured()}
        aiConsent={!!user.ai_consent_at}
        demo={!!user.is_demo}
        samples={user.is_demo ? Object.entries(DEMO_SAMPLES).map(([key, s]) => ({ key, title: locale === "en" ? ((s as { titleEn?: string }).titleEn ?? s.title) : s.title, file: s.file })) : []}
        initial={initial}
      />
    </>
  );
}
