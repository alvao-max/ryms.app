"use client";

import { useTransition } from "react";
import { aiConsentAction } from "@/app/actions";
import { useT } from "./Locale";

export function ConsentToggle() {
  const [pending, start] = useTransition();
  const t = useT();
  return (
    <button className="btn ghost small" disabled={pending} onClick={() => start(() => aiConsentAction(false))}>
      {t("Ta tillbaka", "Withdraw")}
    </button>
  );
}
