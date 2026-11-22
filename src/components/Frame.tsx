import { getLocale } from "@/lib/locale";
import { DEMO_BUDGETS } from "@/lib/services/demo";
import type { User } from "@/lib/services/users";
import { DemoBar, TopBar } from "./Chrome";

export async function DemoStrip({ user }: { user: User }) {
  if (!user.is_demo) return null;
  const locale = await getLocale();
  return <DemoBar current={user.demo_key ?? ""} budgets={DEMO_BUDGETS.map((b) => ({ key: b.key, label: locale === "en" ? ((b as { labelEn?: string }).labelEn ?? b.label) : b.label }))} />;
}

export function Top({ user }: { user: User }) {
  return <TopBar name={user.name} email={user.email} demo={!!user.is_demo} />;
}
