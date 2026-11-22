/**
 * Fotot i toppen av appen: en skogsglänta i morgonljus. Två lager dimma driver långsamt
 * åt var sitt håll över bilden, så att den känns levande – som en stilla film.
 */
export function Backdrop() {
  const fog = (cls: string) => (
    <div className={`fog ${cls}`}>
      <div className="fog-track">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/bg/fog.png" alt="" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/bg/fog.png" alt="" />
      </div>
    </div>
  );
  return (
    <div className="backdrop" aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="photo" src="/bg/hero.jpg" alt="" />
      {fog("near")}
      {fog("far")}
      <div className="rays" />
    </div>
  );
}
