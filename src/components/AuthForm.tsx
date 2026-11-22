"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction, signupAction, type ActionResult } from "@/app/actions";
import { BackIcon } from "./icons";
import { Landscape } from "./Landscape";
import { useT } from "./Locale";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(mode === "login" ? loginAction : signupAction, undefined);
  const signup = mode === "signup";
  const t = useT();
  return (
    <main className="auth">
      <Landscape variant="login" />
      <Link href="/valkommen" className="iconbtn" aria-label={t("Tillbaka", "Back")} style={{ marginLeft: -10 }}>
        <BackIcon />
      </Link>
      <h1>{signup ? t("Skapa konto", "Create account") : t("Välkommen tillbaka", "Welcome back")}</h1>
      <p className="muted" style={{ marginBottom: 26 }}>
        {signup ? t("Det tar en minut. Du behöver ingen bank för att komma igång.", "It takes a minute. You don't need a bank to get started.") : t("Logga in för att se vad som ryms.", "Log in to see what fits.")}
      </p>
      <form action={action}>
        {signup && (
          <label className="field">
            <span>{t("Förnamn", "First name")}</span>
            <input name="name" autoComplete="given-name" maxLength={40} />
          </label>
        )}
        <label className="field">
          <span>{t("E-post", "Email")}</span>
          <input name="email" type="email" autoComplete="email" inputMode="email" required />
        </label>
        <label className="field">
          <span>{t("Lösenord", "Password")}{signup ? t(" (minst 8 tecken)", " (at least 8 characters)") : ""}</span>
          <input name="password" type="password" autoComplete={signup ? "new-password" : "current-password"} minLength={signup ? 8 : undefined} required />
        </label>
        {state?.error && (
          <p className="error" role="alert">
            {state.error}
          </p>
        )}
        <button className="btn" disabled={pending}>
          {pending ? t("Vänta…", "Please wait…") : signup ? t("Skapa konto", "Create account") : t("Logga in", "Log in")}
        </button>
      </form>
      <p className="muted" style={{ marginTop: 20, textAlign: "center" }}>
        {signup ? (
          <>
            {t("Har du redan ett konto?", "Already have an account?")} <Link href="/logga-in" className="linkish">{t("Logga in", "Log in")}</Link>
          </>
        ) : (
          <>
            {t("Ny här?", "New here?")} <Link href="/skapa-konto" className="linkish">{t("Skapa konto", "Create account")}</Link>
          </>
        )}
      </p>
    </main>
  );
}
