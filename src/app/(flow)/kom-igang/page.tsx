import { redirect } from "next/navigation";
import { Onboarding } from "@/components/Onboarding";
import { addMonths, monthOf, paydayFor, todayISO } from "@/lib/dates";
import { getLocale } from "@/lib/locale";
import { requireUser } from "@/lib/session";

export default async function OnboardingPage() {
  const user = await requireUser();
  if (user.onboarded) redirect("/");
  const today = todayISO();
  let payday = paydayFor(monthOf(today), 25);
  if (payday <= today) payday = paydayFor(addMonths(monthOf(today), 1), 25);
  return <Onboarding name={user.name} today={today} suggestedPayday={payday} locale={await getLocale()} />;
}
