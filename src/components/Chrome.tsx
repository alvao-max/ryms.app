"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";
import { logoutAction, switchDemoAction } from "@/app/actions";
import { AskIcon, HomeIcon, BankIcon, ListIcon, LogoutIcon, MenuIcon, PlanIcon, SavedIcon, SunIcon, UserIcon } from "./icons";
import { useT } from "./Locale";
import { SheetButton } from "./Sheet";

/** Ordmärket ur logotypen. */
export function Mark() {
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="mark" src="/brand/ryms-wordmark.png" alt="Ryms" width={777} height={306} />;
}

export function TopBar({ name, email, demo }: { name: string; email: string; demo: boolean }) {
  const t = useT();
  return (
    <header className="topbar">
      <SheetButton className="iconbtn" ariaLabel={t("Meny", "Menu")} title="Ryms" label={<MenuIcon size={24} />}>
        <nav className="menu">
          <Link href="/transaktioner">
            <ListIcon /> {t("Transaktioner", "Transactions")}
          </Link>
          <Link href="/installningar">
            <BankIcon /> {t("Inställningar", "Settings")}
          </Link>
          <Link href="/sparat">
            <SavedIcon /> {t("Sparade saker", "Saved items")}
          </Link>
          <Link href="/plan">
            <PlanIcon /> {t("Månadsplan och sparmål", "Monthly plan and savings goals")}
          </Link>
        </nav>
      </SheetButton>
      <Link href="/" className="mark-link" aria-label={t("Ryms, till startsidan", "Ryms, go to home")}>
        <Mark />
      </Link>
      <SheetButton className="iconbtn" ariaLabel={t("Konto", "Account")} title={demo ? t("Demokonto", "Demo account") : name || t("Konto", "Account")} label={<UserIcon size={24} />}>
        <p className="muted" style={{ marginBottom: 14 }}>
          {demo ? t("Du provar Ryms med påhittade uppgifter. Inget här hör till en riktig person eller bank.", "You are trying Ryms with made-up data. Nothing here belongs to a real person or bank.") : t(`Inloggad som ${email}`, `Signed in as ${email}`)}
        </p>
        <nav className="menu">
          <Link href="/installningar">
            <BankIcon /> {t("Inställningar", "Settings")}
          </Link>
          <form action={logoutAction}>
            <button>
              <LogoutIcon /> {demo ? t("Avsluta demon", "Exit the demo") : t("Logga ut", "Sign out")}
            </button>
          </form>
        </nav>
      </SheetButton>
    </header>
  );
}

export function DemoBar({ current, budgets }: { current: string; budgets: { key: string; label: string }[] }) {
  const path = usePathname();
  const t = useT();
  const [pending, start] = useTransition();
  return (
    <div className="demobar" role="note">
      <b>Demo</b>
      <span>{t("Påhittade uppgifter", "Made-up data")}</span>
      <label className="sr" htmlFor="demo-budget">
        {t("Välj demobudget", "Choose demo budget")}
      </label>
      <select id="demo-budget" data-testid="demo-budget" value={current} disabled={pending} onChange={(e) => start(() => switchDemoAction(e.target.value, path))}>
        {budgets.map((b) => (
          <option key={b.key} value={b.key}>
            {b.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function TabBar() {
  const path = usePathname();
  const t = useT();
  // Som i Instagram: menyn krymper mjukt i takt med att man skrollar nedåt och växer tillbaka
  // i takt med att man skrollar uppåt. Storleken följer fingret i stället för att slå om vid en gräns.
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let last = window.scrollY;
    let p = 0; // 0 = full storlek, 1 = minst
    let frame = 0;
    const apply = () => {
      frame = 0;
      el.style.setProperty("--shrink", p.toFixed(3));
      el.dataset.compact = p > 0.5 ? "1" : "0";
    };
    const onScroll = () => {
      const y = Math.max(0, window.scrollY);
      const dy = y - last;
      last = y;
      p = y < 8 ? 0 : Math.min(1, Math.max(0, p + dy / 160));
      if (!frame) frame = requestAnimationFrame(apply);
    };
    apply();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [path]);
  const tab = (href: string, label: string, Ico: (p: { size?: number; weight?: "regular" | "fill" }) => React.ReactNode) => {
    const on = path === href;
    return (
      <Link href={href} className="tab" aria-current={on ? "page" : undefined} aria-label={label}>
        <Ico size={25} weight={on ? "fill" : "regular"} />
      </Link>
    );
  };
  return (
    <div className="tabbar" data-testid="tabbar" ref={ref}>
      <nav aria-label={t("Huvudmeny", "Main menu")}>
        {tab("/", t("Idag", "Today"), HomeIcon)}
        {tab("/plan", "Plan", PlanIcon)}
        {tab("/sparat", t("Sparat", "Saved"), SavedIcon)}
        {tab("/transaktioner", t("Köp", "Spending"), ListIcon)}
        <Link href="/ryms-det" className="ask" aria-label={t("Ryms det? Kolla ett köp", "Ryms det? Check a purchase")} data-testid="ask-fab">
          <AskIcon size={22} />
        </Link>
      </nav>
    </div>
  );
}
