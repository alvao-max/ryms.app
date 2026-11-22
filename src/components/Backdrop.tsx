/** Fotot ligger still bakom hela appen; korten ovanpå är frostat glas som släpper igenom det. */
export function Backdrop() {
  return (
    <div className="backdrop" aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/bg/hero.jpg" alt="" />
    </div>
  );
}
