# What to take from XMage: engine patterns and card knowledge

Research note for ADR 0023 ("a full rules engine fed by the conversation") and the open roadmap question in ADR 0024 (when card knowledge arrives). It reads XMage's engine and card code and compares them with our engine as of the engine PR stack #21–#26 (branch `engine/6-replay` @ `2be600c`, `packages/engine/src`) and the spec in `docs/engine-model.md`.

**XMage** (also called Mage, MIT license) is an open-source program for playing Magic online, with a full rules engine and one Java class per card (32,842 card classes). Everything below was read at commit **`7fecba4e6f6c2d168432c65a3c213a65707fe385`** (2026-11-21), the same commit `docs/research/event-models.md` used. Paths are relative to https://github.com/magefree/mage/blob/7fecba4e6f6c2d168432c65a3c213a65707fe385/. `M/` stands for `Mage/src/main/java/mage/`.

**Labels.** **[code]** means I read it in XMage's source or ours. **[measured]** means a script in `scripts/` counted it. **[inferred]** means my judgment or an estimate.

---

## Executive summary

1. **Our engine already has XMage's core shape.** XMage loops "state-based actions until none, then put triggers on the stack in APNAP order, then repeat" (`GameImpl.checkStateAndTriggered`), and so does our `settle`. Stats are recalculated rather than stored in both. Waiting triggers are kept in state in both. What we lack are the parts that card knowledge will need: durations, control as an effect, continuous effects from static abilities, replacement effects, and rich last-known information.
2. **Three concrete bugs, each with an XMage test that catches it** [code]:
   - **Second combat damage step.** We decide which creatures deal damage in the regular step by their *current* keywords. XMage records which creatures actually dealt first-strike damage (CR 702.7c, `FirstStrikeWatcher`). A creature that gains first strike after the first-strike step deals no damage in our engine (it should). One that loses first strike deals damage twice (it shouldn't). `FirstStrikeTest.firstStrikeGainedMidCombat` and `firstStrikeLostMidCombat` cover this.
   - **A player leaving the game.** We exile everything the departed player controlled but didn't own. CR 800.4a first ends the effects that gave them control, so stolen permanents go back to their previous controller. `PlayerLeftGameRangeAllTest.TestControlledBySorcery` covers this. ADR 0028's bullet repeats the partial reading.
   - **Simultaneous deaths.** State-based deaths are still emitted as one `ZoneChanged` per creature in `settle.ts`, so a dying Blood Artist misses deaths processed after its own. ADR 0026 decided this but the code on this branch doesn't do it yet. `BloodArtistTest` covers this.
3. **Adopt XMage's object-identity rule; we're halfway there.** Minting a new permanent ID on every battlefield entry is our equivalent of XMage's zone change counter. Cards in graveyards and exile have no identity yet (they're bare `CardName`s), and delayed triggers reference a card name. Both are wrong for flicker, warp and "return it".
4. **XMage's test suite is the biggest free win.** It has 8,102 `@Test` methods in 2,297 files, written as declarative scenarios (`addCard`, `castSpell`, `attack`, `block`, `setStopAt`, `assertLife`) [measured]. MIT allows adapting them with the copyright and permission notice. A small TypeScript scenario DSL that copies this shape would let us port the multiplayer, combat and commander scenarios as rules regression tests.
5. **Card knowledge: XMage is a good oracle but a costly source.** In a sample of the 200 most-played Commander cards (by EDHREC rank), 86% of XMage classes are built only from library classes, with no card-specific Java. In a random 200 from ranks 201–3000 the figure is 69%. Across all cards it is 73% [measured]. "Built from library classes" isn't the same as "maps to our schema", though. Only about 40–55% of non-land cards use only the most common trigger, effect and condition classes, and each library class needs its own mapping [measured proxy]. **Recommendation: hybrid.** An LLM drafts every Translation from Oracle text. An XMage-derived structural fingerprint checks the drafts automatically where the mapping is clean. A person reviews the disagreements. ADR 0005 stays valid, refined by an ADR that adds XMage as a checker.
6. **Card knowledge in M1 is credible if it is "recognize, then let the table say the effect".** Model when cards trigger (the 9 GameEvents already cover about 89% of trigger clauses), plus keywords, P/T, enters-tapped and a few common effects. Unmodeled effects become a reminder showing the card's Oracle text. Missed triggers are the most common casual mistake, so knowing *when* is most of the value.

---

## Part A: engine core patterns

Verdicts: **adopt** (take the pattern as is), **adapt** (take the idea, reshape it for an event-sourced companion), **skip**.

### A1. Object identity across zones (CR 400.7)

**How XMage does it [code].** A card keeps one UUID for the whole game. `GameState` keeps a *zone change counter* (zcc) per object, which goes up on every zone change. Anything that must refer to "this object, not a later one" stores the pair:
- `MageObjectReference(sourceId, zoneChangeCounter)` (`M/MageObjectReference.java`). Its `getPermanent(game)` returns null if the zcc no longer matches (lines 169–175).
- `FixedTarget(permanent, game)` captures the zcc when created (`M/target/targetpointer/FixedTarget.java`), so a delayed "exile it at the next end step" doesn't follow a flickered creature.
- Targets store zcc per chosen target (`TargetImpl.zoneChangeCounters`). `isLegal` drops a target whose zcc changed (`TargetImpl.java:549–590`, `hasChangedZones`).
- Auras store `attachedToZoneChangeCounter` (`PermanentImpl.java:1100`).
- Last-known information: `rememberLKI` deep-copies a permanent or stack object when it leaves (`GameImpl.java:~3815`). `getPermanentOrLKIBattlefield(mor)` reads it. A short-lived set, `lkiShortLiving`, reset after each action, lets leaves-the-battlefield triggers "look back in time" (`AbilityImpl.java:1337–1385`, CR 603.10a).
- The `Duration` enum's `onlyValidIfNoZoneChange` flag ends effects whose source changed zone (`M/constants/Duration.java`).

**Problem it solves.** "That creature", auras, delayed triggers and "until end of turn" effects must not follow a card to a new zone, and leaves-the-battlefield triggers need the object as it last existed.

**Mapping to us.**
- [code] We mint `p<n>` on every battlefield entry and delete the permanent when it leaves. That is our zcc: an old ID is simply gone. `StackItem.targets`, `matched` and `Permanent.effects` already behave correctly across flicker.
- Gaps [code]:
  - `graveyards: CardName[]` and `exile: {card}` have no identity, so "return target creature card" can't tell two copies apart, and a spell can't track its own card.
  - `DelayedTrigger.source` is a `CardName`, so a warp exile ("exile *it*") would grab a re-cast copy.
  - `lastKnown` holds only `{ card, controllerId }`, so "deals damage equal to its power" after it dies can't be computed.
- **Adapt:** mint an `ObjectId` on *every* zone change, not just battlefield entries (Arena does this; see `event-models.md` §2). Graveyard and exile entries become `{ id, card, ownerId }`. `ZoneChanged` carries a per-object `lastKnown` (computed stats, counters, controller, types, keywords, tapped, attached-to). Trigger and delayed-trigger references use object IDs.

**Verdict:** adopt the rule, adapt the mechanism (new ID per zone change instead of UUID plus counter). **Milestone:** M1. Rich LKI and graveyard IDs are small PRs, and warp in the worked example already needs them.

### A2. Durations

**How XMage does it [code].** `Duration` (`M/constants/Duration.java`) has 17 values: `OneUse, EndOfGame, WhileOnBattlefield, WhileControlled, WhileOnStack, WhileInGraveyard, EndOfTurn, UntilYourNextTurn, UntilYourNextEndStep, UntilNextEndStep, UntilEndCombatOfYourNextTurn, UntilYourNextUpkeepStep, UntilEndOfYourNextTurn, UntilSourceLeavesBattlefield, EndOfCombat, EndOfStep, Custom`. Each also says whether it ends on a source zone change and whether its controller is fixed. Effects end in three ways:
- **Turn-based:** `GameState` calls `removeEndOfCombatEffects()` (line 686) and `removeEndOfTurnEffects()` at cleanup (line 693, CR 514.2).
- **Source-based:** `ContinuousEffectsList.isInactive` (lines 117–220) removes `WhileOnBattlefield`/`EndOfCombat`/… effects whose source no longer exists, `UntilSourceLeavesBattlefield` when the source leaves, and `WhileControlled` when control changes.
- **"Your next turn" family:** `ContinuousEffectImpl.isInactive` (lines 297–360) checks against the starting controller's turn, including CR 800.4k for players who left.

**Mapping to us [code].** `Effect.until` is `'endOfTurn' | 'removed'`, and `controlUntil` handles only end of turn.

**Adapt** a subset: `endOfTurn | endOfCombat | untilYourNextTurn | whileSourceOnBattlefield | whileYouControlSource | indefinitely`, plus `sourceObjectId`.
- Turn-boundary expiries happen in `reduce` on the boundary GameEvent (`CombatEnded`, `CleanedUp`, the owner's `PhaseStarted{untap}`). That event lists what ended (ADR 0021), so replay stays exact.
- Source-dependent effects are filtered lazily in `stats()`: an effect whose source object ID is gone is ignored. That is XMage's `isInactive` without a stored event, and it stays deterministic because it is derived.

**Verdict:** adapt. **Milestone:** M1 for `endOfCombat` and `untilYourNextTurn`, which players say often ("until your next turn, your creatures have…"). The source-dependent ones come with M3 static abilities.

### A3. Continuous effects and layers (CR 613)

**How XMage does it [code].**
- `Layer` has the seven layers plus `PlayerEffects` and `RulesEffects`. `SubLayer` has 1a, 1b, 7a CDA, 7b set, 7c modify, 7d counters and 7e switch (`M/constants/Layer.java`, `SubLayer.java`).
- `ContinuousEffects.apply(game)` (`ContinuousEffects.java:971–1160`) resets the battlefield to printed values, then applies each layer in order.
- Layer 2 (control) re-applies in a loop until no control changes (lines 993–1010, for Mind Control stolen by Steal Enchantment).
- Dependency (CR 613.8, `isDependentTo`) is handled only in layers 3–6 (lines 1047, 1180).
- Timestamps: an effect gets an order number when it first becomes active (`updateTimestamps`, line 240). A static ability's effect counts only while its source is in a usable zone (`getLayeredEffects`, lines 189–222).

**Problem it solves.** Anthems, "becomes a creature", "loses all abilities", control swaps and P/T setting have to combine in a rules-defined order regardless of when they were cast.

**Mapping to us [code].** `stats()` implements 7b, 7c, 7d and 7e from effects stored on the permanent, and that part is correct. What's missing: effects that come from *other* permanents' static abilities (anthems such as "creatures you control get +1/+1" and keyword lords) and control as a layer.

**Minimal subset for a casual companion [inferred]:**

| Layer | Need | Notes |
| --- | --- | --- |
| 1 Copy | later (unmodeled → "check this") | Clones are common, but players can state "it's a copy of X" and we set the card |
| 2 Control | **M1** | Store control *effects* (`{controllerId, until, sourceObjectId, timestamp}`). The controller is the latest active one, else the owner. This fixes nested "until end of turn" steals, the player-leaves case (A6/A9) and "for as long as you control" |
| 3 Text | skip | |
| 4 Type | M3, narrow | "Becomes an N/N creature" for man-lands and animated artifacts; folds into 7b plus a type add |
| 5 Color | skip | |
| 6 Abilities | **M3** | Keyword grants from statics (lords, equipment) and "loses all abilities" (rare, flag it) |
| 7a CDA | M1 as stated values | `*/*` creatures: player-stated P/T, warning if unknown |
| 7b–7e | **have** | Add 7c from static abilities (anthems) in M3 |

Skip dependency: order by timestamp, and when two type- or ability-changing effects meet, add a "check this" RulesWarning. A static ability's timestamp is the GameEvent ID of its source's entry, which matches XMage's "when it became active" rule.

**Verdict:** adapt (layers 2, 6, 7 only; no dependency system). **Milestone:** layer 2 in M1; layers 6 and 7c-from-statics in M3.

### A4. Replacement and prevention effects (CR 614–616)

**How XMage does it [code].** Before an action happens, the engine creates a "would" GameEvent (for example `CREATE_TOKEN`) and calls `ContinuousEffects.replaceEvent` (`ContinuousEffects.java:850–968`):
1. It collects the applicable replacement effects (`checksEventType`, then `applies`).
2. It removes the ones already *consumed* for this event: each applies at most once (CR 614.5).
3. If one applies, it runs. If several apply, the affected player picks via `chooseReplacementEffect` (CR 616.1).
4. It repeats until none remain. `replaceEvent` returning true cancels the event.

Doubling Season is two custom inner classes calling `CreateTokenEvent.multiplyTokens(2)` (`Mage.Sets/src/mage/cards/d/DoublingSeason.java`), although the library already has `CreateTwiceThatManyTokensEffect` and `ModifyCountersAddedEffect` (`M/abilities/effects/common/replacement/`).

**Mapping to us.** ADR 0020 already rejects "would" events: replacements adjust the GameAction before GameEvents are made. A minimal version [inferred]:
- **Schema.** A `replacement` static ability: `{ on: 'createToken' | 'addCounters' | 'gainLife' | 'damage' | 'dies', applies: filter, modify: { multiply: 2 } | { add: 1 } | { instead: Zone } }`.
- **Where it runs.** `applyAction` collects the replacements from permanents for the action, applies each once, and records `replacedBy: AbilityId[]` on the GameEvent (the role of Arena's `ReplacementEffectApplied`).
- **Ordering without guessing.** When order matters (Hardened Scales plus Doubling Season: 1 counter becomes 4 or 3), compute the *set of possible outcomes* across all orders:
  - If the player stated a number and it's in the set, accept it silently.
  - If they stated one outside the set, raise a RulesWarning.
  - If nothing was stated and the outcomes differ, ask a PlayerQuestion `orderReplacements`.
  - If only one outcome is possible, apply it.

  This extends ADR 0013's "record the stated quantity, warn when a doubler is in play".

**Verdict:** adapt. **Milestone:** M3 (doublers, Hardened Scales, Rest in Peace-style "exile instead"). In M1, keep ADR 0013's stated quantity plus a warning.

### A5. Player choices and a PlayerQuestion vocabulary

**How XMage does it [code].**
- `PlayerQueryEvent.QueryType` (`M/game/events/PlayerQueryEvent.java:28`) lists `ASK, CHOOSE_CHOICE, CHOOSE_ABILITY, CHOOSE_MODE, PICK_TARGET, PICK_ABILITY, SELECT, PLAY_MANA, PLAY_X_MANA, AMOUNT, MULTI_AMOUNT, CHOOSE_PILE, …`.
- The engine calls synchronous `Player` methods (`M/players/Player.java:706–857`):
  - `chooseUse` (yes/no, used for "may" and "pay X?")
  - `choose(Target)` / `chooseTarget` (objects and players)
  - `chooseTargetAmount` (divide among targets)
  - `choose(Choice)` (creature type, color, card name)
  - `chooseMode`
  - `announceX`
  - `getAmount`
  - `getMultiAmount…` (split a total)
  - `chooseTriggeredAbility` (order triggers)
  - `chooseReplacementEffect`
  - `choosePile`
  - `selectAttackers` / `selectBlockers`
- Combat damage division uses `getAmount` per blocker (`CombatGroup.java:386`).

**Mapping to us.** ADR 0025 says the conversation fills blanks first and a PlayerQuestion is the fallback. Proposed typed vocabulary [inferred], a TableEvent per ADR 0020. Each question has `{ id, askedOf: PlayerId, about: StackItemId | AbilityId, text }` plus a typed `kind`. Each answer is schema-validated after the LLM reads the player's reply.

| `kind` | XMage counterpart | Answer type | Example |
| --- | --- | --- | --- |
| `yesNo` | `chooseUse` | `boolean` | "Esper Sentinel: does Theo pay {X}?" "Eternal Witness: do you return a card?" |
| `choosePlayers` | `choose(TargetPlayer)` | `PlayerId[]` (min/max) | "Blood Artist: who loses 1 life?" |
| `chooseObjects` | `choose(Target)` | `ObjectId[]` (min/max, filter, zone) | "Which zombie?" |
| `chooseMode` | `chooseMode` | `number[]` (mode indexes, min/max) | Boros Charm |
| `chooseNumber` | `announceX`, `getAmount` | `number` (min/max) | X spells, "pay any amount of life" |
| `divide` | `chooseTargetAmount`, `getMultiAmount` | `Record<id, number>` summing to total | Distribute damage or counters |
| `chooseOption` | `choose(Choice)` | `string` within `optionKind: 'creatureType' \| 'color' \| 'cardName' \| 'cardType'` | Herald's Horn, Cavern of Souls |
| `orderTriggers` | `chooseTriggeredAbility` | `StackItemId[]` | Only asked when the triggers differ (A6) |
| `orderReplacements` | `chooseReplacementEffect` | `AbilityId[]` | Only when outcomes differ (A4) |
| `tellHidden` | none (XMage knows hidden zones) | typed per question: `boolean`, `number`, `CardName` | "Goblin Guide: was it a land?" "How many cards did you draw?" |
| `confirmBoard` | none | `BoardCorrection[]` | Loop guard, unknown card resolved |

`tellHidden` is the one XMage has no need for. It's where our "hands and libraries are unknown" difference shows. Principle 4 limits the `text`: a question quotes the card's own words ("target player") and never lists legal choices or recommends one.

**Verdict:** adapt. **Milestone:** M1 for `yesNo`, `choosePlayers`, `chooseObjects`, `chooseNumber`, `tellHidden` and `confirmBoard` (ADR 0025's fallback). The rest arrive in M3.

### A6. Ordering simultaneous triggers (APNAP)

**How XMage does it [code].**
- `GameImpl.checkTriggered` (lines 2460–2494) walks players in APNAP order, starting from the active player.
- For each player it first runs triggers that don't use the stack. Then, while more than one remains, it asks `chooseTriggeredAbility`. Each chosen one goes on the stack, so the first chosen ends up lowest.
- The human client auto-orders triggers with the **same rule text and the same targets** and only asks when they differ. It also supports "always first" and "always last" per ability or rule text (`Mage.Server.Plugins/Mage.Player.Human/src/mage/player/human/HumanPlayer.java`, `chooseTriggeredAbility`).

**Mapping to us [code].** `apnapOrder` sorts by seat and keeps detection order within a player, with no way to choose.

**Adapt:**
- (a) Keep detection order as the default.
- (b) Treat identical triggers as interchangeable, so there's never a question.
- (c) Let a player's statement order their own triggers ("Blood Artist's first, then Zulaport"). The interpreter emits an `orderTriggers` GameAction, or a TimelineCorrection, that `settle` honors.
- (d) Ask `orderTriggers` only if a player asks or the results would differ. "Would differ" is hard to compute, so start with "players say it".

**Verdict:** adapt. **Milestone:** M1 for (a)–(c); (d) later.

### A7. Watchers versus querying this turn's GameEvents

**How XMage does it [code].** There are 88 library watchers (`M/watchers/common/`) plus 363 card-specific watcher classes in `Mage.Sets` [measured]. Each listens to every GameEvent (`Watcher.watch`), keeps a small tally, and resets each turn by scope `GAME | PLAYER | CARD` (`M/constants/WatcherScope.java`). Examples: `CreaturesDiedWatcher`, `SpellsCastWatcher`, `PlayerGainedLifeWatcher`, `AttackedThisTurnWatcher`, `FirstStrikeWatcher`, `CastSpellLastTurnWatcher`, `CommanderPlaysCountWatcher`. They exist because XMage doesn't keep an event log; `event-models.md` §3 has the details.

**Mapping to us.** We keep `gameEventsThisTurn`, and sealed turns keep their GameEvents (ADR 0019). Querying them is equivalent and replay-safe.

**Adopt XMage's watcher catalogue as a checklist** of what "history" questions cards ask. **Adapt** it into a `history.ts` module of named, pure queries over GameEvents, rather than ad hoc filters inside conditions: `creaturesDiedThisTurn`, `lifeGainedThisTurn(player)`, `spellsCastThisTurn(player)`, `attackedThisTurn(player)`, `dealtFirstStrikeDamage(object)`, `castLastTurn(player)` (from the previous `SealedTurn`).

Two requirements follow:
- GameEvents must carry what watchers record. `DamageDealt` needs its damage step (or the query has to read the surrounding `PhaseStarted`). `SpellCast` keeps its `from`.
- Performance is a non-issue at about 100 events per turn [inferred].

**Verdict:** adapt. **Milestone:** M1. `dealtFirstStrikeDamage` is needed for bug 1, and `lifeGainedThisTurn` already exists inline.

### A8. Target legality on cast and on resolution

**How XMage does it [code].**
- Targets are chosen on cast or when a trigger goes on the stack.
- On resolution, `Spell.resolve` (`Spell.java:273–320`) and `StackAbility.resolve` (line 84) call `Targets.stillLegal`. For each target, `TargetImpl.isLegal` (lines 549–590) drops it if its zone changed (zcc), if a `TargetEvent` replacement stops it (hexproof, protection, ward), or if it no longer matches the filter (`canTarget`).
- If all targets are illegal, the spell or ability fizzles (CR 608.2b). If only some are, it resolves and illegal targets are neither acted on nor affected ("an illegal target can't perform any actions or have any actions performed on it").

**Mapping to us [code].** `resolveTop` fizzles only when *every* target is gone (`allTargetsGone`). With a partially gone target, the remaining GameActions run, and the ones naming the missing object emit a `notOnBattlefield` RulesWarning, which is a false alarm. Filter legality ("target creature an opponent controls" after a control change, or a creature that stopped being a creature) isn't rechecked. In M1 that's acceptable, because spells carry player-stated targets without filters.

**Adapt:**
- Record per-target legality at resolution (`StackItem.illegalTargets`).
- Skip GameActions on illegal targets silently, as the rules do.
- Once Translations give targets filters (M3), recheck the filter, a zone change and hexproof/protection keywords at resolution.

**Verdict:** adopt (rule), M1 for the partial-fizzle skip; filter recheck in M3.

### A9. Main loop, priority and state-based actions

**How XMage does it [code].**
- `GameImpl.playPriority` loops over priority passes and calls `resolve()` when all players pass with the stack non-empty.
- Each time a player would get priority, `checkStateAndTriggered()` (lines 2439–2454) runs SBAs until none, handles batched simultaneous events, then `checkTriggered()`, and repeats. `processAction()` re-applies continuous effects in between (so "until end of turn" expiry can kill).
- `checkStateBasedActions()` (lines 2506–3080) covers 704.5a–s:
  - life, poison and commander damage
  - toughness 0 and lethal or deathtouch damage
  - planeswalker loyalty 0 (704.5i)
  - **legend rule (704.5j, line 3054)**
  - auras and equipment attachment legality (704.5m–n)
  - +1/+1 against −1/−1 counters
  - sagas (704.5s)
  - copies ceasing to exist
  - the commander-to-command-zone choice
- Creatures are moved one at a time, and `lkiShortLiving` makes the batch look simultaneous to leaves-the-battlefield triggers.

**Comparison [code].** Our `settle` has the same loop without priority (ADR 0011: resolve immediately unless a Response is said), which is right for a companion. Issues:
1. **Simultaneous SBA deaths** emit one `ZoneChanged` per object (`settle.ts`, `stateBasedActions`). `reduceInto` scans look-back triggers per event, so Blood Artist dying first in the batch misses the later deaths. ADR 0026 decided "one event". **Bug until implemented.**
2. **Missing SBAs**:
   - **legend rule** (very common in Commander: clones, two copies of a legend). The player chooses which to keep, so this is a PlayerQuestion or RulesWarning, never an automatic choice.
   - planeswalker 0 loyalty (planeswalkers are tracked through counters).
   - aura or equipment attached illegally (needs attachments, M3).
3. **Player leaving (CR 800.4a).** We exile what they controlled but didn't own. XMage first ends the control effects that gave them control (`PlayerLeftGameRangeAllTest.TestControlledBySorcery`: Wall of Air returns to player A). Fix with layer 2 control effects (A3). Update ADR 0028 through a new ADR.
4. **First-strike bookkeeping.** `dealsDamageIn` returns `double || !first || !firstStrikeHappened` from *current* keywords. XMage checks "dealt first-strike damage this combat" (`CombatGroup.dealsDamageThisStep`, lines 234–247). **Bug.**
5. **Trigger zones.** `scanTriggers` only looks at `state.permanents`. XMage triggered abilities have a zone (`TriggeredAbilityImpl(Zone zone, …)`), so command-zone (eminence), graveyard (Bloodghast-style) and hand (cycling) triggers work. That's needed in M3; add a `zone` field now.
6. **`DamageDealt` triggers aren't matched** in `triggers.ts` `matches()`. "Deals combat damage to a player" is the 7th most common XMage trigger class (509 cards, `DealsCombatDamageToAPlayerTriggeredAbility`) [measured]. Add it in M1.
7. **Cleanup repeat (CR 514.3a).** If SBAs or triggers happen during cleanup, there's another cleanup step. Rare; a later PR.

**Verdict:** adopt the SBA list and the batching rule; skip priority. **Milestone:** M1 for items 1–4 and 6.

### A10. XMage's test framework

**How XMage does it [code].** Tests extend `CardTestPlayerBase` (two players, 20 life) or `CardTestCommander4Players` / `CardTestCommanderDuelBase` / `CardTestMultiPlayerBase` (`Mage.Tests/src/test/java/org/mage/test/serverside/base/`). A scenario is declarative:

```java
addCard(Zone.BATTLEFIELD, playerA, "Blood Artist", 2);
castSpell(1, PhaseStep.PRECOMBAT_MAIN, playerA, "Lightning Bolt", "Blood Artist");
setChoice(playerA, "Whenever {this} or another creature"); // trigger order
addTarget(playerA, playerB, 2);
attack(2, playerA, "Silvercoat Lion", playerB);  block(2, playerB, "Wall of Air", "Silvercoat Lion");
setStrictChooseMode(true); setStopAt(1, PhaseStep.END_TURN); execute();
assertLife(playerA, 23); assertGraveyardCount(playerB, "Pillarfield Ox", 1);
```

- **Scale [measured]:** 2,297 test files, 8,102 `@Test` methods, 2,217 classes extending a `CardTest*` base.
- **Call counts:** `addCard` 29,398; `castSpell` 7,857; `setChoice` 4,840; `assertPermanentCount` 5,635; `assertLife` 3,842; `attack` 1,796.
- **Directories worth mining:** `combat/` (17 files), `multiplayer/` (23), `commander/`, `lki/`, `sba/`, `rollback/`, `cards/triggers/`, `cards/replacement/`.

**License [code + inferred].** `LICENSE.txt` is MIT (copyright line "2010 betasteward…"). Adapting test scenarios into TypeScript is a derivative of "substantial portions" only loosely. A scenario's facts (cards, steps, expected life) are rules facts, not expression, but copying them systematically is safest treated as derived work. **Obligation:** include XMage's copyright and permission notice (copy `LICENSE.txt` verbatim into `THIRD_PARTY_NOTICES.md` or `packages/engine/test/xmage/LICENSE`) and cite the source test path in each ported test. Not legal advice, but MIT is the most permissive common license, and this is its intended use.

**Mapping to us.** Add a scenario DSL in `packages/engine/test/scenario.ts` over `replayTurn`/`sealTurn`: `seat(…)`, `battlefield(player, card, n)`, `say(step, player, GameAction)`, `stopAt(turn, step)`, `expectLife(...)`, `expectGraveyard(...)`. It runs GameActions directly, without the interpreter. Cards come from a test catalog (Scryfall fields plus hand-written Translations for M3). Five good first ports [code]:

| # | XMage test | Rule | Our milestone | Expected today |
| --- | --- | --- | --- | --- |
| 1 | `combat/FirstStrikeTest.firstStrikeGainedMidCombat` and `firstStrikeLostMidCombat` | 702.7c second damage step | M1 | **Fails** (bug 1) |
| 2 | `cards/triggers/dies/BloodArtistTest.testDisabledEffectOnChangeZone` | 603.10a, simultaneous deaths and self-death | M1 (with a hand Translation) | **Fails** (ADR 0026 not implemented) |
| 3 | `multiplayer/PlayerLeftGameRangeAllTest.TestControlledBySorcery` / `TestControlledByEnchantment` | 800.4a | M1 | **Fails** (bug 2) |
| 4 | `lki/LastKnownInformationTest.testPersistTriggersInTime` (Murder Investigation: X = its power) | 608.2h LKI | M1/M3 | Can't express without rich LKI |
| 5 | `cards/replacement/DoublingSeasonTest.test_Counters_ByTrigger` / `test_Tokens_ByActivate` | 614, 616.1 | M3 | Not modeled |

Next in line: `combat/LifelinkInCombatTest`, `combat/DamageDistributionTest` (trample and divided damage, ADR 0012), `commander/duel/CommanderReplaceEffectTest`, `sba/PlaneswalkerRuleTest`, `multiplayer/ControlChangeTest`.

**Verdict:** adopt the scenario style and port tests. **Milestone:** M1 (DSL plus about 20 ports in combat, SBA and multiplayer).

---

## Part B: card knowledge (Translations)

### B11. How XMage represents cards

**[code]** Each card is a `CardImpl` subclass. The constructor composes library objects:
- `Ability` subclasses: 274 in `abilities/common`, 251 keywords.
- `Effect`s: 391 + 137 continuous + 22 counter classes in `effects/common`.
- `Cost`s: 70.
- `Target`s: 51 in `target/common`.
- `Filter`s, `Predicate`s and `StaticFilters` constants.
- `Condition`s: 213.
- `DynamicValue`s: 111.

Triggered abilities take modifiers: `optional`, `withInterveningIf(Condition)`, `withTriggerCondition`, `setTriggersLimitEachTurn` (`M/abilities/TriggeredAbilityImpl.java`). Example (`Mage.Sets/src/mage/cards/b/BloodArtist.java`):

```java
Ability ability = new DiesThisOrAnotherTriggeredAbility(new LoseLifeTargetEffect(1), false);
ability.addEffect(new GainLifeEffect(1).concatBy("and"));
ability.addTarget(new TargetPlayer());
```

Anything the library can't express is a helper class in the card file, usually `extends OneShotEffect`, sometimes `TriggeredAbilityImpl`, `ReplacementEffectImpl` or `Watcher`. `Mage.Verify`'s `VerifyCardDataTest.checkWrongAbilitiesText` compares the rules text XMage generates from these objects with MTGJSON's Oracle text, which is a built-in consistency check.

**Measured share** (`scripts/sample_cards.py`, `scripts/corpus_stats.py`; Scryfall Oracle bulk, Commander-legal, non-basic, by `edhrec_rank`; all 400 sampled cards found in XMage):

| Sample | Pure library | With custom helper classes | Non-land only: pure library |
| --- | --- | --- | --- |
| Top 200 by EDHREC rank | **171 (86%)** | 29 (14%) | 94/112 (84%) |
| Random 200 from ranks 201–3000 | **138 (69%)** | 62 (31%) | 96/151 (64%) |
| All 32,842 XMage card classes | **73%** | 8,880 (27%) | n/a |

Helper classes are mostly custom `OneShotEffect`s (21 of 43 in the top 200, 37 of 72 in ranks 201–3000). Then `ReplacementEffectImpl`, `TriggeredAbilityImpl`, `Condition`, mana-related classes and `Watcher`. Popular custom cards include Rhystic Study, Smothering Tithe, Esper Sentinel, Mystic Remora, Chaos Warp, Doubling Season, Teferi's Protection and Herald's Horn [measured].

### B12. Ways to source Translations

**Why "pure library" overstates convertibility [measured + inferred].** A converter must map each library class, its constructor overloads and its hidden defaults. For example, `BeginningOfUpkeepTriggeredAbility(effect)` defaults to "your upkeep". `scripts/coverage_proxy.py` counts a card as convertible only if it has no helpers and every trigger, effect and condition class it uses is in the top K across XMage:

| Whitelist size (triggers / effects / conditions) | Top 200, non-land: whole card | Ranks 201–3000, non-land: whole card | Ranks 201–3000: trigger condition only |
| --- | --- | --- | --- |
| 20 / 40 / 10 | 41% | 28% | 46% |
| 40 / 80 / 20 | 54% | 37% | 51% |
| 80 / 160 / 40 | 60% | 49% | 59% |
| 160 / 320 / 80 | 70% | 54% | 62% |

This is an upper bound: filters, dynamic values and chained modifiers still need mapping. Many library effects (draw, scry, search, discard) map to a `playerTask` anyway.

**Two extraction routes for XMage [inferred]:**
- **Source parser** (tree-sitter-java, run from a Node script): sees `new X(args)` but not the defaults inside library constructors, or `StaticFilters` contents. Brittle.
- **Reflection dump (preferred):** build XMage once (Maven and a JDK, free), instantiate each card, walk `getAbilities()` → effects, targets, filters (with predicates), conditions, durations and costs via reflection, and write JSON. Defaults and constants come out resolved. A TypeScript mapper then turns class names and fields into our schema. This keeps Java out of our runtime. It's a dev-time tool whose output (data) we commit with the MIT notice.

**Comparison [inferred unless marked]:**

| | XMage-derived (reflection dump plus mapper) | LLM from Oracle text (ADR 0005) | **Hybrid (recommended)** |
| --- | --- | --- | --- |
| How | Map about 100–250 library classes to our schema; unmapped abilities become `unmodeled` | Prompt with schema, Oracle text and few-shot examples; schema-validate; `unmodeled` when unsure | LLM drafts every card. The XMage fingerprint (trigger event, filter, controller, optional, intervening-if, targets, amounts) is compared automatically where the mapping is clean; disagreements go to human review |
| Coverage of non-land Commander cards | About 40–55% whole card, about 50–60% of trigger conditions [measured proxy] | About 95% get *something*; quality varies | LLM coverage, XMage-checked on about half |
| Accuracy | High where mapped (XMage is tested and text-verified), but mapper bugs are systematic | Guess: 85–95% on simple triggers, lower on "another", "you control", intervening-if versus effect condition, and optional | Highest. Systematic errors on either side show up as disagreements |
| Effort | 1 week for the dump and build; 3–6 weeks for the mappers (about 0.5–1 h per class including tests) | 1–2 weeks for the pipeline and an eval set of about 150 tricky cards | LLM pipeline plus fingerprint mappers for the top 40 triggers, 40 effects and 20 conditions: 3–4 weeks |
| New sets | XMage usually implements them within weeks; re-run the dump | Immediate | Immediate; checked once XMage catches up |
| Cost | Free (local JVM) | **Costs tokens.** About 3,000 cards × about 2k tokens is about 6M tokens one-off. Free tiers (Workers AI's daily allowance) may need batching over days. **Flag before adding a paid key.** | Same as LLM |
| License | MIT notice in the repo and in the shipped data | None beyond Scryfall's data terms | MIT notice (the checker's output is derived data) |

**Recommendation.** Keep ADR 0005's direction: the LLM is the primary translator, and the project stays free of GPL. Add a new ADR: "XMage as a Translation checker", with XMage's MIT notice in `THIRD_PARTY_NOTICES.md`.
- Build the reflection dump plus fingerprint mapper for the classes that cover most usage. The top triggers are `EntersBattlefield*` (4,365 cards), `Attacks*` (1,011), `BeginningOfUpkeep` (1,004), `SpellCastController` (734), `DiesSource` (641), `BeginningOfEndStep` (625), `DealsCombatDamageToAPlayer` (509), `BeginningOfCombat` (337) and `DiesCreature` (317) [measured].
- Use the fingerprint as an automated eval for every LLM-drafted Translation, and as CI regression data.
- Don't make XMage the primary source: its coverage is capped by our schema anyway, and the mapper becomes a second engine to maintain.

### B13. What XMage's vocabulary suggests for our Translation schema

Compared with `cards.ts` and `engine-model.md` §7 [code + inferred]:

1. **Trigger modifiers.** Add `optional: true` ("you may", XMage's `optional`) and `limit: { perTurn: n }` (XMage's `setTriggersLimitEachTurn`, 132 cards). Split conditions into `if` (intervening-if: checked on trigger and on resolution) and `condition` (checked only on trigger, XMage's `withTriggerCondition`), plus effect-level conditions (`ConditionalOneShotEffect`, 667 cards).
2. **`zone`** on triggered and static abilities: `battlefield` by default, also `graveyard`, `command` and `hand`.
3. **First-class targets.** Use `targets: [{ id, kind: 'player' | 'permanent' | 'cardInGraveyard' | 'spell', filter, min, max }]` and have effects reference `{ target: 't1' }`, replacing the `who: 'target'` blanks. This matches XMage's `addTarget` and gives A8 the filters it needs.
4. **Amounts.** Use `number | { count: ObjectFilter } | { powerOf: 'self' | 'matched' | 'target' } | { x: true }`, the useful subset of XMage's 111 `DynamicValue`s (`PermanentsOnBattlefieldCount` is the most used). `powerOf` reads LKI (A1).
5. **Richer `ObjectFilter`**, matching XMage predicates: `subtypes`, `supertypes` (legendary), `token: boolean`, `power` and `toughness` comparisons, `tapped`, `attacking`, `colors`, `name`. Keep `other` (`AnotherPredicate`).
6. **Multiple `when`s** for "enters or attacks" (`OrTriggeredAbility`, `EntersBattlefieldOrAttacksSourceTriggeredAbility`, 155 cards): `when: TriggerCondition | TriggerCondition[]`.
7. **Effects**, ordered by XMage usage: `createToken` (2,741), draw (→ `playerTask`, 2,590), `damage` (1,652), `counters` on source or target (2,593), `modify` boost or keyword grant with a duration and scope `self | target | eachMatching` (about 9,300 uses across the 11 most common Boost* and GainAbility* classes), `life` (1,362), `attach` (1,285), `destroy`/`exile`/`bounce` as `move` (about 2,150), `tap`/`untap`, `delayedTrigger` (359), `sacrifice` (the player chooses, so a question or task).
8. **Static kinds** beyond `entersTapped`: `continuous` (anthem or keyword lord: layer and scope), `replacement` (A4), and `reminder` for restrictions the engine shouldn't enforce. Propaganda and Ghostly Prison are both in the top 200; they become a RulesWarning or task when attacking that player. `EntersBattlefieldTappedUnlessAbility` appears on 27 of the top 200 cards (lands), so `entersTapped.unless` needs more conditions (you control a basic of type X, you control two or fewer other lands, two or more opponents).
9. **Durations** on every non-instant effect (A2).
10. **Modes** for charms and commands: `modes: { min, max, options: EffectTemplate[][] }`.

### B14. Roadmap: the smallest credible path to card knowledge in M1

[inferred] Order by value per effort:

1. **Already there or nearly there:** printed P/T, types, keywords (Scryfall `keywords`, filtered to real keyword abilities rather than ability words), mana value. These feed combat, SBAs and warnings now.
2. **Lands (cheap, high value):** `entersTapped` with an `unless` condition, from Oracle-text patterns plus LLM. Lands are 88 of the top 200.
3. **"Recognize the trigger" Translations for the cards in the table's decks.** Model `when`, `if`, `optional` and `targets` in full, and the effect as either:
   - (a) one of the common modeled templates (life, damage to each opponent, counters on self, create a token from Scryfall's `all_parts`, `modify` self), or
   - (b) a reminder `playerTask` carrying the Oracle sentence ("Smothering Tithe: Theo, pay {2} or Melissa makes a Treasure").

   The engine then knows *when* every common trigger fires (and stacks it in APNAP order). The interpreter, with the Oracle text in its board summary, fills in what happened. This needs only the 9 GameEvents plus `DamageDealt` matching.
4. **Generate at deck import, cache per card name, reuse across games** (ADR 0005). Run the XMage fingerprint check offline over the top 3,000 cards so most decks hit pre-checked Translations.
5. **Anthems, doublers and the remaining statics stay in M3**, because they need A3 and A4.

This moves the "app knows what cards do" moment to M1 for triggers and lands without waiting for the layer and replacement work.

---

## Proposed engine changes (each about one PR, in priority order)

| # | Change | Why (XMage reference) | Milestone |
| --- | --- | --- | --- |
| 1 | **Scenario test DSL** (`test/scenario.ts`) plus `THIRD_PARTY_NOTICES.md` with XMage's MIT notice; port the five scenarios in A10 as failing tests marked `todo` | A10 | M1 |
| 2 | **Fix the second combat damage step:** decide from "dealt first-strike damage this combat" (derived from `DamageDealt` in `firstStrikeDamage`), not current keywords | `CombatGroup.dealsDamageThisStep`, `FirstStrikeWatcher`; CR 702.7c | M1 |
| 3 | **Simultaneous SBA deaths as one `ZoneChanged`** (implement ADR 0026); port `BloodArtistTest` | `lkiShortLiving`, `AbilityImpl` look-back; CR 603.10a | M1 |
| 4 | **Control as effects** (`controlEffects[]` with duration and source; controller derived); fixes nested steals and **CR 800.4a** (control effects end before exiling); new ADR superseding that bullet of 0028 | Layer 2 loop; `PlayerLeftGameRangeAllTest` | M1 |
| 5 | **Rich LKI on `ZoneChanged`** (per-object stats, counters, controller, types); trigger `source.lastKnown` uses it | `rememberLKI`, `getPermanentOrLKIBattlefield` | M1 |
| 6 | **Object IDs for graveyard and exile entries**; delayed triggers reference object IDs, not card names | `MageObjectReference`, `FixedTarget` zcc; CR 400.7 | M1 |
| 7 | **Duration vocabulary** (`endOfTurn`, `endOfCombat`, `untilYourNextTurn`, `whileSourceOnBattlefield`, `whileYouControlSource`, `indefinitely`); boundary events list what ended | `Duration`, `ContinuousEffectsList.isInactive` | M1 |
| 8 | **`DamageDealt` trigger matching** ("deals combat damage to a player"; source filter, combat flag) | `DealsCombatDamageToAPlayerTriggeredAbility` (509 cards) | M1 |
| 9 | **Legend rule** as a PlayerQuestion or RulesWarning ("which one stays?"), and planeswalker 0 loyalty | `checkStateBasedActions` 704.5i–j | M1 |
| 10 | **Partial fizzle:** record illegal targets at resolution and skip their GameActions without false warnings | `Spell.resolve`, `TargetImpl.isLegal`; CR 608.2b | M1 |
| 11 | **`history.ts` named queries** (watcher equivalents), replacing inline filters | `watchers/common` | M1 |
| 12 | **PlayerQuestion types** (A5 table) as TableEvents, with an ADR | `PlayerQueryEvent`, `Player.choose*` | M1 |
| 13 | **`orderTriggers` GameAction**, with identical triggers treated as interchangeable | `checkTriggered`, `HumanPlayer.chooseTriggeredAbility` | M1 |
| 14 | **Translation schema v2** (B13 items 1–7) plus the Translation drafting tool and eval set | B12–B14 | M1 (triggers and lands) |
| 15 | **XMage reflection dump and fingerprint checker** (dev tool, not shipped code), with an ADR "XMage as a Translation checker" | B12 | M1→M3 |
| 16 | **Static continuous effects** (layer 7c anthems, layer 6 keyword grants), timestamped by the source's entry | `ContinuousEffects.apply`, `getLayeredEffects` | M3 |
| 17 | **Replacement effects**, minimal (tokens, counters, life gain, "exile instead"), with outcome-set ordering | `replaceEvent`, `CreateTwiceThatManyTokensEffect`, `ModifyCountersAddedEffect` | M3 |
| 18 | **Trigger `zone`** (command, graveyard, hand) | `TriggeredAbilityImpl(Zone …)` | M3 |
| 19 | Cleanup repeat (CR 514.3a), attachments and 704.5m | `checkStateBasedActions` | later |

---

## Scripts

The sampling and coverage numbers come from the scripts in [`xmage-scripts/`](xmage-scripts/) (`sample_cards.py`, `corpus_stats.py`, `coverage_proxy.py`), run against the Scryfall Oracle Cards bulk file and an XMage checkout at the commit below; `summary.json` holds their output.

## Sources

All read on 2026-11-21. XMage at commit `7fecba4e6f6c2d168432c65a3c213a65707fe385` (committed 2026-11-21): https://github.com/magefree/mage/tree/7fecba4e6f6c2d168432c65a3c213a65707fe385

- License: `LICENSE.txt` (MIT)
- Identity and LKI: `Mage/src/main/java/mage/MageObjectReference.java`, `…/target/targetpointer/FixedTarget.java`, `…/target/TargetImpl.java` (`isLegal`, `zoneChangeCounters`), `…/game/GameImpl.java` (`rememberLKI`, `checkShortLivingLKI`, `resetShortLivingLKI`), `…/abilities/AbilityImpl.java` (lines 1337–1400, look back in time)
- Durations: `…/constants/Duration.java`, `…/abilities/effects/ContinuousEffectImpl.java` (`isInactive`), `…/abilities/effects/ContinuousEffectsList.java` (`removeInactiveEffects`, `isInactive`), `…/game/GameState.java` (lines 686–693)
- Layers: `…/constants/Layer.java`, `…/constants/SubLayer.java`, `…/abilities/effects/ContinuousEffects.java` (`getLayeredEffects`, `updateTimestamps`, `apply`, `replaceEvent`)
- Replacement: `…/abilities/effects/common/replacement/CreateTwiceThatManyTokensEffect.java`, `ModifyCountersAddedEffect.java`; `Mage.Sets/src/mage/cards/d/DoublingSeason.java`
- Choices: `…/game/events/PlayerQueryEvent.java`, `…/players/Player.java`, `…/game/combat/CombatGroup.java`, `Mage.Server.Plugins/Mage.Player.Human/src/mage/player/human/HumanPlayer.java` (`chooseTriggeredAbility`)
- Loop and SBAs: `…/game/GameImpl.java` (`checkStateAndTriggered` line 2439, `checkTriggered` line 2460, `checkStateBasedActions` line 2506, legend rule line 3054, `playPriority`)
- Watchers: `…/watchers/Watcher.java`, `…/watchers/common/*` (88 classes), `…/constants/WatcherScope.java`
- Targets on resolution: `…/game/stack/Spell.java` (`resolve`), `…/game/stack/StackAbility.java`, `…/target/Targets.java` (`stillLegal`)
- Triggered ability options: `…/abilities/TriggeredAbilityImpl.java`
- Cards: `Mage.Sets/src/mage/cards/b/BloodArtist.java`, `i/ImpactTremors.java`, `p/Propaganda.java`, `e/EternalWitness.java`, `p/PhyrexianArena.java`
- Verification: `Mage.Verify/src/test/java/mage/verify/VerifyCardDataTest.java`
- Tests: `Mage.Tests/src/test/java/org/mage/test/serverside/base/CardTestPlayerBase.java`, `CardTestCommander4Players.java`, `…/combat/FirstStrikeTest.java`, `…/cards/triggers/dies/BloodArtistTest.java`, `…/multiplayer/PlayerLeftGameRangeAllTest.java`, `…/lki/LastKnownInformationTest.java`, `…/cards/replacement/DoublingSeasonTest.java`
- Scryfall Oracle Cards bulk data (`oc.jsonl.gz`, downloaded 2026-11-20): `edhrec_rank`, `legalities.commander`, `type_line`
- Ours: `packages/engine/src/*` on branch `engine/6-replay` @ `2be600c` (PRs #21–#26); `docs/engine-model.md`; ADRs 0005, 0011, 0013, 0015, 0020–0028; `docs/research/event-models.md`

Scripts (run with `python3 -I`, inputs passed as arguments): `scripts/sample_cards.py` (sampling and classification → `data/sample.csv`, `data/summary.json`), `scripts/corpus_stats.py` (whole corpus → `data/corpus_stats.txt`), `scripts/coverage_proxy.py` (whitelist coverage → `data/coverage_proxy.txt`).
