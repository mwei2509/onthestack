import type { CSSProperties } from 'react';

type Colour = 'W' | 'U' | 'B' | 'R' | 'G';

// From the Candlelight artboards: each colour's light, mid and dark stops, and its glow.
const HUE: Record<Colour, [string, string, string]> = {
  W: ['#FFF8E6', '#F0DFA8', '#B39A55'],
  U: ['#C9E6FF', '#5AA9E6', '#2B6AA3'],
  B: ['#D8CCE6', '#8E7AA8', '#4B3D5E'],
  R: ['#FFC2A8', '#E8613C', '#9E3418'],
  G: ['#C6F0CF', '#4FB06D', '#24683A'],
};
const GLOW: Record<Colour, string> = { W: '240,223,168', U: '90,169,230', B: '142,122,168', R: '232,97,60', G: '79,176,109' };
const COLOURLESS = '#8E8396';

const colours = (identity: string[]) => identity.filter((c): c is Colour => c in HUE);

/** Gem pips: original diamond shapes, not the mana symbols (ADR 0081). */
export function Gems({ identity, size = 7 }: { identity: string[]; size?: number }) {
  return (
    <span className="gems" aria-hidden>
      {colours(identity).map((c) => (
        <span
          key={c}
          className="gem"
          style={{ width: size, height: size, background: `linear-gradient(135deg, ${HUE[c][0]} 0%, ${HUE[c][1]} 55%, ${HUE[c][2]} 100%)` }}
        />
      ))}
    </span>
  );
}

/** A coin's ring in a colour identity, for `Avatar`'s `colour`. Colourless Decks get a neutral ring. */
export function identityRing(identity: string[]): string {
  const cs = colours(identity);
  if (cs.length === 0) return COLOURLESS;
  const stops = cs.map((c, i) => `${HUE[c][1]} ${Math.round((i / cs.length) * 100)}% ${Math.round(((i + 1) / cs.length) * 100)}%`);
  return `conic-gradient(${stops.join(', ')})`;
}

/** The painted glow behind a Deck, one soft light per colour. Its parent must be positioned. */
export function IdentityWash({ identity, strength = 0.16 }: { identity: string[]; strength?: number }) {
  const cs = colours(identity);
  if (cs.length === 0) return null;
  const wash = cs
    .map((c, i) => `radial-gradient(40% 140% at ${Math.round(100 - ((i + 0.5) / cs.length) * 50)}% 0%, rgba(${GLOW[c]},${strength}), transparent 72%)`)
    .join(', ');
  return <span className="wash" style={{ '--wash': wash } as CSSProperties} aria-hidden />;
}
