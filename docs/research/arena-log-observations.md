# What a real Arena game log shows

Melissa played one Arena game (on Mac, with "Detailed Logs (Plugin Support)" on) on 2026-11-21, and we read the Game Rules Engine (GRE) messages from its `Player.log`. This complements `event-models.md`, which read only Arena's message definitions and parser code. The raw log is not in the repo: it contains account details. Only card names, message types and event sequences are used here; players are "seat 1" (Melissa) and "seat 2".

Her deck included Amalia Benavides Aguirre, Haliya, Guided by Light, Case of the Uneaten Feast and Starting Town, the cards the engine-model example was built around.

## Volume

One two-player game produced **1,083 GRE messages**:

| Message type | Count | What it is |
| --- | ---: | --- |
| `GameStateMessage` | 653 | a state diff, carrying annotations |
| `UIMessage` | 218 | hovers, emotes; not game state |
| `TimerStateMessage` | 93 | clocks |
| `ActionsAvailableReq` | 48 | "what do you want to do?" |
| `QueuedGameStateMessage` | 29 | state updates held while a prompt is open |
| `DeclareAttackersReq` / `DeclareBlockersReq` | 8 / 1 | combat prompts |
| `SelectNReq`, `SelectTargetsReq`, `PromptReq`, `OptionalActionMessage`, `CastingTimeOptionsReq`, `MulliganReq` | 6, 5, 2, 3, 1, 1 | typed prompts |

The state diffs carried **1,568 annotations** (things that happened) and **584 persistent annotations** (facts that stay true for a while). The most common annotations, leaving out step changes, taps and mana: `ZoneTransfer` 164, `ObjectIdChanged` 148, `AbilityInstanceDeleted` 126, `AbilityInstanceCreated` 124, `ResolutionStart` / `ResolutionComplete` 75 each, `ModifiedLife` 32, `LayeredEffectCreated` 14, `DamageDealt` 13, targeting 12, `CounterAdded` 8, `TokenCreated` 3.

The most common persistent annotations: `AbilityWordActive` 199, **`EnteredZoneThisTurn` 160**, `ColorProduction` 30, `LayeredEffect` 30, `TriggeringObject` 17, `ModifiedPower` / `ModifiedToughness` 17, `Counter` 15, `TargetSpec` 11.

## Three sequences

### Casting Amalia, and her trigger (turn 4)

```
ObjectIdChanged     Amalia 287 → 298            (hand card becomes a new object)
ZoneTransfer        Amalia  hand → stack        category: CastSpell
ResolutionStart     Amalia
ResolutionComplete  Amalia
ZoneTransfer        Amalia  stack → battlefield category: Resolve
AbilityInstanceCreated  by Amalia → ability object 302        (her trigger goes on the stack)
MultistepEffectStarted  ability 302 on Amalia                 (explore begins)
CounterAdded            +1/+1 on Amalia
PowerToughnessModCreated  Amalia +1/+1
MultistepEffectComplete   ability 302
AbilityInstanceDeleted    ability 302                         (the trigger is done)
```

### Ward on Amalia, above a spell targeting her (turn 5)

Seat 2 targeted Amalia with Into the Flood Maw. Her "Ward—Pay 3 life" triggered, went on the stack above the spell, and resolved first:

```
AbilityInstanceCreated  by Amalia → ability 310 (ward)
ResolutionStart         ability 310
ModifiedLife            seat 2: −3                      (ward paid)
ResolutionComplete      ability 310
AbilityInstanceDeleted  ability 310
ResolutionStart         Into the Flood Maw
ObjectIdChanged         Amalia 298 → 312
ZoneTransfer            Amalia  battlefield → hand      category: Return
ResolutionComplete      Into the Flood Maw
ObjectIdChanged         Into the Flood Maw 309 → 314
ZoneTransfer            Into the Flood Maw  stack → graveyard   category: Resolve
```

### Combat damage, then life (turn 5)

```
DamageDealt     Azure Beastbinder → seat 1: 1
DamageDealt     Spyglass Siren    → seat 1: 1
SyntheticEvent  (combat damage step)
ModifiedLife    seat 1: −2
```

## What this confirms in our model

| Arena does | Our model | |
| --- | --- | --- |
| A new object ID on **every** zone change (`ObjectIdChanged`, 148 times), even hand → stack | ADR 0032: every zone change creates a new object | confirmed; we should apply it to the stack and graveyard too, not only the battlefield |
| Damage, then a separate life change | `DamageDealt`, then `LifeChanged` caused by it | same shape |
| Triggered abilities are stack objects created, resolved and deleted (ward resolved above the spell targeting Amalia) | `AbilityTriggered`, Stack items, `StackItemResolved` (ADR 0011) | same shape; ward is exactly the "trigger above a spell" case |
| Effects happen between `ResolutionStart` and `ResolutionComplete` | effects caused by `{ stackItem, gameAction }` | same idea, expressed as a cause instead of brackets |
| Typed prompts (`SelectTargetsReq`, `SelectNReq`, `DeclareAttackersReq`, `OptionalActionMessage`…) answered separately from state | typed PlayerQuestions (ADR 0033), TableEvents (ADR 0020) | confirmed |
| Prompts and UI messages are separate from state diffs | GameEvents vs TableEvents | confirmed |
| `EnteredZoneThisTurn` kept as a lingering fact, 160 times | summoning sickness via `controlledSince`; "this turn" queried from GameEvents (ADR 0032) | different mechanism, same information |

## What's new to us

- **Zone-transfer categories.** Every `ZoneTransfer` names why: `CastSpell` 33, `Resolve` 31, `Draw` 27, `PlayLand` 16, `Exile` 14, `Put` 9, `Surveil` 8, `Destroy` 8, `Mill` 8, `Sacrifice` 5, `Return` 3, `Warp` 1, `Countered` 1. That's a ready-made vocabulary for `ZoneChanged.how`; ours has `destroy`, `sacrifice`, `resolve`, `stateBased`, `token`, `countered`, `fizzled` and, from ADR 0021, `play`.
- **Multi-step effects are bracketed.** Explore and surveil show as `MultistepEffectStarted` … `MultistepEffectComplete`, with the hidden-information steps in between. For us those middle steps are PlayerTasks or "tell a hidden fact" PlayerQuestions, but the bracket is a clean way to group them.
- **A "Pending" zone and a "Limbo" zone** exist in Arena's zone list, supporting the research's inference that waiting triggers and objects between zones are tracked as state (our stored pending triggers, ADR 0022).
- **Most traffic isn't game state.** Of 1,083 messages, 430 are prompts, UI and timers. A voice companion needs none of the UI and timer traffic, and its prompts become PlayerQuestions answered by speech.

## How this was produced

The GRE messages were extracted from `Player.log` with fields matching names, accounts, users, sessions and tokens redacted; card names came from Scryfall's public `/cards/arena/{id}` lookup of the game's card IDs (32 of 62 IDs are cards; the rest are abilities and tokens). Scripts and extracted data stayed outside the repo.
