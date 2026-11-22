export type Tone = "meadow" | "dusk" | "ember" | "mist";

/**
 * Bakgrundsfoto. `variant="login"` använder en egen bild (public/bg/login.jpg) som rör sig
 * mycket långsamt; övriga sidor använder public/bg/hero.jpg.
 */
export function Landscape({ tone = "meadow", variant = "hero" }: { tone?: Tone; sunX?: number; variant?: "hero" | "login" }) {
  return (
    <div className={`landscape tone-${tone}${variant === "login" ? " drift" : ""}`} aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={variant === "login" ? "/bg/login.jpg" : "/bg/hero.jpg"} alt="" />
    </div>
  );
}
