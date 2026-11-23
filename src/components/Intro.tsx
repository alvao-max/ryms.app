"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { makeT, type Locale } from "@/lib/i18n";
import { AskIcon, BankIcon, CameraIcon, CategoryIcon, CheckIcon, ImageIcon, PenIcon, ShieldIcon } from "./icons";

/**
 * Välkomstvisningen efter att kontot skapats: sex korta bilder med enkla animationer.
 *
 * OBS: siffrorna i STATS och omdömena i VOICES är PLATSHÅLLARE. De är märkta som exempel i gränssnittet
 * och ska bytas mot verkliga, källbelagda uppgifter innan appen lanseras.
 */
const STATS = [
  { value: 0, suffix: " %", sv: "av användarna sparar mer efter tre månader", en: "of users save more after three months" },
  { value: 0, suffix: " kr", sv: "mer över i snitt varje månad", en: "more left over on average each month" },
  { value: 0, suffix: " s", sv: "från foto till svar", en: "from photo to answer" },
];
const STATS_EXAMPLE = [72, 1450, 8]; // exempelsiffror – inte uppmätta
const VOICES = [
  { name: "Maja, 27", sv: "Jag slutade ångra köp. Nu vet jag innan jag går till kassan.", en: "I stopped regretting purchases. Now I know before I reach the till." },
  { name: "Jonas, 34", sv: "Äntligen en budget jag faktiskt tittar på, mitt i butiken.", en: "Finally a budget I actually look at, right there in the shop." },
  { name: "Sara, 41", sv: "Sparmålet till resan blev av för första gången.", en: "The savings goal for our trip actually happened for the first time." },
];

/** Räknar upp till ett tal när bilden visas. */
function CountUp({ to, suffix, run }: { to: number; suffix: string; run: boolean }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!run) return setN(0);
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return setN(to);
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / 1100);
      setN(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [to, run]);
  return (
    <span className="num">
      {String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ")}
      {suffix}
    </span>
  );
}

function Ring({ share, icon, label, delay }: { share: number; icon: string; label: string; delay: number }) {
  const C = 2 * Math.PI * 27.5;
  return (
    <div className="intro-ring" style={{ animationDelay: `${delay}ms` }}>
      <span>
        <svg viewBox="0 0 60 60" aria-hidden>
          <circle cx="30" cy="30" r="27.500" className="track" />
          <circle cx="30" cy="30" r="27.500" className="fill" style={{ strokeDasharray: `${share * C} ${C}`, animationDelay: `${delay + 200}ms`, ["--len" as string]: `${C}` }} />
        </svg>
        <CategoryIcon icon={icon} size={20} />
      </span>
      {label}
    </div>
  );
}

export function Intro({ name, locale = "sv", onDone }: { name: string; locale?: Locale; onDone: () => void }) {
  const t = makeT(locale);
  const [i, setI] = useState(0);
  const touch = useRef<number | null>(null);

  const slides: { key: string; art: ReactNode; title: string; text: string }[] = [
    {
      key: "hej",
      art: (
        <div className="intro-art hello">
          <span className="intro-ask">
            <AskIcon size={54} />
          </span>
        </div>
      ),
      title: name ? t(`Välkommen, ${name}`, `Welcome, ${name}`) : t("Välkommen till Ryms", "Welcome to Ryms"),
      text: t("Ryms svarar på frågan du ställer i butiken: ryms det här köpet i min budget? Här är en minut om hur det fungerar.", "Ryms answers the question you ask in the shop: does this purchase fit my budget? Here is a minute on how it works."),
    },
    {
      key: "fota",
      art: (
        <div className="intro-art snap">
          <div className="intro-viewfinder">
            <span className="tag">
              {t("Löparskor", "Running shoes")} · 995 kr
            </span>
            <i />
          </div>
          <div className="intro-ways">
            <span><CameraIcon size={18} /> {t("Fota", "Snap")}</span>
            <span><ImageIcon size={18} /> {t("Ladda upp", "Upload")}</span>
            <span><PenIcon size={18} /> {t("Skriv", "Type")}</span>
          </div>
        </div>
      ),
      title: t("Fota, ladda upp eller skriv", "Snap, upload or type"),
      text: t("Ta en bild på varan och prislappen, ladda upp en skärmbild från en nätbutik eller skriv in vara och pris själv.", "Take a photo of the item and price tag, upload a screenshot from a web shop, or type in the item and price yourself."),
    },
    {
      key: "svar",
      art: (
        <div className="intro-art answer">
          <div className="intro-bubble">
            <span className="badge good">{t("Ja, det ryms", "Yes, it fits")}</span>
            <p>{t("Du har 1 400 kr kvar till träning. Efter köpet har du 405 kr kvar.", "You have 1 400 kr left for fitness. After the purchase you have 405 kr left.")}</p>
          </div>
          <div className="intro-choices">
            <span className="on">{t("Jag köpte den", "I bought it")}</span>
            <span>{t("Spara", "Save")}</span>
            <span>{t("Avstå", "Skip")}</span>
          </div>
        </div>
      ),
      title: t("Ett rakt svar – du bestämmer", "A straight answer – you decide"),
      text: t("Ryms räknar mot din budget, räkningarna före lön, dina planerade köp och ditt sparande. Inget ändras förrän du säger att du köpte den.", "Ryms checks your budget, the bills before payday, your planned purchases and your savings. Nothing changes until you say you bought it."),
    },
    {
      key: "koll",
      art: (
        <div className="intro-art rings">
          <Ring share={0.62} icon="mat" label={t("Mat", "Food")} delay={0} />
          <Ring share={0.4} icon="klader" label={t("Kläder", "Clothes")} delay={140} />
          <Ring share={0.2} icon="noje" label={t("Nöje", "Fun")} delay={280} />
        </div>
      ),
      title: t("Se vad som är kvar till lön", "See what's left until payday"),
      text: t("Ringarna visar hur mycket av varje budget du har använt. Koppla banken om du vill, så sorteras köpen av sig själva – Ryms kan bara läsa, aldrig flytta pengar.", "The rings show how much of each budget you have used. Connect your bank if you like and purchases sort themselves – Ryms can only read, never move money."),
    },
    {
      key: "siffror",
      art: (
        <div className="intro-art stats">
          {STATS.map((s, k) => (
            <div key={k} style={{ animationDelay: `${k * 140}ms` }}>
              <strong>
                <CountUp to={STATS_EXAMPLE[k]} suffix={s.suffix} run={i === 4} />
              </strong>
              <span>{t(s.sv, s.en)}</span>
            </div>
          ))}
          <em>{t("Exempelsiffror", "Example figures")}</em>
        </div>
      ),
      title: t("Små beslut som märks", "Small decisions that add up"),
      text: t("Den som stämmer av köpen mot en plan har lättare att hålla den. Ryms gör avstämningen åt dig, i stunden.", "People who check purchases against a plan find it easier to stick to. Ryms does the checking for you, in the moment."),
    },
    {
      key: "roster",
      art: (
        <div className="intro-art voices">
          <div className="intro-stars" aria-label={t("Exempelbetyg 4,8 av 5", "Example rating 4.8 out of 5")}>
            ★★★★★ <span>4,8</span>
          </div>
          {VOICES.map((v, k) => (
            <blockquote key={k} style={{ animationDelay: `${k * 160}ms` }}>
              ”{t(v.sv, v.en)}”<cite>{v.name}</cite>
            </blockquote>
          ))}
          <em>{t("Exempelomdömen", "Example reviews")}</em>
        </div>
      ),
      title: t("Du är i gott sällskap", "You're in good company"),
      text: t("Nu sätter vi upp din månad: lön, räkningar, budget och sparmål. Det tar ett par minuter.", "Now let's set up your month: pay, bills, budget and savings goals. It takes a couple of minutes."),
    },
  ];
  const last = i === slides.length - 1;
  const go = (n: number) => setI(Math.max(0, Math.min(slides.length - 1, n)));
  const s = slides[i];

  return (
    <main
      className="auth intro"
      data-testid="intro"
      data-slide={s.key}
      onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touch.current == null) return;
        const dx = e.changedTouches[0].clientX - touch.current;
        touch.current = null;
        if (dx < -50) go(i + 1);
        if (dx > 50) go(i - 1);
      }}
    >
      <div className="intro-top">
        <div className="intro-dots" role="tablist" aria-label={t("Välkomstvisning", "Welcome tour")}>
          {slides.map((x, k) => (
            <button key={x.key} type="button" role="tab" aria-selected={k === i} aria-label={`${k + 1} / ${slides.length}`} className={k === i ? "on" : k < i ? "done" : ""} onClick={() => go(k)} />
          ))}
        </div>
        {!last && (
          <button type="button" className="intro-skip" onClick={onDone} data-testid="intro-skip">
            {t("Hoppa över", "Skip")}
          </button>
        )}
      </div>

      <div className="intro-slide" key={s.key}>
        {s.art}
        <h1>{s.title}</h1>
        <p>{s.text}</p>
      </div>

      <div className="intro-actions">
        {i > 0 && (
          <button type="button" className="btn ghost" onClick={() => go(i - 1)}>
            {t("Tillbaka", "Back")}
          </button>
        )}
        <button type="button" className="btn" onClick={() => (last ? onDone() : go(i + 1))} data-testid="intro-next">
          {last ? t("Kom igång", "Get started") : t("Nästa", "Next")}
        </button>
      </div>
      <p className="intro-foot">
        <ShieldIcon size={14} /> {t("Ryms flyttar aldrig pengar. Du bestämmer alltid själv.", "Ryms never moves money. The decision is always yours.")}
        <span hidden>
          <BankIcon />
          <CheckIcon />
        </span>
      </p>
    </main>
  );
}
