import type { CSSProperties } from 'react';
import { IdentityWash } from '../../decks/identity.js';
import { cornerOf, counterBadge, groupCaption, type FieldGroup, type FieldZone } from './layout.js';

/** A card is 56×78; a fan shows each further copy 9px along, and tapped copies turned sideways after a gap. */
const W = 56;
const H = 78;
const OFFSET = 9;
const GAP = 8;

/** Our own card frame: name, a colour-identity glow where art would go, and the corner value (ADR 0126). Never Magic's frame. */
function CardFace({ group, identity, style }: { group: FieldGroup; identity: string[]; style: CSSProperties }) {
  const corner = cornerOf(group);
  const badge = group.counters[0] && counterBadge(group.counters[0]);
  return (
    <span className={`field-card${group.commander ? ' commander' : ''}`} style={style} aria-hidden>
      <span className="field-card-name">{group.card}</span>
      <span className="field-card-art">
        <IdentityWash identity={identity} strength={0.6} />
        {badge && <span className="field-card-badge">{badge}</span>}
      </span>
      {corner && <span className="field-card-corner num">{corner}</span>}
    </span>
  );
}

/** One group of identical permanents: untapped copies fanned, then tapped copies turned 90° (ADR 0126). */
export function CardFan({ group, identity, selected, onPick }: { group: FieldGroup; identity: string[]; selected?: boolean; onPick?: () => void }) {
  const untappedWidth = group.untapped > 0 ? W + (group.untapped - 1) * OFFSET : 0;
  const tappedStart = untappedWidth + (group.untapped > 0 && group.tapped > 0 ? GAP : 0);
  const width = tappedStart + (group.tapped > 0 ? H + (group.tapped - 1) * OFFSET : 0);
  const cards: CSSProperties[] = [];
  for (let i = 0; i < group.untapped; i++) cards.push({ left: i * OFFSET });
  for (let i = 0; i < group.tapped; i++) cards.push({ left: tappedStart + i * OFFSET + (H - W) / 2, transform: 'rotate(90deg)', filter: 'brightness(0.82)' });
  const caption = groupCaption(group);
  return (
    <button className={`field-fan${selected ? ' selected' : ''}`} onClick={onPick} aria-label={caption} aria-pressed={selected}>
      <span className="field-fan-cards" style={{ width, height: H }}>
        {cards.map((style, i) => (
          <CardFace key={i} group={group} identity={identity} style={style} />
        ))}
      </span>
      <span className="field-fan-caption" style={{ maxWidth: Math.max(width, W + 30) }}>
        {caption}
      </span>
    </button>
  );
}

/** A player's battlefield in playmat order (ADR 0126). `identityOf` gives each card's colours, from the game's Decks. */
export function FieldZones({ zones, identityOf, selected, onPick }: { zones: FieldZone[]; identityOf: (card: string) => string[]; selected?: string | null; onPick?: (group: FieldGroup) => void }) {
  return (
    <div className="field-zones">
      {zones.map((z) => (
        <section key={z.key} className="field-zone" aria-label={z.label}>
          <h3 className="section-label">{z.label}</h3>
          <div className="field-zone-groups">
            {z.groups.map((g) => (
              <CardFan key={g.key} group={g} identity={identityOf(g.card)} selected={selected === g.key} onPick={onPick && (() => onPick(g))} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
