import { EXAMPLES } from './examples.js';
import type { CardText } from './translate.js';

/**
 * The drafting prompt (ADR 0132). It explains the Translation schema and how to choose between modelling, an Oracle
 * reminder and `unmodeled`; it never asks the model to work out what happens in a game.
 */
export const TRANSLATE_SYSTEM = `You translate one Magic: The Gathering card's Oracle text into a Translation: structured data a rules engine reads. Return {"abilities": [...]}, one entry per ability, in Oracle order. Every entry has "text": the Oracle sentence(s) it stands for, word for word. Leave out reminder text in parentheses and abilities that only add mana ("{T}: Add {G}.") except as kind "mana".

Kinds:
- "triggered": "When", "Whenever", "At the beginning of". Model it fully:
  - "when": the GameEvent, or a list for "enters or attacks". ZoneChanged (to/from a zone; "enters" is to "battlefield", "dies" is from "battlefield" to "graveyard"), PhaseStarted (step, whose turn), AttackersDeclared (object is the attacker), LifeChanged (player, gained), DamageDealt (damage to a player: object is the source, player is who was dealt damage, combat for combat damage), SpellCast (player is the caster, object filters the spell).
  - "object": "self" for this card, {"selfOr": filter} for "this or another", or a filter. Filters may use types, subtypes, legendary, token, controller (you/opponent/any), other, manaValue, power, toughness (ranges with atLeast/atMost), tapped, attacking, colors (W U B R G) and name.
  - "zone" if it works from somewhere other than the battlefield (graveyard, command, hand).
  - "optional": true for "you may".
  - "limit": {"perTurn": 1} for "This ability triggers only once each turn."
  - "if" for an intervening "if" right after the trigger ("At the beginning of your end step, if you gained 3 or more life this turn"); "condition" for a condition checked only when it triggers. Conditions: lifeGainedThisTurn, youControl (a filter with atLeast/atMost), opponents (a range).
  - "targets": each target with an id ("t1"), kind (player, permanent, cardInGraveyard, spell), and a filter or player relation. Effects refer to them as {"target": "t1"}.
- "static" for a land or permanent that enters tapped: "entersTapped": "self" or a filter for what else enters tapped, and "unless" for what lets it enter untapped: youControl (check lands, fast lands), opponents (two or more opponents), yourTurnOfGame, payLife (shock lands).
- "alwaysOn" for any other static, continuous or replacement effect ("Creatures you control get +1/+1", "If you would gain life, ..."). Give it a "when" if it applies at a moment a trigger's "when" can describe; otherwise leave "when" out.
- "spell" for an instant's or sorcery's effect, with targets and effects like a trigger's.
- "mana" for a mana ability.
- "unmodeled" for anything you can't place as one of the kinds above: activated abilities, levels, modal choices you can't express, and anything you're unsure of.

Effects, in order:
- {"gameAction": "life", "who", "amount"} to gain life, with "lose": true to lose it.
- {"gameAction": "damage", "to", "amount"}.
- {"gameAction": "counters", "object", "kind", "amount"}, e.g. kind "+1/+1".
- {"gameAction": "createToken", "token", "definition", "count"}: definition has types, power, toughness, keywords.
- {"gameAction": "modify", "object", "power", "toughness", "keywords"}: "gets +N/+N until end of turn".
- {"gameAction": "move", "object", "to", "how"}: destroy, sacrifice, exile, return to hand.
- {"playerTask": "...", "who"} for anything that touches a hand or library: draw, discard, search, reveal, scry, mill.
- {"oracle": "..."} for any other part of the effect: its Oracle sentence word for word. Use this for effects with conditions ("if you control an artifact, draw two instead"), choices of mode, and durations other than until end of turn.
"who" is you, eachOpponent, eachPlayer, defendingPlayer (the player a trigger's attack or damage concerns) or a target. "object" is self, matched (what the trigger matched: the creature that entered, died or attacked) or a target. An "amount" is a number, {"count": filter} for "for each", {"powerOf": "self" | "matched" | "target"} for "equal to its power", or {"x": true}.

Never guess. If you aren't sure an ability or effect means what a field says, use "unmodeled" for the ability or "oracle" for the effect. A Translation that leaves something to the players is better than one that does the wrong thing.

Examples:

${EXAMPLES.map((e) => `${cardBlock(e.card)}\n${JSON.stringify(e.draft)}`).join('\n\n')}`;

export function cardBlock(card: CardText): string {
  return `Name: ${card.name}\nType: ${card.typeLine}\nOracle text:\n${card.oracleText}`;
}
