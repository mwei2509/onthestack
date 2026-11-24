import { useState } from 'react';
import { Check } from '../icons.js';
import type { DeckCard } from './api.js';
import { commanderChoices } from './format.js';
import { Sheet } from './parts.js';

/** Pick one card, or two for partners, from the Deck itself (ADR 0083). */
export function CommanderPicker({
  cards,
  busy,
  onPick,
  onClose,
}: {
  cards: DeckCard[];
  busy: boolean;
  onPick: (oracleIds: string[]) => void;
  onClose: () => void;
}) {
  const [chosen, setChosen] = useState<string[]>(cards.filter((c) => c.commander).map((c) => c.oracleId));
  const [search, setSearch] = useState('');
  const q = search.trim().toLowerCase();
  const unique = [...new Map(cards.map((c) => [c.oracleId, c])).values()];
  const shown = commanderChoices(unique).filter((c) => c.name.toLowerCase().includes(q));

  const toggle = (oracleId: string) =>
    setChosen((now) => (now.includes(oracleId) ? now.filter((o) => o !== oracleId) : now.length < 2 ? [...now, oracleId] : now));

  return (
    <Sheet title="Choose the commander" onClose={onClose}>
      <p className="muted" style={{ margin: 0, fontSize: 14 }}>
        Tap one card, or two for partners.
      </p>
      <label className="search">
        <span className="visually-hidden">Search this deck</span>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search this deck" type="search" style={{ paddingLeft: 14 }} />
      </label>
      <ul className="picker-list" aria-label="Cards in this deck">
        {shown.map((c) => {
          const on = chosen.includes(c.oracleId);
          return (
            <li key={c.oracleId}>
              <button aria-pressed={on} disabled={!on && chosen.length >= 2} onClick={() => toggle(c.oracleId)}>
                <span className="display">{c.name}</span>
                {on && <Check />}
              </button>
            </li>
          );
        })}
      </ul>
      <button className="btn btn-primary" disabled={busy || chosen.length === 0} onClick={() => onPick(chosen)}>
        {chosen.length === 2 ? 'Mark as partners' : 'Mark as commander'}
      </button>
    </Sheet>
  );
}
