# On The Stack — Rules Engine Proposal

> Original first draft, dictated and imported from Notion on 2026-11-20. Kept as background: later decisions in `docs/adr/` and the language in `GLOSSARY.md` take precedence wherever they differ.

## Goal

A voice-driven Magic: The Gathering table companion for a casual Commander group. Players speak naturally ("I attack Theo with Heliod"), and the app tracks life, combat, triggers and the stack, so forgotten triggers (like Ulamog exiling 20) stop happening.

## Core principle

The AI translates and the code decides. An LLM turns speech into structured events. A deterministic engine applies the rules. Anything the engine can't model is surfaced to players as a "check this" prompt and never guessed.

## Players decide, the app tallies

This is not Arena. The app never suggests moves, highlights legal plays or lists options. Players declare what they do, and the engine records it and does the bookkeeping (damage, life, triggers, deaths).

- **Flag, don't block.** If a declared action looks illegal (for example, a ground creature blocking a flier), the app shows a warning with "Do it anyway" or "Cancel". The table decides.
- **Overrides are first-class.** House rules, unmodeled cards and engine bugs should never stop play.
- **Overrides are logged.** An overridden action is saved as an event with an `override: true` flag, so replays stay faithful.

## The board is the source of truth

The physical cards are the real game. The app keeps a shadow copy that players can check when something was forgotten or missed.

- **Ask it.** "What's Heliod's power right now?" returns the total plus a breakdown: base stats, counters, equipment and temporary effects. A mismatch with the table shows which piece is missing.
- **Gentle reminders.** Triggers appear as "this is supposed to happen" nudges (for example, "Ulamog attack trigger: exile 20 from Theo's library"), which players can dismiss or ignore.
- **Board wins disagreements.** When the app and the table differ, players correct the app ("Heliod has two counters"). The correction is logged as an override.

## Architecture

1. **Voice layer**: speech to text, then an LLM that outputs a typed `Action` (validated against a schema).
2. **Engine**: pure functions `(GameState, Action) -> (GameState, Event[], Prompt[])`.
3. **Card library**: Scryfall data plus hand-tagged ability templates for the group's decks.
4. **Rules reference**: Comprehensive Rules text and Scryfall rulings, used only by the help assistant.
5. **UI**: a shared tabletop view (player quadrants) plus a visible stack.

## Data structures

```ts
type Zone = 'library' | 'hand' | 'battlefield' | 'graveyard' | 'exile' | 'command' | 'stack';
type Phase = 'untap' | 'upkeep' | 'draw' | 'main1' | 'combat' | 'main2' | 'end' | 'cleanup';
type CombatStep = 'beginning' | 'attackers' | 'blockers' | 'firstStrikeDamage' | 'damage' | 'end';

interface GameState {
  id: string;
  players: Player[];
  cards: Record<string, CardInstance>;
  turn: { number: number; activePlayerId: string; phase: Phase; combatStep?: CombatStep };
  stack: StackItem[];
  combat?: CombatState;
  log: Event[];
}

interface Player {
  id: string; name: string;
  life: number; poison: number;
  commanderDamage: Record<string, number>; // keyed by commander card id
  deckId: string;
  eliminated: boolean;
}

interface CardInstance {
  id: string; oracleId: string; ownerId: string; controllerId: string;
  zone: Zone; tapped: boolean;
  counters: Record<string, number>; // '+1/+1', 'loyalty', ...
  damageMarked: number;
  modifiers: Modifier[];            // until-end-of-turn effects etc.
  attachedTo?: string;              // equipment and auras
  isToken: boolean;
}

interface CardDefinition {          // from Scryfall plus tagging
  oracleId: string; name: string; manaValue: number;
  types: string[]; colors: string[];
  basePower?: number; baseToughness?: number;
  keywords: Keyword[];              // flying, trample, lifelink, deathtouch, indestructible...
  abilities: AbilityTemplate[];     // hand-tagged; empty means unmodeled
  oracleText: string;
}

interface CombatState {
  attackers: { cardId: string; defendingPlayerId: string }[];
  blocks: { blockerId: string; attackerId: string }[];
}

interface StackItem {
  id: string; sourceCardId: string; controllerId: string;
  kind: 'spell' | 'trigger' | 'activated';
  effect: Effect | { unmodeled: string };
  status: 'pending' | 'resolved' | 'countered' | 'skipped';
}
```

## Actions and events

Actions are what players say. Events are what the engine records happening.

```ts
type Action =
  | { type: 'declareAttackers'; attacks: { cardId: string; targetPlayerId: string }[] }
  | { type: 'declareBlockers'; blocks: { blockerId: string; attackerId: string }[] }
  | { type: 'castSpell'; cardId: string; targets?: string[]; x?: number }
  | { type: 'resolveTop' } | { type: 'passPriority' } | { type: 'advancePhase' }
  | { type: 'adjustLife'; playerId: string; delta: number }   // manual override
  | { type: 'moveCard'; cardId: string; to: Zone };            // manual override

type Event =
  | { type: 'attacked'; cardId: string; targetPlayerId: string }
  | { type: 'damageDealt'; sourceId: string; targetId: string; amount: number; combat: boolean }
  | { type: 'lifeChanged'; playerId: string; delta: number }
  | { type: 'died'; cardId: string }
  | { type: 'zoneChanged'; cardId: string; from: Zone; to: Zone }
  | { type: 'phaseChanged'; phase: Phase };
```

## Ability templates

A small vocabulary covers most of the group's cards. Each one pairs a trigger with an effect.

```ts
interface AbilityTemplate {
  trigger: { on: 'attacks' | 'dies' | 'anyCreatureDies' | 'lifeGained' | 'etb' | 'upkeep' | 'castSpell';
             filter?: Filter };
  effect: Effect;
  optional?: boolean;
}

type Effect =
  | { type: 'drain'; amount: number; who: 'eachOpponent' }
  | { type: 'gainLife'; amount: number | 'X' }
  | { type: 'exileTopOfLibrary'; count: number; who: 'defendingPlayer' }
  | { type: 'draw'; count: number }
  | { type: 'createToken'; tokenId: string; count: number }
  | { type: 'custom'; description: string };   // shown to players to resolve by hand
```

Example: Ulamog, the Ceaseless Hunger is tagged `{ trigger: { on: 'attacks' }, effect: { type: 'exileTopOfLibrary', count: 20, who: 'defendingPlayer' } }`.

## Engine loop

1. Receive an `Action` and validate it (is it legal in this phase? does the player control that card?).
2. Apply it to produce new state and `Event[]`.
3. **Trigger scan**: for each event, check every battlefield card's templates and push matches onto the stack (active player's first, per APNAP order).
4. **State-based actions**: repeat until nothing changes. Creatures with lethal damage or 0 toughness die (indestructible ignores damage but not 0 toughness), players at 0 life or 10 poison lose, and 21 commander damage eliminates. Every death emits `died`, which goes back to step 3.
5. Return the new state plus prompts ("Resolve Ulamog trigger?", "Unmodeled: check Void Winnower").

## Combat resolution

1. **Attackers**: tap the creatures (unless they have vigilance) and emit `attacked`, so attack triggers fire.
2. **Blockers**: record blocks and reject illegal ones (flying, menace).
3. **Damage**: if any creature has first or double strike, run a first-strike pass first. For each attacker:
   - If it's unblocked, its damage goes to the defending player (and also counts as commander damage if it's a commander).
   - If it's blocked, assign lethal damage to the blockers in order. Deathtouch makes 1 damage lethal. With trample, the excess goes to the player.
   - Lifelink makes the controller gain life equal to the damage dealt.
4. All damage in a pass is simultaneous: emit the events, then run state-based actions and the trigger scan.
5. **Cleanup**: at end of turn, clear marked damage and until-end-of-turn modifiers.

## Human in the loop

- Every stack item is visible and needs a confirm or skip (by voice or tap).
- Unmodeled cards never block play. They show their Oracle text and ask the table.
- Manual overrides (`adjustLife`, `moveCard`) always work, and an undo uses the event log.

## Voice layer

- The LLM gets a compact state summary (names to card ids, players) and must return JSON matching the `Action` schema.
- Ambiguity ("which zombie?") produces a clarifying prompt, not a guess.
- The rules help assistant is separate: it answers questions using the Comprehensive Rules and Scryfall rulings, and it never mutates state.

### Wake phrase: "Hey Stack"

One wake phrase for every command, so thinking out loud and table talk are never captured ("should I attack with this?" is ignored, while "Hey Stack, I attack Theo with Heliod" is captured). Two words cut false triggers from ordinary talk about the stack.

1. **On-device voice detection** (for example Silero VAD) means silence never leaves the device.
2. **On-device wake phrase** (openWakeWord, custom-trained on "Hey Stack") starts capture only after the phrase.
3. **Streaming speech to text** sends only the post-wake audio over a WebSocket to a streaming service (for example Deepgram), with the browser Web Speech API as the free fallback. Partial transcripts arrive while speaking and a final one at the pause.
4. **Intent parse and confirm:** the final transcript becomes a pending action that players confirm.

Practical notes: keep the screen awake with the Wake Lock API, tell everyone the app is listening, and never store raw audio, only confirmed commands.

## Phased plan

1. **MVP**: life, commander damage, combat math with the common keywords, a manual stack, and one shared device.
2. Ability templates for the group's decks, plus automatic trigger detection.
3. Voice input with action confirmation.
4. Multi-device sync, deck import, and the rules assistant.

## Out of scope (for now)

The full layer system, replacement-effect ordering, copy effects, and complete priority passing. These are handled by players through prompts.

## Engineering practices (skills showcase)

The project doubles as a showcase of current best practices, especially building with AI agents. It stays free to run.

- **Infrastructure as code:** Pulumi or SST, both open source and written in TypeScript. OpenTofu (the open-source Terraform fork) is the fallback.
- **Agent workflow:** a clear `CLAUDE.md`, architecture decision records, and agents working in small, reviewed pull requests.
- **LLM evals:** a test set of spoken commands checking that the voice parser produces the right actions, run in CI.
- **Property-based tests:** fast-check against the rules engine (for example, combat never leaves a creature with negative damage, and replaying the event log always rebuilds the same state).
- **CI/CD:** GitHub Actions, with a preview deploy for every pull request.
- **Observability:** OpenTelemetry traces that follow each voice command from speech to the engine.

If time is short, prioritize the evals and the property-based tests.

## Learning from corrections (model training)

Every correction a player makes is a labeled example: the transcript, the model's guess, and the action that was actually right. This is optional, not needed for the app to work.

- **In-game, no training:** save per-player nicknames ("my zombie" maps to a specific card), and put similar recent corrections into the prompt as examples.
- **Periodic fine-tuning:** once a few hundred real commands exist, review a sample of corrections, then fine-tune a small open model (for example Qwen or Llama) with LoRA, using a free tool like Unsloth on Google Colab. A larger model can label extra data (distillation).
- **Measure it:** compare the fine-tuned model against the current one using the same evals for accuracy, latency and cost. A small enough model could run in the browser for free.

## Cost plan

- Hosting on free tiers (Vercel or Cloudflare Pages, plus Supabase).
- Browser Web Speech API first. Whisper only if card names keep getting misheard.
- Code parses simple commands, and only messy phrasing goes to a small model. Optionally, users can bring their own API key.
- The main fixed cost is the domain. A tip jar could cover it while the app stays free (check the Fan Content Policy).
