import Link from "next/link";
import { redirect } from "next/navigation";
import { startDemoAction } from "@/app/actions";
import { Mark } from "@/components/Chrome";
import { Landscape } from "@/components/Landscape";
import { LanguageSwitch } from "@/components/Locale";
import { getT } from "@/lib/locale";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function Welcome({ searchParams }: { searchParams: Promise<{ raderat?: string }> }) {
  if (await currentUser()) redirect("/");
  const { raderat } = await searchParams;
  const { t } = await getT();
  return (
    <main className="welcome">
      <Landscape variant="login" />
      <Mark />
      <div style={{ position: "absolute", top: "calc(22px + env(safe-area-inset-top, 0px))", right: 20 }}>
        <LanguageSwitch />
      </div>
      {raderat && (
        <p className="note" role="status" style={{ marginBottom: 18 }}>
          {t("Kontot och allt som hörde till det är raderat.", "The account and everything that belonged to it has been deleted.")}
        </p>
      )}
      <h1>Ryms det?</h1>
      <p>{t("Fota eller ladda upp en bild på det du funderar på att köpa. Ryms räknar mot din budget, dina räkningar och ditt sparande – och du bestämmer.", "Does it fit? Snap or upload a picture of what you are thinking of buying. Ryms checks it against your budget, your bills and your savings – and you decide.")}</p>
      <div className="btn-row">
        <form action={startDemoAction}>
          <button className="btn" data-testid="start-demo">
            {t("Prova demon", "Try the demo")}
          </button>
        </form>
        <div className="btn-row two">
          <Link href="/skapa-konto" className="btn ghost">
            {t("Skapa konto", "Create account")}
          </Link>
          <Link href="/logga-in" className="btn ghost">
            {t("Logga in", "Log in")}
          </Link>
        </div>
      </div>
      <p className="cta-sub" style={{ margin: "16px 0 0", fontSize: 12.5 }}>
        {t("Demon använder påhittade uppgifter. Ingen bank behövs.", "The demo uses made-up data. No bank needed.")}
      </p>
    </main>
  );
}
