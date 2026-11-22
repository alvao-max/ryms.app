/**
 * Fotot i toppen av appen: gröna kullar under en ljus himmel. Gräset böljar långsamt, som i vinden:
 * en andra kopia av bilden, maskad till kullarna, förskjuts av ett mjukt brus som sakta ändras.
 */
export function Backdrop() {
  return (
    <div className="backdrop" aria-hidden>
      <svg width="0" height="0" style={{ position: "absolute" }} focusable="false">
        <filter id="ryms-wave" x="-6%" y="-6%" width="112%" height="112%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.006 0.016" numOctaves="2" seed="4" result="noise">
            <animate attributeName="baseFrequency" dur="16s" values="0.006 0.016;0.011 0.026;0.007 0.019;0.006 0.016" keyTimes="0;0.4;0.75;1" repeatCount="indefinite" />
          </feTurbulence>
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="9" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="photo" src="/bg/hero.jpg" alt="" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="wave" src="/bg/hero.jpg" alt="" />
    </div>
  );
}
