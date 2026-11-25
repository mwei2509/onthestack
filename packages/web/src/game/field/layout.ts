import type { PermanentView, TableView } from '@onthestack/engine';

export type FieldZoneKey = 'creatures' | 'others' | 'lands';

/** Identical permanents, shown as one fan with a count, untapped and tapped apart (ADR 0126). */
export interface FieldGroup {
  key: string;
  card: string;
  ids: string[];
  untapped: number;
  tapped: number;
  isToken: boolean;
  isCreature: boolean;
  /** The engine's current values (ADR 0126); absent for non-creatures. */
  power?: number;
  toughness?: number;
  ptVaries: boolean;
  keywords: string[];
  /** Counters other than loyalty, which shows in the corner instead (ADR 0127). */
  counters: { kind: string; count: number }[];
  loyalty?: number;
  commander: boolean;
}

export interface FieldZone {
  key: FieldZoneKey;
  label: string;
  groups: FieldGroup[];
}

const LABELS: Record<FieldZoneKey, string> = {
  creatures: 'Creatures',
  others: 'Planeswalkers, artifacts & enchantments',
  lands: 'Lands & tokens',
};

/** Creatures in front, other permanents behind, lands and non-creature tokens nearest the player (ADR 0126). */
function zoneOf(p: PermanentView): FieldZoneKey {
  if (p.isCreature) return 'creatures';
  if (p.types.includes('Land') || p.isToken) return 'lands';
  return 'others';
}

/** Everything a player could tell apart except whether it's tapped, so only true copies share a fan. */
function sameness(p: PermanentView): string {
  const counters = Object.entries(p.counters)
    .filter(([, n]) => n > 0)
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify([p.card, p.isToken, p.isCreature ? [p.power, p.toughness, p.ptVaries] : null, [...p.keywords].sort(), counters, p.damage]);
}

/** A player's battlefield, by zone in playmat order, identical permanents grouped; empty zones are left out. */
export function fieldZones(view: Pick<TableView, 'permanents' | 'commandZone'>, playerId: string): FieldZone[] {
  const commander = view.commandZone[playerId]?.card;
  const groups = new Map<string, { zone: FieldZoneKey; group: FieldGroup }>();
  for (const p of view.permanents.filter((x) => x.controllerId === playerId)) {
    const key = sameness(p);
    const found = groups.get(key);
    if (found) {
      found.group.ids.push(p.id);
      if (p.tapped) found.group.tapped++;
      else found.group.untapped++;
      continue;
    }
    const { loyalty, ...others } = p.counters;
    groups.set(key, {
      zone: zoneOf(p),
      group: {
        key,
        card: p.card,
        ids: [p.id],
        untapped: p.tapped ? 0 : 1,
        tapped: p.tapped ? 1 : 0,
        isToken: p.isToken,
        isCreature: p.isCreature,
        ...(p.isCreature ? { power: p.power, toughness: p.toughness } : {}),
        ptVaries: p.ptVaries,
        keywords: p.keywords,
        counters: Object.entries(others)
          .filter(([, n]) => n > 0)
          .map(([kind, count]) => ({ kind, count })),
        ...(loyalty !== undefined ? { loyalty } : {}),
        commander: !p.isToken && p.card === commander && p.ownerId === playerId,
      },
    });
  }
  const order: FieldZoneKey[] = ['creatures', 'others', 'lands'];
  return order
    .map((key) => ({ key, label: LABELS[key], groups: [...groups.values()].filter((g) => g.zone === key).map((g) => g.group) }))
    .filter((z) => z.groups.length > 0);
}

/** "Goblin ×7 · 3 tapped", "Krenko, Mob Boss · Commander" (ADR 0126). */
export function groupCaption(g: FieldGroup): string {
  const count = g.untapped + g.tapped;
  const name = count > 1 ? `${g.card} ×${count}${g.tapped ? ` · ${g.tapped} tapped` : ''}` : g.card;
  return g.commander ? `${name} · Commander` : name;
}

/** The short badge on a card: "+1 ×2", or the counter's kind and count (ADR 0127). */
export function counterBadge(c: { kind: string; count: number }): string {
  if (c.kind === '+1/+1') return `+1 ×${c.count}`;
  if (c.kind === '-1/-1') return `−1 ×${c.count}`;
  return `${c.kind} ${c.count}`;
}

/** The corner of a card: power/toughness, `*` when printed so, or loyalty (ADR 0126, 0127). */
export function cornerOf(g: FieldGroup): string | null {
  if (g.isCreature) return g.ptVaries ? '*/*' : `${g.power}/${g.toughness}`;
  if (g.loyalty !== undefined) return `◆${g.loyalty}`;
  return null;
}
