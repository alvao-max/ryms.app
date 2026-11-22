import type { ReactNode } from "react";
import { getT } from "@/lib/locale";
import { Mark } from "./Chrome";
import { AskIcon, BankIcon, CameraIcon, CheckIcon, PlanIcon, ShieldIcon, WalletIcon } from "./icons";
import { LanguageSwitch } from "./Locale";

/**
 * Länken till appen i App Store. Sätt NEXT_PUBLIC_APP_STORE_URL när appen finns där;
 * tills dess leder knappen ingenstans.
 */
const APP_STORE_URL = process.env.NEXT_PUBLIC_APP_STORE_URL || "#";

function StoreButton({ children, className = "", id }: { children: ReactNode; className?: string; id?: string }) {
  return (
    <a href={APP_STORE_URL} className={`lp-store ${className}`} data-testid={id ?? "app-store"} rel="noopener">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 4v11M7.500 10.500L12 15l4.500-4.500M5 19h14" />
      </svg>
      {children}
    </a>
  );
}

/** Hemsidans landningssida, för dator och mobil. Leder till appen i App Store. */
export async function Landing() {
  const { t } = await getT();
  const steps = [
    { icon: <CameraIcon size={22} />, title: t("Fota, ladda upp eller skriv", "Snap, upload or type"), text: t("Ta en bild i butiken, ladda upp ett foto eller en skärmbild du redan har, eller skriv in vara och pris själv.", "Take a photo in the shop, upload a photo or screenshot you already have, or type in the item and price yourself.") },
    { icon: <WalletIcon size={22} />, title: t("Ryms räknar", "Ryms does the maths"), text: t("Köpet jämförs med din budget, räkningarna som väntar före lön, dina planerade köp och ditt sparande.", "The purchase is checked against your budget, the bills due before payday, your planned purchases and your savings.") },
    { icon: <CheckIcon size={22} />, title: t("Du bestämmer", "You decide"), text: t("Du får svaret i kronor och ser varför. Inget ändras i budgeten förrän du själv säger att du köpte den.", "You get the answer in kronor and see why. Nothing changes in your budget until you say you bought it.") },
  ];
  const answers = [
    { tone: "good", head: t("Ja, det ryms", "Yes, it fits"), text: t("Du har 1 400 kr kvar till träning. Efter köpet på 995 kr har du 405 kr kvar, och ditt planerade sparande ryms fortfarande.", "You have 1 400 kr left for fitness. After this 995 kr purchase you have 405 kr left, and your planned saving still fits.") },
    { tone: "bad", head: t("Det ryms inte i budgeten", "It doesn't fit the budget"), text: t("Du har 600 kr kvar till träning. Köpet kostar 995 kr, så det fattas 395 kr i budgeten för träning.", "You have 600 kr left for fitness. The purchase costs 995 kr, so your fitness budget is 395 kr short.") },
    { tone: "warn", head: t("Vänta till efter lön", "Wait until after payday"), text: t("Det ryms i budgeten för träning. Däremot skulle du sakna 240 kr till elräkningen på fredag.", "It fits your fitness budget. However, you would be 240 kr short for the electricity bill on Friday.") },
  ];
  const trust = [
    { icon: <BankIcon size={22} />, title: t("Bara läsbehörighet", "Read-only access"), text: t("Bankkoppling är frivillig. Ryms kan läsa saldo och transaktioner, men aldrig betala, föra över pengar eller ändra kort.", "Connecting a bank is optional. Ryms can read balances and transactions, but never pay, transfer money or change cards.") },
    { icon: <PlanIcon size={22} />, title: t("Siffror du kan lita på", "Numbers you can trust"), text: t("Alla belopp räknas ut av appen, öre för öre. Du kan trycka på varje siffra och se hur den är uträknad.", "Every amount is calculated by the app, to the öre. Tap any figure to see how it was worked out.") },
    { icon: <ShieldIcon size={22} />, title: t("Dina bilder är dina", "Your photos stay yours"), text: t("Bilden används för att känna igen vara och pris och sparas inte, om du inte själv väljer det.", "The photo is used to recognise the item and price and is not saved unless you choose to.") },
  ];
  const store = t("Ladda ner i App Store", "Download on the App Store");

  return (
    <div className="lp" data-testid="landing">
      <div className="lp-moss" aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/landing/moss.jpg" alt="" />
      </div>

      <header className="lp-nav">
        <Mark />
        <nav aria-label={t("Sidans delar", "Page sections")}>
          <a href="#sa-funkar-det">{t("Så funkar det", "How it works")}</a>
          <a href="#svar">{t("Svaren", "The answers")}</a>
          <a href="#trygghet">{t("Trygghet", "Trust")}</a>
        </nav>
        <div className="lp-nav-actions">
          <LanguageSwitch />
          <StoreButton className="small" id="app-store-nav">
            {t("Ladda ner", "Download")}
          </StoreButton>
        </div>
      </header>

      <section className="lp-hero">
        <div className="lp-hero-photo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/landing/hero.jpg" alt={t("En telefon med Ryms på skärmen, lutad mot mossa med små vita blommor", "A phone showing Ryms, resting on moss with small white flowers")} />
        </div>
        <div className="lp-hero-copy">
          <span className="caps">{t("Budgetappen för butiken", "The budgeting app for the shop floor")}</span>
          <h1>Ryms det?</h1>
          <p>
            {t(
              "Fota eller ladda upp en bild på det du funderar på att köpa. Ryms räknar mot din budget, dina räkningar och ditt sparande – och du bestämmer.",
              "Does it fit? Snap or upload a picture of what you are thinking of buying. Ryms checks it against your budget, your bills and your savings – and you decide.",
            )}
          </p>
          <div className="lp-cta">
            <StoreButton>{store}</StoreButton>
          </div>
          <span className="lp-fine">{t("För iPhone. Du behöver ingen bank för att komma igång.", "For iPhone. You don't need a bank to get started.")}</span>
        </div>
      </section>

      <section className="lp-section" id="sa-funkar-det">
        <span className="caps">{t("Så funkar det", "How it works")}</span>
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
        <span className="caps">{t("Svaren", "The answers")}</span>
        <h2>{t("Ett rakt svar, med kronorna som förklarar det", "A straight answer, with the numbers that explain it")}</h2>
        <div className="lp-grid">
          {answers.map((a, i) => (
            <article className="card" key={i}>
              <span className={`badge ${a.tone}`}>{t("Löparskor · 995 kr", "Running shoes · 995 kr")}</span>
              <h3 className="serif">{a.head}</h3>
              <p>{a.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="lp-section" id="trygghet">
        <span className="caps">{t("Trygghet", "Trust")}</span>
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
        <h2>{t("Ha svaret i fickan nästa gång", "Have the answer in your pocket next time")}</h2>
        <p>{t("Ladda ner Ryms och fråga innan du köper.", "Download Ryms and ask before you buy.")}</p>
        <StoreButton id="app-store-end">{store}</StoreButton>
      </section>

      <footer className="lp-footer">
        <Mark />
        <span>{t("Ryms flyttar aldrig pengar. Du bestämmer alltid själv.", "Ryms never moves money. The decision is always yours.")}</span>
      </footer>
    </div>
  );
}
