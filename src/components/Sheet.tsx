"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { CloseIcon } from "./icons";
import { useT } from "./Locale";

const Ctx = createContext<() => void>(() => {});
/** Stänger arket man befinner sig i. */
export const useSheetClose = () => useContext(Ctx);

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const t = useT();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="sheet"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {open && (
        <Ctx.Provider value={onClose}>
          <div className="sheet-in">
            <div className="sheet-grab" />
            <div className="sheet-head">
              <h2>{title}</h2>
              <button type="button" className="iconbtn" onClick={onClose} aria-label={t("Stäng", "Close")}>
                <CloseIcon />
              </button>
            </div>
            {children}
          </div>
        </Ctx.Provider>
      )}
    </dialog>
  );
}

/** En knapp som öppnar ett ark. Innehållet kan vara serverrenderat. */
export function SheetButton({ label, title, className, children, ariaLabel, testId }: { label: ReactNode; title: string; className?: string; children: ReactNode; ariaLabel?: string; testId?: string }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)} aria-label={ariaLabel} data-testid={testId}>
        {label}
      </button>
      <Sheet open={open} onClose={close} title={title}>
        {children}
      </Sheet>
    </>
  );
}
