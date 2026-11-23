"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";
import { logoutAction, switchDemoAction } from "@/app/actions";
import { AskIcon, BellIcon, NextIcon, HomeIcon, BankIcon, ListIcon, LogoutIcon, MenuIcon, PlanIcon, SavedIcon, SunIcon, UserIcon } from "./icons";
import { useT } from "./Locale";
import { SheetButton } from "./Sheet";

/** Ordmärket ur logotypen. */
export function Mark() {
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="mark" src="/brand/ryms-wordmark.png" alt="Ryms" width={777} height={306} />;
}

export function TopBar({ name, email, demo, notices }: { name: string; email: string; demo: boolean; notices: { title: string; text: string; href: string }[] }) {
  const t = useT();
  return (
    <header className="topbar">
      <SheetButton
        className="iconbtn bell"
        testId="notices"
        ariaLabel={notices.length ? t(`Att göra: ${notices.length}`, `To do: ${notices.length}`) : t("Att göra: inget väntar", "To do: nothing waiting")}
        title={t("Att göra", "To do")}
        label={
          <>
            <BellIcon size={24} />
            {notices.length > 0 && <span className="bell-count">{notices.length}</span>}
          </>
        }
      >
        {notices.length === 0 ? (
          <p className="muted" style={{ paddingBottom: 8 }}>
            {t("Inget väntar på dig just nu.", "Nothing is waiting for you right now.")}
          </p>
        ) : (
          <nav className="menu notices">
            {notices.map((n, i) => (
              <Link href={n.href} key={i}>
                <span className="grow">
                  <span className="title" style={{ display: "block" }}>{n.title}</span>
                  <span className="sub" style={{ display: "block" }}>{n.text}</span>
                </span>
                <NextIcon size={18} />
              </Link>
            ))}
          </nav>
        )}
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
  // Som i Instagram: två lägen – stor och liten – med en enda mjuk övergång mellan dem.
  // Läget byts först när man skrollat en bit åt samma håll, så små rörelser får inte menyn att hoppa.
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let last = window.scrollY;
    let travelled = 0; // sträcka åt samma håll sedan senaste riktningsbytet
    let compact = false;
    const set = (v: boolean) => {
      if (v === compact) return;
      compact = v;
      el.dataset.compact = v ? "1" : "0";
    };
    el.dataset.compact = "0";
    const onScroll = () => {
      const y = Math.max(0, window.scrollY);
      const dy = y - last;
      last = y;
      if (dy === 0) return;
      travelled = Math.sign(dy) === Math.sign(travelled) ? travelled + dy : dy;
      if (y < 16) set(false);
      else if (travelled > 48) set(true);
      else if (travelled < -28) set(false);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
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
