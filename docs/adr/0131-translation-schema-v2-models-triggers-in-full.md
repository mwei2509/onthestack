# Translation schema v2 models triggers in full; the rest is an Oracle reminder

Status: Accepted (decided with Melissa, 2026-11-25, in the session starting #52)

ADR 0031 puts card knowledge in M1 as "recognise every triggered ability, apply five effects, remind for the rest". Of the XMage research's proposals for the schema (`docs/research/xmage-engine.md`, B13), v2 takes the ones that trigger recognition and lands need:

- **Trigger modifiers:** `optional` ("you may"), `limit: { perTurn: n }` ("this ability triggers only once each turn"), and two kinds of condition: `if`, an intervening-if checked when it triggers and again when it resolves (CR 603.4), and `condition`, checked only when it triggers.
- **`zone`** on triggered and static abilities: the battlefield by default, also the graveyard, the command zone and the hand.
- **First-class targets:** an ability lists `targets: [{ id, kind: 'player' | 'permanent' | 'cardInGraveyard' | 'spell', filter, min, max }]` and effects refer to them by id. This replaces the `who: 'target'` and `object: 'target'` blanks. The conversation fills them first, then a question (ADR 0025).
- **Amounts:** a number, `{ count: ObjectFilter }`, `{ x: true }` or `{ powerOf: 'self' | 'matched' | 'target' }`. `powerOf` reads the object as it last existed.
- **Richer object filters:** subtypes, legendary, token, tapped, attacking, power and toughness comparisons, colours and name, alongside today's types, controller, `other` and mana value.
- **Several `when`s** for "enters or attacks": `when` is one condition or a list.
- **Lands:** `entersTapped.unless` gains the common conditions (you control a basic of a type, you control two or fewer other lands, two or more opponents), plus an optional life payment that replaces entering tapped (shock lands, ADR 0133).
- **The five applied effects:** gain or lose life, damage to each opponent, counters on itself or a target, creating tokens, and pumping itself until end of turn. Each fills an existing GameAction (`life`, `damage`, `counters`, `createToken`, `modify`).

Anything else in an ability, including effect-level conditions ("if you control an artifact, draw two instead"), modes, durations other than until end of turn, and continuous or replacement statics (M3, ADR 0031), becomes an **Oracle reminder**: an effect carrying the Oracle sentence it stands for, shown when the ability resolves so the interpreter fills in what players say happened. An ability the schema can't even place (no recognisable trigger or static) stays `unmodeled`, a "check this card" PlayerTask. Never guess (principle 2).

The existing Translations (engine tests, scenarios, the worked example) move to v2 in the same change; nothing stored in D1 uses v1 yet.

## Considered options

- **All of B13** (modes, durations, attach, tap and bounce effects, continuous and replacement statics): much larger, and anthems and replacement effects need the layer work ADR 0031 leaves in M3.
- **Only what the five effects strictly need** (optional, targets, numbers, `entersTapped.unless`): with today's filters, many triggers that the table's cards actually have would fall back to Oracle reminders.
