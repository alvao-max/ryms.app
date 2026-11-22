"use client";

import { useState, useTransition, type ReactNode } from "react";
import type { ActionResult } from "@/app/actions";
import { useT } from "./Locale";
import { useSheetClose } from "./Sheet";

/**
 * Formulär som kör en serveråtgärd, visar fel på svenska och stänger arket när det gått bra.
 * `confirm` kräver ett uttryckligt ja innan något ändras.
 */
export function ActionForm({
  action,
  children,
  submit,
  submitClass = "btn",
  confirm,
  keepOpen,
  className,
}: {
  action: (fd: FormData) => Promise<ActionResult>;
  children?: ReactNode;
  submit: ReactNode;
  submitClass?: string;
  confirm?: string;
  keepOpen?: boolean;
  className?: string;
}) {
  const close = useSheetClose();
  const t = useT();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className={className}
      action={(fd) => {
        if (confirm && !window.confirm(confirm)) return;
        setError(null);
        setMessage(null);
        start(async () => {
          const r = await action(fd);
          if (r?.error) setError(r.error);
          else {
            if (r?.message) setMessage(r.message);
            if (!keepOpen && !r?.message) close();
          }
        });
      }}
    >
      {children}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button className={submitClass} disabled={pending}>
        {pending ? t("Vänta…", "Please wait…") : submit}
      </button>
      {message && (
        <p className="okmsg" role="status">
          {message}
        </p>
      )}
    </form>
  );
}
