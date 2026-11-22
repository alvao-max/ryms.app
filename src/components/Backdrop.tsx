/**
 * Fotot i toppen av appen: en skogsglänta i morgonljus. Två lager dimma driver långsamt
 * åt var sitt håll över bilden, så att den känns levande – som en stilla film.
 */
/** Blombladen som singlar ned: fasta värden, så att servern och webbläsaren ritar samma sak. */
const PETALS = [
  { x: 6, s: 7, d: 19, o: 3, c: "#f2a6a0" },
  { x: 17, s: 5, d: 24, o: 11, c: "#f6d9a8" },
  { x: 29, s: 8, d: 17, o: 7, c: "#ef8f8a" },
  { x: 41, s: 5, d: 27, o: 19, c: "#f7e3c2" },
  { x: 52, s: 7, d: 21, o: 1, c: "#f4b3ad" },
  { x: 63, s: 6, d: 25, o: 14, c: "#f6d9a8" },
  { x: 71, s: 8, d: 18, o: 9, c: "#ee8a7c" },
  { x: 82, s: 5, d: 29, o: 22, c: "#f7e3c2" },
  { x: 90, s: 7, d: 20, o: 5, c: "#f2a6a0" },
  { x: 36, s: 4, d: 31, o: 16, c: "#f6d9a8" },
  { x: 58, s: 4, d: 33, o: 26, c: "#f4b3ad" },
  { x: 77, s: 6, d: 23, o: 12, c: "#ef8f8a" },
];

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
      <div className="petals">
        {PETALS.map((p, i) => (
          <i key={i} style={{ left: `${p.x}%`, width: p.s, height: p.s * 1.7, background: p.c, animationDuration: `${p.d}s, ${p.d / 3.1}s`, animationDelay: `${-p.o}s, ${-p.o / 2}s` }} />
        ))}
      </div>
    </div>
  );
}
