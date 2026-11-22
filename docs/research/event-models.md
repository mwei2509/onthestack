# Event models in other MTG engines

Research note for the E2/E3 event-model decisions: one GameEvent kind vs a separate TableEvent stream, and what is stored state vs derived. It compares our 18 `GameEventBody` types (`packages/engine/src/events.ts`, as of the engine PR stack #21–#26) with four systems. The decisions it informed are recorded in ADRs 0020 and 0021.

## What these projects are

- **MTG Arena**: Wizards of the Coast's official digital Magic game. Closed source; its Game Rules Engine (GRE) talks to the client in a protobuf format that the community has extracted from the client (riQQ/MtgaProto, client 2026.65.10). Trackers such as 17Lands and mtgatool parse its log file, which shows how the messages are used.
- **XMage** (also called Mage, MIT license): a free, open-source program for playing Magic online against people or AI, with a full rules engine covering over 32,000 cards. The closest open equivalent to Arena's engine.
- **Forge** (GPL): a free, open-source Magic game for desktop and Android, played mostly against AI opponents, with a full rules engine and scripts for nearly every card. Used here as a design reference only; nothing is copied (see ADR 0005).
- **Cockatrice** (GPL): a free, open-source virtual tabletop. Players move cards by hand, as with paper Magic over the internet; it enforces no rules. Useful as the opposite end: a pure record of what players did to the table.

**Confidence labels.** **[code]** means I read it in source or the `.proto`. **[inferred]** means it follows from names or structure but I didn't confirm it in code. Arena's server logic is never visible, so every claim about what the GRE *does* is inferred from its message schema and from parser comments.

All sources were read on 2026-11-21. Commit SHAs are listed under Sources.

---

## 1. Mapping our 18 GameEvent types

| Ours | Arena (AnnotationType, or a GRE message) | XMage `GameEvent.EventType` | Forge `GameEvent*` class / `TriggerType` | Cockatrice `GameEvent` |
| --- | --- | --- | --- | --- |
| PhaseStarted | `PhaseOrStepModified`, `NewTurnStarted`. `TurnInfo` in the state diff | `PHASE_CHANGED`, `STEP_CHANGED`, `BEGIN_TURN`, and a `*_STEP_PRE/_STEP/_STEP_POST` triple for each step | `GameEventTurnPhase`, `GameEventTurnBegan` / `Phase`, `TurnBegin` | `Event_SetActivePhase`, `Event_SetActivePlayer` |
| AttackersDeclared | No annotation. `DeclareAttackersReq` → `SubmitAttackersResp`, then `attackState`/`attackInfo` on `GameObjectInfo` | `DECLARING_ATTACKERS`, `DECLARE_ATTACKER` (replaceable), `ATTACKER_DECLARED`, `DECLARED_ATTACKERS`, `DEFENDER_ATTACKED` | `GameEventAttackersDeclared` / `AttackersDeclared`, `AttackersDeclaredOneTarget`, `Attacks` | `Event_SetCardAttr(AttrAttacking)`, by convention plus arrows |
| BlockersDeclared | No annotation. `DeclareBlockersReq` → `SubmitBlockersResp`, then `blockState`/`blockInfo` | `DECLARING_BLOCKERS`, `DECLARE_BLOCKER`, `BLOCKER_DECLARED` (one per blocker), `CREATURE_BLOCKED` (one per attacker), `UNBLOCKED_ATTACKER`, `DECLARED_BLOCKERS` | `GameEventBlockersDeclared` / `Blocks`, `AttackerBlocked(Once/ByCreature)`, `AttackerUnblocked(Once)`, `BlockersDeclared` | `Event_CreateArrow` (informal) |
| DamageAssignmentSet | Request/response only: `AssignDamageReq`/`AssignDamageConfirmation`, `OrderCombatDamageReq` | none (a player choice, not an event) | none (a `PlayerController` call) | none |
| CombatEnded | `PhaseOrStepModified` | `END_COMBAT_STEP_PRE/_POST`, `REMOVED_FROM_COMBAT` | `GameEventCombatEnded` / none | none |
| CleanedUp | none. Damage disappears in the diff, and `LayeredEffectDestroyed` covers ended effects [inferred] | `CLEANUP_STEP_PRE`, `REMOVE_DAMAGE_EOT`, `AT_END_OF_TURN` | none (only `GameEventTurnPhase`) | none |
| DamageDealt | `DamageDealt` (+ `DamageSource`, `LinkedDamage`) | `DAMAGE_PLAYER`→`DAMAGED_PLAYER`, `DAMAGE_PERMANENT`→`DAMAGED_PERMANENT`, 6× `DAMAGED_BATCH_*`, `COMBAT_DAMAGE_APPLIED` | `GameEventPlayerDamaged`, `GameEventCardDamaged` / `DamageDone`, `DamageDoneOnce`, `DamageAll`, `ExcessDamage` | none (players edit their life counter) |
| LifeChanged | `ModifiedLife` | `GAIN_LIFE`→`GAINED_LIFE`, `LOSE_LIFE`→`LOST_LIFE`, `PAY_LIFE`→`LIFE_PAID`, `PLAYER_LIFE_CHANGE`, `DAMAGE_CAUSES_LIFE_LOSS`, `LOST_LIFE_BATCH*` | `GameEventPlayerLivesChanged` / `LifeGained`, `LifeLost`, `LifeLostAll`, `PayLife` | `Event_SetCounter` (life is a player counter) |
| SpellCast | `ZoneTransfer` with `category: CastSpell` (+ `ManaPaid`, `TargetSpec`) | `CAST_SPELL` (pre), `SPELL_CAST` (post) | `GameEventSpellAbilityCast` / `SpellCast`, `SpellCastOrCopy`, `SpellAbilityCast` | `Event_MoveCard` to the `stack` zone |
| StackItemResolved | `ResolutionStart`, `ResolutionComplete`. `ZoneTransfer category: Countered` | `RESOLVING_ABILITY`, `COUNTER`→`COUNTERED` (no generic "spell resolved") | `GameEventSpellResolved`, `GameEventSpellRemovedFromStack` / `AbilityResolves`, `Countered` | `Event_MoveCard` off the stack |
| AbilityTriggered | `AbilityInstanceCreated` (+ `TriggeringObject`). Object type `Ability`/`TriggerHolder` | `TRIGGERED_ABILITY` (fired after the push onto the stack) [code] | no GameEvent (a `GameEventZone` stack add at most) / `AbilityTriggered` | none |
| ZoneChanged | `ZoneTransfer` (categories seen in parsers: `PlayLand`, `Draw`, `CastSpell`, `Discard`, `Put`, `Return`, `Exile`, `Destroy`, `SBA_Damage`, `Countered`), `ObjectIdChanged`, `TokenCreated`, `TokenDeleted` | `ZONE_CHANGE`, `ZONE_CHANGE_BATCH`, `ENTERS_THE_BATTLEFIELD(_SELF/_CONTROL/_COPY)`, `DESTROYED_PERMANENT`, `SACRIFICED_PERMANENT`, `CREATED_TOKEN(S)`, `DREW_CARD`, `DISCARDED_CARD`, `MILLED_CARD`, `PLAY_LAND`/`LAND_PLAYED` | `GameEventCardChangeZone`, `GameEventTokenCreated`, `GameEventCardDestroyed`, `GameEventCardSacrificed`, `GameEventLandPlayed` / `ChangesZone`, `ChangesZoneAll`, `Destroyed`, `Sacrificed`, `Exiled`, `Drawn`, `Discarded`, `Milled`, `TokenCreated`, `LandPlayed` | `Event_MoveCard`, `Event_CreateToken`, `Event_DestroyCard`, `Event_DrawCards` |
| CountersChanged | `CounterAdded`, `CounterRemoved` (+ persistent `Counter`) | `ADD_COUNTER(S)`→`COUNTER(S)_ADDED`, `REMOVE_COUNTER(S)`→`COUNTER(S)_REMOVED`, `PROLIFERATED` | `GameEventCardCounters`, `GameEventPlayerCounters`, `GameEventPlayerPoisoned` / `CounterAdded(Once/All)`, `CounterRemoved(Once)` | `Event_SetCardCounter`, `Event_SetCounter` (player counters, poison included) |
| PlayerLost | `LossOfGame` (and `WinTheGame`) | `LOSES`→`LOST` (and `WINS`) | `GameEventGameOutcome` / `LosesGame` | `GameEventContext` `CONCEDE` |
| TapChanged | `TappedUntappedPermanent` | `TAP`→`TAPPED`, `UNTAP`→`UNTAPPED`, `TAPPED_BATCH`, `UNTAPPED_BATCH`, `TAPPED_FOR_MANA` | `GameEventCardTapped` / `Taps`, `Untaps`, `TapAll`, `UntapAll`, `TapsForMana` | `Event_SetCardAttr(AttrTapped)` |
| ControlChanged | `ControllerChanged` | `GAIN_CONTROL`→`GAINED_CONTROL`, `LOSE_CONTROL`→`LOST_CONTROL` | no card-level GameEvent (`GameEventPlayerControl` is Mindslaver-style player control) / `ChangesController` | `Event_MoveCard` to another player's table (`target_player_id`) |
| EffectAdded | `LayeredEffectCreated`/`LayeredEffectDestroyed` (+ persistent `LayeredEffect`, `ModifiedPower`/`Toughness`/`Type`/`Color`, `AddAbility`, `RemoveAbility`) | none. Continuous effects live in `GameState.effects`, not in events | `GameEventCardStatsChanged` (a redraw hint) / none | `Event_SetCardAttr(AttrPT / AttrAnnotation)` |
| PlayerTaskCreated | none as an annotation. Closest are `PromptReq` and `UIMessage` (non-rules channels) | none. Closest is `PlayerQueryEvent` (prompt channel) | none. Closest is a `PlayerController` call | none. Closest is `Event_GameSay` (chat) |

**Takeaways.** 16 of our 18 types have a direct rules-level counterpart in both Arena and XMage. Three of ours have no rules-level counterpart in any of the engines:

- `DamageAssignmentSet`: everywhere else it is a request/response, not an event.
- `CleanedUp`: XMage has step events plus `REMOVE_DAMAGE_EOT`, and the others have nothing.
- `PlayerTaskCreated`: never a game event anywhere.

`EffectAdded` exists only in Arena.

---

## 2. Event types they have that we lack

The "need" column is my call: **M1**, **M3**, or **never** (unmodeled → "check this card" task, or out of scope).

| Group | Examples | Need |
| --- | --- | --- |
| **Pre/replaceable "would" events** | XMage `DAMAGE_PLAYER`, `DRAW_CARD`, `GAIN_LIFE`, `ZONE_CHANGE`… (`replaceEvent` before `fireEvent`) | **never** as events. Apply replacement while turning a GameAction into GameEvents, and record only the outcome (CR 614, 603.2g) |
| **Batch events** | XMage `DAMAGED_BATCH_FOR_*`, `ZONE_CHANGE_BATCH`, `TAPPED_BATCH`, `MILLED_CARDS_BATCH_*`. Forge `*Once`/`*All` modes. Arena `GroupedIds` | **never** as separate types. Our events already carry arrays, so "one or more" is a predicate |
| **Object identity** | Arena `ObjectIdChanged` (new instance id on a zone change, CR 400.7) | **M1, implicit**. `ZoneChanged` should keep minting new `ObjectId`s. No new event needed |
| **Hidden-zone actions** | draw, discard, mill, scry, surveil, search, shuffle, reveal (XMage `DREW_CARD`, `SCRIED`, `LIBRARY_SEARCHED`…, Arena `Scry`, `Shuffle`, `CardRevealed`, Forge `GameEventScry`, `GameEventShuffle`) | **M3** as `ZoneChanged` verbs when announced. Search/shuffle are **never** |
| **Land play** | XMage `LAND_PLAYED`, Forge `GameEventLandPlayed`, Arena `ZoneTransfer category PlayLand` | **M1** as a `how: 'play'` tag on `ZoneChanged` (feeds the "second land" RulesWarning) |
| **Targeting** | XMage `TARGETED`, Forge `BecomesTarget(Once)`, Arena `TargetSpec`, `PlayerSelectingTargets` | **M3** (ward, heroic) |
| **Activated abilities / copies** | XMage `ACTIVATED_ABILITY`, `COPIED_STACKOBJECT`. Forge `AbilityCast`, `SpellCopy`. Arena `CopiedObject` | **M3** |
| **Mana** | XMage `ADD_MANA`, `MANA_ADDED`, `MANA_PAID`. Arena `ManaPaid`, `ManaDetails`, `ColorProduction` | **never** (no mana pools) |
| **Attach** | XMage `ATTACHED`/`UNATTACHED`. Arena `CreateAttachment`, `Attachment`. Forge `GameEventCardAttachment`. Cockatrice `Event_AttachCard` | **M3** (equipment and auras matter for SBA 704.5m) |
| **Face and phasing** | transform, face down/up, flip, mutate, phase in/out (all four have some) | **M3** |
| **Designations** | monarch, initiative, day/night, dungeon, ring, city's blessing (XMage `BECOMES_MONARCH`, `TOOK_INITIATIVE`. Arena `Designation`, `GainDesignation`, `LoseDesignation`, `DungeonStatus`) | **M3** (monarch and initiative are common in Commander) |
| **Keyword actions** | explore, connive, investigate, proliferate, fight, crew, saddle, venture, discover, forage… | **M3**, on demand per translated card |
| **Randomness / voting** | dice, coins, vote, clash | **M3** |
| **Regeneration / prevention** | XMage `REGENERATED`, `PREVENTED_DAMAGE`. Arena `RegeneratePending`, `PermanentRegenerated` | **M3** (rare) |
| **"This turn" facts as state** | Arena persistent `EnteredZoneThisTurn`, `DamagedThisTurn`, `CrewedThisTurn`, `GamewideHistoryCount` | **never** as stored facts. Derive them from `gameEventsThisTurn` |
| **Game lifecycle** | Forge `GameEventGameStarted`/`Finished`/`Mulligan`/`SnapshotRestored`. XMage `BEGINNING`. Cockatrice `GAME_STATE_CHANGED` | **TableEvent** (start, end, seating), not GameEvent. Mulligan is **never** |
| **Move-suggesting UI** | Arena `ShouldntPlay`, `HighlightReason`, `PredictedDirectDamage`, `UseOrCostsManaCost` | **never** (principle 4) |

---

## 3. How each system separates rules events from log/UI/table records and from prompts

**Arena [code: schema, inferred: semantics].** A single `GREToClientMessage` envelope carries several channels:

- **State.** `GameStateMessage` with `type: Full | Diff`, `gameStateId`/`prevGameStateId`, objects and zones, and `diffDeletedInstanceIds`. This is a *snapshot/diff* channel, not an event log.
- **Per-update "what just happened".** `annotations[]` are attached to each state diff. Each one has an `affectorId`, `affectedIds[]`, one or more `AnnotationType`s and key/value `details`. They explain the diff (zone moved because of `category: Destroy`) and are not replayable without the state.
- **Lingering facts.** `persistentAnnotations[]` are ongoing facts (attachments, layered effects, counters, "entered this turn"), removed via `diffDeletedPersistentAnnotationIds`. In our terms they are derived views, close to Banners.
- **Prompts.** Separate message types for decisions: `ActionsAvailableReq`, `DeclareAttackersReq`, `SelectTargetsReq`, `OrderReq`, `AssignDamageReq`, `PromptReq`, `OptionalActionMessage`, `NumericInputReq` and so on. The client answers with the matching `ClientMessageType` (`…Resp`). `TurnInfo` carries both `priorityPlayer` and `decisionPlayer`.
- **Non-rules UI.** `UIMessage` (`onHover`, `onSelect`, `onChat`, `onShuffle`), `TimerStateMessage`, `EdictalMessage`. 17Lands keeps only state messages and `onChat` UI messages for its game history [code].
- **Ordering caveat.** mtgatool's parser notes that the GRE "resolves a whole state server-side and emits its conclusion before the events that produced it", so a game-over message can arrive before the killing-blow damage [code: parser comment]. Arena's annotations are explanations of diffs, not a source-of-truth log.

**XMage [code].** It has three unrelated channels:

1. `GameEvent` (≈300 `EventType`s) is purely in-engine. `fireEvent` → `GameState.handleEvent` calls `watchers.watch`, `delayed.checkTriggers` and `triggers.checkTriggers`. `replaceEvent` runs replacement and prevention effects on the "pre" event first. Events are not persisted: the engine keeps `GameState` copies (`saveState`/`bookmarkState`/`restoreState`) for rollback, and **Watchers** accumulate history ("cards drawn this turn").
2. `TableEvent` (`UPDATE`, `INFO`, `STATUS`, `ERROR`, timers…) goes to clients. `informPlayers(String)` → `fireTableEvent(INFO, message)` is the human-readable game log, written as free-text strings separate from GameEvents.
3. `PlayerQueryEvent` (`ASK`, `CHOOSE_CHOICE`, `CHOOSE_MODE`, `PICK_TARGET`, `SELECT`, `AMOUNT`, `MULTI_AMOUNT`, `PLAY_MANA`…) are prompts to a player.

The **pre/post pairs** (`DAMAGE_PLAYER`/`DAMAGED_PLAYER`, `ZONE_CHANGE` replaceable, `ENTERS_THE_BATTLEFIELD_SELF/_CONTROL/_COPY` ordered per CR 616.1a–d) exist so replacement effects get a "would" event to modify or cancel before anything happens. Triggers listen to the post event (CR 603.2g).

**Batch events** (`EventType(isBatch=true)`) are synthesized in `GameState.addSimultaneous*` from events that happened at the same time, so that "one or more" triggers fire once.

**Forge [code].** It has two vocabularies:

- `forge.game.event.GameEvent` (~60 record classes) carry `CardView`/`PlayerView` *view* objects. They are dispatched with a visitor to UI, sound and log. `GameLogFormatter` is an `IGameEventVisitor<GameLogEntry>` that `@Subscribe`s to them, and `GameEvent.isRedrawHint()` flags events that "often fire when nothing has changed" and only tell a GUI to redraw. **They are not used for rules.**
- **Rules** use `TriggerType` (149 modes), fired via `TriggerHandler.runTrigger(mode, runParams)` with a parameter map.
- **Prompts** are synchronous calls on `PlayerController` (choose targets, order simultaneous abilities, assign combat damage), not events.

Forge shows that a log/UI event stream and a rules-trigger vocabulary can diverge a lot: compare `GameEventCardStatsChanged` with `ChangesZone` + `ChangesZoneAll` + `Exiled`.

**Cockatrice [code].** There is no rules engine. Every `GameEvent` (`MOVE_CARD`, `SET_CARD_ATTR`, `SET_COUNTER`, `CREATE_TOKEN`, `DRAW_CARDS`, `SET_ACTIVE_PHASE`, `ROLL_DIE`…) is a literal table edit.

- Events are wrapped in `GameEventContainer { event_list, context, seconds_elapsed, forced_by_judge }`. `GameEventContext` (`CONCEDE`, `MULLIGAN`, `UNDO_DRAW`, `MOVE_CARD`, `DECK_SELECT`…) says *why* a batch happened.
- `Event_GameLogNotice` is documented as "could safely be dropped without affect[ing] the game state".
- `Event_GameSay` is chat.
- `GameReplay` is just `repeated GameEventContainer`, so a replay is the event log.

This is the closest analogue to our "table record" half: context, judge-forced and droppable notices are kept separate from state-changing events.

---

## 4. How each stores triggers that are waiting for the stack

| System | Where waiting triggers live | State or derived? |
| --- | --- | --- |
| Arena | A `ZoneType` named **`Pending`** (11) and object types `Ability`/`TriggerHolder`. `OrderReq` asks the player to order them. `PendingEffect`/`DelayedTriggerAffectees` annotations exist | **State** (objects in a zone, shipped in the diff) [inferred] |
| XMage | `GameState.triggered`: `List<TriggeredAbility>`, commented "raised triggers, waiting to resolve". `checkTriggered()` drains it per player in APNAP order, and `chooseTriggeredAbility` asks when there are 2+. Also `simultaneousEvents` (for batches) and `delayed` | **State**, deep-copied with every snapshot [code] |
| Forge | `TriggerHandler.waitingTriggers` holds trigger *runs* deferred while the stack is frozen. `MagicStack.simultaneousStackEntryList` holds abilities that triggered but aren't on the stack yet, ordered per player via `orderAndPlaySimultaneousSa` | **State**, two stages [code] |
| Cockatrice | none (players put triggers on the stack by hand, if they track them at all) | n/a |
| **Ours** | `GameState.pendingTriggers`, filled inside `reduceInto` by `scanTriggers` and removed by `AbilityTriggered` | **Stored, but derived by the fold.** No event creates it |

None of the four emits an event for "triggered, waiting". The only event is the move onto the stack (XMage `TRIGGERED_ABILITY` after `stack.push`, Arena `AbilityInstanceCreated`). The same goes for ID counters: XMage uses UUIDs, Arena issues instance ids server-side and announces renames with `ObjectIdChanged`, and Cockatrice's `Event_MoveCard.new_card_id` carries the minted id in the event.

---

## 5. What this suggests for our E2/E3 decisions

1. **Split the streams, as all four systems do.** Keep `GameEvent` for Comprehensive Rules happenings only. Move `PlayerTaskCreated` (and later PlayerQuestion asked/answered, RulesWarning raised, TimelineCorrection, game start/seat/end) into a `TableEvent` stream. The test for membership: *does any rule or trigger read it, and does folding it change `GameState`?* If neither, it is a TableEvent. Replaying GameEvents alone must rebuild `GameState`, and a second fold over TableEvents builds the TableView extras (open Questions, Tasks, Warnings).
2. **Model a correction as a pair, like Cockatrice's container.** A BoardCorrection or "do it anyway" override should produce a TableEvent (who, what was said, `override: true`) *and* ordinary GameEvents with `causedBy: { rule: 'boardCorrection' }`. Don't create a "CorrectionMade" GameEvent that `reduce` has to special-case.
3. **Keep `pendingTriggers` and `nextIds` as fold-derived state, and say so in the ADR.** Every engine stores waiting triggers in state and emits no event for them, which is what we do. Two requirements follow:
   - snapshots (ADR 0004/0014) must include `pendingTriggers`;
   - a fast-check property must assert that `fold(events)` equals the incrementally built state, *including* `pendingTriggers` and `nextIds`.

   Prefer events that carry the IDs they mint (`ZoneChanged.objects`, `SpellCast.stackItemId` already do). Then `nextIds` is a cache recomputable as max+1 and never a hidden input.
4. **Don't adopt XMage's pre/post pairs, and don't add batch types.** Apply replacement while converting a GameAction to GameEvents, and record only what happened (CR 614, 603.2g). If provenance matters later, add an optional `replacedBy` field, which plays the role of Arena's `ReplacementEffectApplied` annotation. Keep array payloads (`DamageDealt.damage[]`, `ZoneChanged.objects[]`, `AttackersDeclared.attacks[]`) so that "one or more" triggers stay predicates.
5. **Recheck the three outliers.**
   - `DamageAssignmentSet` is a player's choice (a request/response in Arena, a controller call in Forge). It changes state that combat damage reads, so it can stay a GameEvent. Document it as "a recorded player choice (CR 510.1c–d)", with the PlayerStatement as its cause.
   - `CleanedUp` is fine: it matches CR 514.2's single simultaneous event.
   - `EffectAdded` matches Arena's `LayeredEffectCreated`. Consider adding `EffectEnded` for symmetry, rather than ending effects silently inside `CleanedUp`.
6. **Small vocabulary gaps for M1.** Add `how: 'play'` to `ZoneChanged` for land drops. Add Arena-style `this turn` queries over `gameEventsThisTurn` instead of stored flags. Everything else in section 2 can wait for M3 card translations.

---

## Sources (all read 2026-11-21)

- Arena protobuf, extracted from client 2026.65.10: https://github.com/riQQ/MtgaProto/blob/master/messages.proto (`AnnotationType`, `GREMessageType`, `ClientMessageType`, `GameStateMessage`, `AnnotationInfo`, `ZoneType`, `GameObjectType`, `TurnInfo`, `UIMessage`, `OrderReq`). README: https://github.com/riQQ/MtgaProto
- mtgatool GRE interpreter: https://github.com/mtgatool/mtgatool-desktop/blob/dev/src/background/greToClientInterpreter.ts (annotation handlers, ZoneTransfer categories, ordering comment)
- 17Lands log client: https://github.com/rconroy293/mtga-log-client/blob/master/src/python/seventeenlands/mtga_follower.py (GRE message routing)
- XMage @ `7fecba4e`: https://github.com/magefree/mage/blob/master/Mage/src/main/java/mage/game/events/GameEvent.java, …/game/GameState.java (`triggered`, `simultaneousEvents`, `handleEvent`, `replaceEvent`), …/game/GameImpl.java (`checkStateAndTriggered`, `checkTriggered`, `addTriggeredAbility`, `informPlayers`, `saveState`), …/abilities/TriggeredAbilities.java, …/game/events/TableEvent.java, …/game/events/PlayerQueryEvent.java, …/players/PlayerImpl.java (`triggerAbility`)
- Forge @ `649b5250`: https://github.com/Card-Forge/forge/tree/master/forge-game/src/main/java/forge/game/event (GameEvent classes, `GameEvent.isRedrawHint`), …/game/trigger/TriggerType.java, …/game/trigger/TriggerHandler.java (`waitingTriggers`, `runTrigger`), …/game/zone/MagicStack.java (`simultaneousStackEntryList`), …/game/GameLogFormatter.java, …/game/player/PlayerController.java
- Cockatrice @ `b5e5ba14`: https://github.com/Cockatrice/Cockatrice/tree/master/libcockatrice_protocol/libcockatrice/protocol/pb (`game_event.proto`, `game_event_container.proto`, `game_event_context.proto`, `event_move_card.proto`, `event_set_card_attr.proto`, `card_attributes.proto`, `event_set_counter.proto`, `event_set_card_counter.proto`, `event_game_log_notice.proto`, `game_replay.proto`)
- Our side: `packages/engine/src/events.ts`, `state.ts`, `reduce.ts` (engine PR stack #21–#26), `docs/research/triggers.md`, `docs/research/rules-digest.md`, `GLOSSARY.md`
