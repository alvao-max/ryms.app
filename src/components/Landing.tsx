import Link from "next/link";
import { startDemoAction } from "@/app/actions";
import { getT } from "@/lib/locale";
import { Mark } from "./Chrome";
import { AskIcon, BankIcon, CameraIcon, CheckIcon, PlanIcon, ShieldIcon, WalletIcon } from "./icons";
import { LanguageSwitch } from "./Locale";

/** En telefon med en riktig skärmbild av appen. */
function Phone({ src, alt, className = "" }: { src: string; alt: string; className?: string }) {
  return (
    <div className={`lp-phone ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} />
    </div>
  );
}

/** Landningssidan: samma formspråk som appen, för dator och mobil. Visas för den som inte är inloggad. */
export async function Landing() {
  const { t } = await getT();
  const Demo = ({ className = "btn", label, id = "start-demo" }: { className?: string; label?: string; id?: string }) => (
    <form action={startDemoAction}>
      <button className={className} data-testid={id}>
        {label ?? t("Prova demon", "Try the demo")}
      </button>
    </form>
  );
  const steps = [
    { icon: <CameraIcon size={22} />, title: t("Fota eller skriv", "Snap or type"), text: t("Ta en bild på varan och prislappen, välj en skärmbild från en nätbutik eller skriv in vara och pris.", "Take a photo of the item and price tag, pick a screenshot from a web shop, or type in the item and price.") },
    { icon: <WalletIcon size={22} />, title: t("Ryms räknar", "Ryms does the maths"), text: t("Köpet jämförs med din budget, räkningarna som väntar före lön, dina planerade köp och ditt sparande.", "The purchase is checked against your budget, the bills due before payday, your planned purchases and your savings.") },
    { icon: <CheckIcon size={22} />, title: t("Du bestämmer", "You decide"), text: t("Du får svaret i kronor och ser varför. Inget ändras i budgeten förrän du själv säger att du köpte den.", "You get the answer in kronor and see why. Nothing changes in your budget until you say you bought it.") },
  ];
  const answers = [
    { tone: "good", head: t("Ja, det ryms", "Yes, it fits"), text: t("Du har 900 kr kvar till kläder. Efter köpet på 699 kr har du 201 kr kvar, och ditt planerade sparande ryms fortfarande.", "You have 900 kr left for clothes. After this 699 kr purchase you have 201 kr left, and your planned saving still fits.") },
    { tone: "bad", head: t("Det ryms inte i budgeten", "It doesn't fit the budget"), text: t("Du har 400 kr kvar till kläder. Köpet kostar 699 kr, så det fattas 299 kr i budgeten för kläder.", "You have 400 kr left for clothes. The purchase costs 699 kr, so your clothes budget is 299 kr short.") },
    { tone: "warn", head: t("Vänta till efter lön", "Wait until after payday"), text: t("Det ryms i budgeten för kläder. Däremot skulle du sakna 180 kr till elräkningen på fredag.", "It fits your clothes budget. However, you would be 180 kr short for the electricity bill on Friday.") },
  ];
  const trust = [
    { icon: <BankIcon size={22} />, title: t("Bara läsbehörighet", "Read-only access"), text: t("Bankkoppling är frivillig. Ryms kan läsa saldo och transaktioner, men aldrig betala, föra över pengar eller ändra kort.", "Connecting a bank is optional. Ryms can read balances and transactions, but never pay, transfer money or change cards.") },
    { icon: <PlanIcon size={22} />, title: t("Siffror du kan lita på", "Numbers you can trust"), text: t("Alla belopp räknas ut av appen, öre för öre. Du kan trycka på varje siffra och se hur den är uträknad.", "Every amount is calculated by the app, to the öre. Tap any figure to see how it was worked out.") },
    { icon: <ShieldIcon size={22} />, title: t("Dina bilder är dina", "Your photos stay yours"), text: t("Bilden används för att känna igen vara och pris och sparas inte, om du inte själv väljer det.", "The photo is used to recognise the item and price and is not saved unless you choose to.") },
  ];

  return (
    <div className="lp" data-testid="landing">
      <header className="lp-nav">
        <Mark />
        <nav aria-label={t("Sidans delar", "Page sections")}>
          <a href="#sa-funkar-det">{t("Så funkar det", "How it works")}</a>
          <a href="#svar">{t("Svaren", "The answers")}</a>
          <a href="#trygghet">{t("Trygghet", "Trust")}</a>
        </nav>
        <div className="lp-nav-actions">
          <LanguageSwitch />
          <Link href="/logga-in" className="btn ghost small">
            {t("Logga in", "Log in")}
          </Link>
        </div>
      </header>

      <section className="lp-hero">
        <div className="lp-hero-bg" aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/bg/hero.jpg" alt="" />
        </div>
        <div className="lp-hero-copy">
          <span className="caps">{t("Budgetappen för butiken", "The budgeting app for the shop floor")}</span>
          <h1>Ryms det?</h1>
          <p>
            {t(
              "Fota det du funderar på att köpa. Ryms räknar mot din budget, dina räkningar och ditt sparande – och du bestämmer.",
              "Does it fit? Snap what you are thinking of buying. Ryms checks it against your budget, your bills and your savings – and you decide.",
            )}
          </p>
          <div className="lp-cta">
            <Demo />
            <Link href="/skapa-konto" className="btn ghost">
              {t("Skapa konto", "Create account")}
            </Link>
          </div>
          <span className="lp-fine">{t("Demon använder påhittade uppgifter. Ingen bank behövs.", "The demo uses made-up data. No bank needed.")}</span>
        </div>
        <div className="lp-hero-phones">
          <Phone src="/landing/app-home.jpg" alt={t("Ryms startsida: kvar till lön och kvar per kategori", "Ryms home screen: left until payday and left per category")} className="front" />
          <Phone src="/landing/app-answer.jpg" alt={t("Svaret på en köpkoll: Ja, det ryms", "The answer to a purchase check: Yes, it fits")} className="back" />
        </div>
      </section>

      <section className="lp-section" id="sa-funkar-det">
        <span className="caps lilac">{t("Så funkar det", "How it works")}</span>
        <h2>{t("Från prislapp till svar på några sekunder", "From price tag to answer in seconds")}</h2>
        <div className="lp-grid">
          {steps.map((s, i) => (
            <article className="card" key={i}>
              <span className="ico-dot">{s.icon}</span>
              <h3>
                <span className="faint num">{i + 1}</span> {s.title}
              </h3>
              <p>{s.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="lp-section" id="svar">
        <span className="caps lilac">{t("Svaren", "The answers")}</span>
        <h2>{t("Ett rakt svar, med kronorna som förklarar det", "A straight answer, with the numbers that explain it")}</h2>
        <div className="lp-grid">
          {answers.map((a, i) => (
            <article className="card" key={i}>
              <span className={`badge ${a.tone}`}>{t("Vinterjacka · 699 kr", "Winter jacket · 699 kr")}</span>
              <h3 className="serif">{a.head}</h3>
              <p>{a.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="lp-section" id="trygghet">
        <span className="caps lilac">{t("Trygghet", "Trust")}</span>
        <h2>{t("Du har kontrollen hela vägen", "You stay in control throughout")}</h2>
        <div className="lp-grid">
          {trust.map((s, i) => (
            <article className="card" key={i}>
              <span className="ico-dot">{s.icon}</span>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="lp-final">
        <AskIcon size={30} />
        <h2>{t("Prova själv med samma jacka", "Try it yourself with the same jacket")}</h2>
        <p>{t("I demon finns fyra påhittade budgetar. Se hur svaret ändras – utan konto och utan bank.", "The demo has four made-up budgets. See how the answer changes – no account and no bank.")}</p>
        <Demo id="start-demo-end" />
      </section>

      <footer className="lp-footer">
        <Mark />
        <span>{t("Ryms flyttar aldrig pengar. Du bestämmer alltid själv.", "Ryms never moves money. The decision is always yours.")}</span>
      </footer>
    </div>
  );
}
