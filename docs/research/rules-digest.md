# Rules digest for the engine

Developer-facing digest of the Comprehensive Rules (CR, effective 2026-11-06) for On The Stack. Every claim cites a rule number. It is scoped to what a correctable shadow copy of a casual Commander game needs. Event names follow `docs/research/triggers.md`.

Milestone tags: **M1** = core loop (life, combat, commander damage, SBAs, manual stack). **M3** = automatic triggers from card translations. **Never** = stays a Task, a Question or player-stated.

Vocabulary used below: *Warning*, *Question*, *Task*, *Banner*, *Staged*, *Commit* as in `GLOSSARY.md`.

The recommendations in section 9 were inputs to the engine-model design (#10). Where the decision differs from a recommendation, `docs/adr/` records what was decided.

---

## 0. The rules in five lines

1. A turn is 5 phases; beginning, combat and ending phases have steps (500.1). Steps can't be skipped by "nothing happening" (500.1), but declare blockers and combat damage are skipped if nothing attacks (508.8).
2. Each step: turn-based actions first (703), then "at the beginning of" triggers (500.6, 603.2b), then the active player gets priority (117.3a). Exceptions: no priority in untap (502.4) and usually not in cleanup (514.3).
3. Whenever a player *would* receive priority: run SBAs until none happen, then put waiting triggers on the stack (APNAP), repeat until neither happens (117.5, 704.3, 603.3b).
4. The step ends only when the stack is empty and all players pass in succession (500.2, 117.4).
5. Turn-based actions, SBAs, special actions (playing a land) and mana abilities don't use the stack and can't be responded to (405.6, 116, 605.3b, 703, 704.1).

---

## 1. Turn structure (500–514)

General rules for every step:

| Rule | What it means for the engine |
|---|---|
| 500.4 | As a step/phase begins, effects lasting "until [that step/phase]" expire. |
| 500.5 | As a step/phase ends, effects lasting "until end of [that step/phase]" expire; mana empties (ignored: no mana tracking). |
| 500.6, 603.2b | "At the beginning of [step]" triggers trigger as the step begins; they go on the stack the next time a player would get priority. |
| 500.7–500.11 | Extra turns/phases/steps are inserted directly after the named one, most recently created first; skipping = proceed as if it didn't exist. (Extra combats are common in Commander: model the turn as a list of steps, not a fixed enum.) |
| 500.12 | No game events between steps. Every Event belongs to exactly one step. |

### Per-step table

| Step | (a) Turn-based actions (automatic) | (b) Triggers | (c) Priority? | (d) App should | (e) Engine tracks |
|---|---|---|---|---|---|
| **Untap** (502) | 502.1 phasing (phase out/in, simultaneous); 502.2 day/night flips (night if previous active player cast 0 spells, day if they cast 2+; see 732); 502.3 active player untaps their permanents (effects can stop some) | Triggers that happen here (e.g. "whenever X untaps") wait until upkeep (502.4) | **No** (502.4, 117.3a) | Auto-untap the active player's tracked permanents. Anything said "during untap" is staged into upkeep. Banner for "doesn't untap" effects if modeled; otherwise players correct. | Tapped state; "doesn't untap" flags (M3); day/night (M3, needs per-turn spell count) |
| **Upkeep** (503) | None (503.1) | "At the beginning of your/each upkeep" (very common: Phyrexian Arena, initiative 727.2 venture, cumulative upkeep, echo) | Yes | Show reminders for upkeep triggers of permanents in play; auto-run in preview. | Delayed triggers "at the beginning of the next upkeep" (603.7) |
| **Draw** (504) | 504.1 active player draws a card (hidden zone) | "At the beginning of your draw step"; "whenever you draw" (CardDrawn, M3) | Yes (504.2) | Nothing to do (physical draw). Optionally emit an automatic `CardDrawn{turnBasedDraw:true}` so "except the first card drawn in each draw step" (Orcish Bowmasters) and "first card each turn" conditions work (M3). | Cards-drawn-this-turn count per player (M3, partly player-announced) |
| **Precombat main** (505) | 505.3 archenemy (never); 505.4 put a lore counter on each Saga (M3); 505.5 Attractions (never) | Saga chapter triggers (715, via lore counters); "at the beginning of your precombat main phase" | Yes (505.6) | Accept casts, land drops, activations. Warn on: second land drop (505.6b, 305.2); sorcery-speed spell with nonempty stack or outside a main phase (117.1a, 307.1). | Lands played this turn per player; Saga lore counters (M3) |
| **Beginning of combat** (507) | 507.1 choose defending player only if opponents aren't all defenders. **Commander default is attack-multiple-players (903.2, 802.2): every opponent is a defending player, so no choice.** | "At the beginning of combat on your turn" (common: Hellrider-style, equipment auto-attach, Krenko variants) | Yes (507.2) | This is the "before attacks" window: "before combat I tap your creature" lands here (506.8a). Show beginning-of-combat reminders. | Step marker so staged "before attacks" items sort before the declaration |
| **Declare attackers** (508) | 508.1 active player declares attackers and what each attacks (player, planeswalker or battle; 508.1b, 802.3); attackers tap (508.1f) unless vigilance (702.20b); costs to attack (508.1g–j) | "Whenever X attacks", "whenever you attack", "whenever a player attacks you" (508.3a–e); trigger only on declaration (508.2a) | Yes (508.2), after triggers are put on the stack (508.2b) | Prompt "Say your attacks" (do not list candidates: principle 4). Warn per section 2. If no attackers declared and none entered attacking, skip blockers and damage (508.8). | Attacker → attacked object; "attacked this turn" (raid, 508.6); "had to attack" (506.7, Never) |
| **Declare blockers** (509) | 509.1 each defending player declares blocks, **in APNAP order in multiplayer (802.4)**; each blocker blocks one attacker (509.1a) unless it can block more; blocked/unblocked status fixed (509.1h) | "Whenever X blocks", "becomes blocked", "attacks and isn't blocked" (509.3a–g; the last triggers here, 508.3f) | Yes (509.2) | Collect each defender's answer (Ready, GLOSSARY). Warn per section 2. After the last defender is Ready, auto-run damage in preview; the priority window here is where "Giant Growth after blocks" is inserted. | Blocker → attacker(s); blocked flag per attacker (sticky) |
| **Combat damage — first strike** (510.4, 702.7b) | Exists **only if** at least one attacking or blocking creature has first strike or double strike **as the combat damage step begins** (510.4). Only first/double strikers assign damage. | Damage triggers ("deals combat damage to a player"), lifelink is not a trigger (702.15a) | Yes (510.3) | Auto-run in preview. Ask damage-division Questions (section 2) before computing. Responses "after first strike damage" are inserted here. | Which creatures dealt damage in step 1 (for 510.4 rule on step 2) |
| **Combat damage — regular** (510) | 510.1 assign (active player first, then defenders; APNAP in multiplayer, 802.5); 510.2 all assigned damage dealt simultaneously | Same as above; SBAs after damage kill creatures and players (510.3a) | Yes (510.3) | Auto-run in preview; show the outcome as staged. | Damage marked; commander damage; life; poison; loyalty/defense counters |
| **End of combat** (511) | None (511.1) | "At end of combat" (511.2): delayed "destroy/exile it at end of combat" (very common with "whenever blocks" cards and Threaten-style), Myriad token exile | Yes | Show end-of-combat reminders; resolve delayed triggers. | Delayed triggers "at end of combat"; then **all creatures, planeswalkers and battles are removed from combat as the step ends** (511.3); "until end of combat" effects end at end of combat phase (511.2) |
| **Postcombat main** (505) | Only 505.3–505.5, which apply to the *precombat* main only, so none | "At the beginning of your postcombat main phase" (rare) | Yes | Same as precombat main. | Same |
| **End step** (513) | None (513.1) | "At the beginning of the/your end step" (very common: delayed "sacrifice it at the beginning of the next end step", monarch draw 726, blitz/dash/unearth/warp returns). If a delayed "next end step" trigger is created during the end step, it waits for the next turn's end step (513.2). | Yes | Show end-step reminders (monarch draws, sacrifice tokens). Chime unresolved Tasks. | Delayed triggers; monarch (726, M3) |
| **Cleanup** (514) | 514.1 active player discards to max hand size (7) (hidden: Never, reminder only); 514.2 **simultaneously**: remove all damage marked on permanents and end all "until end of turn" and "this turn" effects | "At the beginning of the next cleanup step" (rare) | **Usually no** (514.3). Exception 514.3a: if SBAs would be performed or triggers are waiting, do them, the active player gets priority, and **another cleanup step begins** after all pass with an empty stack. Repeats until a cleanup has neither (704.3). | Auto-run, no prompts. Reminder Banner "discard to 7" (Task only if a player mentions it; madness/discard triggers make 514.3a happen). | Clear damage + EOT modifiers in one Event (they are simultaneous: a +0/+3 creature with 4 damage does not die at cleanup). Implement 514.3a as a loop now; it's 10 lines. |

---

## 2. Combat in detail (506–511, 702)

### 2.1 Status vocabulary

| Term | Meaning | Rule |
|---|---|---|
| Attacking creature | Declared attacker (508.1k) or put onto battlefield attacking (508.4) | 508.1k, 508.4 |
| "Attacked" (for triggers/conditions) | Only creatures *declared* as attackers. Creatures put onto the battlefield attacking (Myriad, Hero of Bladehold tokens, Geist of Saint Traft angel) are attacking but never "attacked" and don't trigger "whenever X attacks" | 508.3a, 508.4 |
| Blocked / unblocked | Set when blockers are declared and **sticky**: stays blocked even if every blocker leaves combat | 509.1h |
| Attacking alone / blocks alone | Only one creature declared | 506.5, 506.6 |
| Defending player | In Commander, all opponents (802.2); for a given attacker, the player it attacks, or the controller/protector of the planeswalker/battle it attacks (508.5, 802.2a) | 802.2a |
| Removed from combat | Leaves battlefield, controller changes, phases out, regenerates, stops being a creature, or an effect removes it. Stops being attacking/blocking/blocked/unblocked. | 506.4 |

Not removed from combat: becoming tapped/untapped (506.4b); losing the ability to attack/block after being declared (506.4a). An attacker whose planeswalker/battle target left keeps attacking but attacks nothing: it can be blocked, and if unblocked deals no damage (506.4c, 510.1b).

Entering attacking: the controller picks what it attacks (508.4); it isn't subject to attack restrictions (508.4c); if it enters during declare blockers or later it is unblocked (508.4d). Entering under a non-attacking player's control → never attacking (506.3b).

### 2.2 Declaring attackers: Warnings to raise (flag, don't block)

| Check | Rule | M |
|---|---|---|
| Creature is tapped | 508.1a | M1 |
| Summoning sickness: not controlled **continuously since its controller's most recent turn began**, and no haste. This is about control, not entering: a creature that entered on an opponent's turn can attack on yours; a creature you stole this turn can't (without haste). | 302.6, 508.1a, 702.10b | M1 |
| Defender | 702.3b | M1 |
| Battle-creature attacking | 508.1a | Never |
| Attacking yourself, a teammate, or your own planeswalker | 506.2, 802.3 | M1 |
| "Can't attack" / "can't attack alone" / "can't attack you unless..." (Propaganda, Ghostly Prison: a cost, 508.1h) | 508.1c, 508.1h | M3 (Propaganda-style tax: Banner reminder) |
| "Attacks each combat if able" not attacking (Goad is common in Commander: goaded creatures must attack a player other than the goader if able, 701.15) | 508.1d | M3 (Warning only) |

### 2.3 Declaring blockers: Warnings

| Check | Rule | M |
|---|---|---|
| Blocker tapped | 509.1a | M1 |
| Blocking a creature that isn't attacking this blocker's controller (or their planeswalker/battle) | 509.1a, 802.4a | M1 |
| Flying attacker blocked by creature without flying or reach | 702.9b, 702.17b | M1 |
| Menace attacker blocked by only one creature | 702.111b | M1 |
| "Can't block" / "can't be blocked" / "can't be blocked except by..." | 509.1b | M1 for the flag, M3 for card text |
| Protection: attacker with protection from X blocked by an X creature | 702.16f | M3 |
| Intimidate, fear, shadow, horsemanship, landwalk, skulk | 702.13b, 702.36, 702.28, 702.31, 702.14, 702.118 | M3 |
| One creature blocking several attackers without an ability allowing it | 509.1a | M1 |
| Evasion gained/lost **after** blocks doesn't undo a legal block | 509.1b | M1 (don't re-warn) |

Multiplayer: each defending player blocks in APNAP order; ignore other players' attackers and blockers when checking legality (802.4, 802.4b).

### 2.4 Combat damage assignment (510.1) — current rules

**There is no "damage assignment order" any more.** The current CR has no such term (searched: 0 hits). A blocked creature divides its damage among its blockers as its controller chooses (510.1c); a blocker blocking several attackers divides likewise (510.1d). The proposal's "assign lethal damage to the blockers in order" is outdated (see section 9).

| Situation | Rule | Engine |
|---|---|---|
| Power ≤ 0 | Assigns nothing (510.1a) | Auto |
| Unblocked | All to the player/planeswalker/battle it's attacking; nothing if it attacks nothing (510.1b) | Auto |
| Blocked by exactly one, no trample | All to that blocker (510.1c) | Auto |
| Blocked, all blockers gone, no trample | Assigns no damage (510.1c) | Auto. Warn if a player expects damage to go through. |
| Blocked by 2+ | Divided as controller chooses (510.1c) | **Question** to the attacker's controller ("How does Ghalta split 12 damage?"). Never guess. |
| Trample | Must assign lethal damage to **all** blockers before assigning any to the player/planeswalker/battle; can over-assign to blockers (702.19b). "Lethal" accounts for damage already marked and other damage assigned in the same step, but **not** prevention or other effects (702.19b). | Default proposal = lethal to each blocker, rest to player, shown in staging as editable; that's a computed default, so show it as a Question with a pre-filled answer. |
| Trample, blocked but no blockers left | All to player/planeswalker as if blockers got lethal (702.19d) | Auto |
| Deathtouch | Any nonzero damage counts as lethal for assignment (702.2c); any damage from a deathtouch source destroys (704.5h, 702.2b) | Auto: 1 per blocker then rest (with trample) |
| Trample over planeswalkers | Excess past loyalty goes to the controller (702.19c, e) | M3 |
| Validity | Checked as a whole after each player assigns (510.1e) | Warn |
| Order of assignment | Active player announces first, then defenders (510.1); APNAP in multiplayer (802.5); all damage dealt simultaneously (510.2) | One `DamageDealt` batch per damage step |

### 2.5 First strike and double strike (510.4, 702.4, 702.7)

- A first-strike damage step exists only if at least one attacking or blocking creature has first strike or double strike **as the combat damage step begins** (510.4). Compute this at the moment the step starts, not at block time.
- Step 1: only first/double strikers assign damage.
- Step 2: creatures that had neither first strike nor double strike as step 1 began, plus creatures that **currently** have double strike (510.4).
  - Gaining first strike after step 1 doesn't stop a creature from dealing damage in step 2 (702.7c).
  - Removing double strike during step 1 stops step-2 damage (702.4c); giving double strike to a first striker after step 1 lets it deal damage again (702.4d).
- Creatures that die in step 1 deal no damage in step 2 (they're removed from combat, 506.4). SBAs and triggers run between the two steps and players get priority (510.3).

### 2.6 What damage does (120.3)

| Recipient | Normal source | Special |
|---|---|---|
| Player | Loses that much life (120.3a) → `LifeChanged{cause:damage}` | Infect: poison counters instead, no life loss (120.3b, 702.90b). Toxic N: also N poison (120.3g). |
| Planeswalker | Removes that many loyalty counters (120.3c) | 0 loyalty → graveyard (704.5i) |
| Battle | Removes that many defense counters (120.3h) | 704.5v/w |
| Creature | Marked damage (120.3e), stays until cleanup or regeneration (120.6) | Wither/infect: -1/-1 counters (120.3d) |
| Any | Lifelink: controller gains that much life, separately per lifelink source (120.3f, 702.15b, 702.15e). If the source left, use LKI (702.15c). | Prevented damage is not dealt (120.4b) and triggers nothing (603.2g) |

Damage sequence: excess-redirect modifications, then dealt (damage triggers trigger now), then results, then the event (120.4).

### 2.7 Commander damage (903.10a, 704.6c)

- A player dealt **21 or more combat damage by the same commander over the game** loses (SBA, 704.6c).
- Counts **combat damage only**, to the **player** only (damage to their planeswalkers/battles doesn't count).
- Counts **damage dealt**, not life lost: infect combat damage from a commander adds poison *and* commander damage. Lifegain doesn't reduce it.
- Keyed to the **card**, not the object: commander designation stays with the card across zone changes (903.3), so it doesn't reset when the commander dies and is recast, despite 400.7.
- Counts regardless of who controls the commander (a stolen commander still adds to that commander's tally).
- Partners/two commanders are tallied separately (702.124d).
- Double strike = two damage events, both count. Prevented damage doesn't count.

### 2.8 After a creature leaves

- A creature that leaves the battlefield is removed from combat (506.4) and the new object has no memory of it (400.7).
- Its blocked/unblocked effect lives on: the attacker it blocked stays blocked (509.1h).
- Leaves-the-battlefield triggers look back in time, so "whenever an attacking creature dies" sees it as attacking (603.10a). Store LKI including combat status.

---

## 3. Priority, the stack and resolution (116, 117, 405, 601, 602, 605, 608)

### 3.1 The real model in one table

| Concept | Rule | Note |
|---|---|---|
| Who may act | Player with priority casts/activates (117.1). Instants and abilities any time with priority; sorcery-speed only in own main phase, empty stack (117.1a). | |
| Getting priority | Active player at start of most steps (117.3a), after any resolution (117.3b); you keep priority after casting (117.3c, "holding priority"). | |
| Passing | All pass in succession → top object resolves, or step ends if stack is empty (117.4, 405.5). | |
| Before priority | SBAs, then triggers, repeated (117.5, 704.3). | |
| "In response" | A spell/ability added while another is on the stack resolves first (117.7, 405.2). | |
| Simultaneous stack entry | Active player's objects go on lowest, then APNAP (405.3). | |
| Casting | Move card to stack, choose modes/targets/division, pay costs (601.2a–h). Becomes "cast" at 601.2i; **cast triggers trigger then** and go on the stack **above** the spell. | `SpellCast` |
| Activating | Same shape (602.2). | `AbilityActivated` (M3) |
| Resolving | 608.2: check targets, follow instructions in order; permanent spell enters the battlefield (608.3a). | `SpellResolved` (M3), `ZoneChanged` |
| Ability independent of source | Once on the stack, removing the source doesn't stop it; uses LKI (113.7a, 608.2h). | |
| Special actions | Playing a land etc. don't use the stack, can't be responded to (116.2a, 505.6b). | |
| Mana abilities | No stack, resolve immediately, can be activated mid-cast/mid-resolution (605.3a–b). | Not tracked |

### 3.2 "Resolve immediately unless responded to" (Arena-like)

**What it gets right**

- In most casual play everyone passes, so instant/ability resolution right after casting matches 117.4.
- LIFO resolution when a response *is* said (117.7, 405.2).
- Turn-based actions (declarations, damage) can't be responded to directly; the response window is after them (508.2, 509.2, 510.3). Staging a late response into the right step is a faithful reconstruction.
- Triggers keep resolving even if their source died (113.7a).

**What it gets wrong or must handle**

| Issue | Rule | Fix |
|---|---|---|
| Cast triggers resolve **before** the spell ("whenever you cast" sits on top: prowess, Guttersnipe, Ward, Rhystic Study's tax question). | 601.2i, 603.3, 117.7 | "Immediate resolution" of a spell = resolve everything stacked above it first, then the spell. |
| Resolving a permanent spell then triggers ETB; those resolve before the next thing said. | 603.6a, 117.3b | Same loop. |
| Holding priority: "I cast X, and in response to my own X I cast Y". | 117.3c | Parser must accept self-responses. |
| Ward and other "becomes the target" triggers can counter on resolution. | 702.21a | M3: Question "Pay ward?". |
| A step can't end with a nonempty stack. | 500.2 | Phase change (Commit) must first resolve or explicitly drop staged unresolved stack items. |
| Nothing can be cast or resolve in untap or (usually) cleanup. | 502.4, 514.3 | Re-home such commands to upkeep / Warn. |
| "Before attacks" vs "after attacks" are different steps. Tapping a would-be attacker must be in beginning of combat; removal "in response to attacks" is after declaration (attack triggers already triggered). | 506.8a, 507.2, 508.2 | Timeline needs step-level insertion points. |
| Opponents may respond to triggered abilities too (they're on the stack). | 603.3 | Allow "in response to the trigger". |
| Split second. | 702.61 | See 3.4. |

### 3.3 Fizzling (608.2b, plus relatives)

"Fizzle" is not a rules term; the rule is "doesn't resolve" (608.2b).

| Case | Rule | Outcome |
|---|---|---|
| **All** targets (every instance of "target") illegal at resolution | 608.2b | Doesn't resolve; spell → owner's graveyard; ability just leaves the stack. Not "countered" (so "can't be countered" doesn't help, and "when countered" doesn't trigger). |
| **Some** targets illegal | 608.2b | Resolves; does nothing to/with illegal targets. |
| Target left its zone, even if it came back | 608.2b, 400.7 | Illegal (new object). Flicker-in-response is the classic case. |
| Target gained hexproof/shroud/protection, or no longer matches ("target creature" became a non-creature) | 608.2b, 702.16b | Illegal. Needs keyword tracking (M1 for hexproof/shroud/protection-from-color if granted by voice). |
| No targets at all | 608.2b | Never fizzles this way. |
| Aura spell with illegal target | 608.3b | Goes to graveyard. |
| Triggered ability with no legal target when it would be put on the stack | 603.3d | Removed immediately (never on the stack). |
| Intervening-if false on resolution | 603.4 | Removed, does nothing (parallel to targets). |
| Source of an ability gone | 608.2b, 113.7a | Use LKI; ability still resolves. |

### 3.4 Split second (702.61)

While a split-second spell is on the stack, no one can cast spells or activate non-mana abilities (702.61a). Mana abilities, special actions (e.g. unmorph) and triggered abilities still work (702.61b). App: Warn "Split second: can't respond" on a response, with "Do it anyway".

### 3.5 Mana abilities (605)

No stack, can't be responded to, resolve immediately (605.3b); usable in the middle of casting or resolving (605.3a). A mana ability is an activated ability without a target that could add mana and isn't a loyalty ability (605.1a); triggered mana abilities exist too (605.1b). The app ignores them, which is safe: nothing can interleave with them. Effects that care what mana was spent (adamant, converge, "spend only colored") → Question/Task (Never).

---

## 4. Triggered abilities (603)

### 4.1 Lifecycle

| Phase | Rule | Engine |
|---|---|---|
| Trigger | Event or state matches the condition (603.2); once per event, but repeatedly for multiple occurrences in one event (603.2c, "whenever one or more" vs "whenever a"). Only if the event actually occurs; prevented/replaced events trigger nothing (603.2g). "Becomes" triggers fire only on change (603.2e). | Scan after each Event is folded. |
| Which objects are checked | Objects as they exist **immediately after** the event, except look-back triggers (603.10). | Scan every zone that can hold a relevant ability: battlefield, plus graveyard (Bloodghast, Prized Amalgam), command zone (commander's own "from the command zone"), stack (the spell's own "when you cast this"), emblems, delayed triggers. |
| Wait | Triggered abilities wait until a player would receive priority (603.3); nothing happens in between except more events in the same resolution. | Pending-trigger queue. |
| Put on stack | APNAP: active player puts all theirs in any order, then each other player in turn order (603.3b, 101.4). So **the active player's triggers resolve last**. Triggers triggered by other abilities triggering go in a second pass (603.3b). Modes chosen (603.3c), targets chosen (603.3d → 601.2c). | Question to a player only when they control 2+ simultaneous triggers and order could matter. |
| Controller | Player who controlled the source when it triggered (603.3a); delayed: see 603.7d–g. | Store controller on the pending trigger. |
| Optional | "May" abilities still go on the stack; choice at resolution (603.5). | Question at resolution; don't pre-filter. |
| Resolve | 608.2 incl. targets and intervening-if recheck. | |

Special timing: triggers during untap wait until upkeep (502.4). Declare-attackers/blockers/damage triggers go on the stack before the active player gets priority (508.2b, 509.2a, 510.3a). "Do this only once each turn" (603.2h) needs a per-turn flag.

### 4.2 Intervening-if (603.4)

Form: "When/Whenever/At [event], **if** [condition], [effect]." Condition checked when the event occurs (no trigger if false) **and again at resolution** (removed if false). Only an "if" immediately after the trigger condition counts. Example (603.4): Felidar Sovereign checks 40 life at upkeep start and on resolution. Engine: the Translation must mark intervening-if separately from in-effect "if" clauses (which are checked only at resolution, 608.2c).

### 4.3 Delayed triggers (603.7)

| Rule | Behavior |
|---|---|
| 603.7a | Created during resolution (or by a replacement/static). Doesn't trigger on events before its creation. |
| 603.7b | Triggers **once** (next occurrence) unless it has a duration like "this turn". |
| 603.7c | Tracks a specific object even if its characteristics change; does nothing if the object changed zones (new object, 400.7). |
| 603.7d–g | Source and controller: the spell/ability/static that created it. |
| 513.2 | "Next end step" created during an end step waits for the next turn's end step. |

Common in Commander: "sacrifice/exile it at the beginning of the next end step" (Kiki-Jiki tokens, unearth, blitz, dash, warp 608.3g), "at end of combat" (Threaten effects, "whenever blocks, destroy at end of combat"), "at the beginning of your next upkeep". Engine stores `DelayedTrigger{id, source, controller, condition, objectRef, createdAtEventId, oneShot}`; M1 can show these as Banners from manual input, M3 auto-creates them.

### 4.4 Reflexive triggers (603.12)

"When you do, ..." / "when [something happens] this way": created during resolution, checked **immediately**, triggers based on what happened earlier in that same resolution; then goes on the stack normally (so opponents can respond and new targets are chosen then). If the event happened several times it triggers that many times, except a repeated cost payment triggers once (603.12a). Engine: treat as delayed trigger with an immediate check at end of the resolution's event batch.

### 4.5 State triggers (603.8)

"Whenever [state is true]" (e.g. "when you control no Islands, sacrifice"). Triggers as soon as the state holds; won't retrigger until it has left the stack, then retriggers if still true (603.8). Distinct from SBAs (704.1a). Per triggers research: unmodeled → "check this card" Task (Never/M3+).

### 4.6 Look-back: leaves-the-battlefield and friends (603.10)

Normally triggers use the state just after the event. These look back to just **before** the event, using both the existence of the abilities and how objects looked (603.10):

- 603.10a leaves-the-battlefield (incl. "dies"), sacrifice triggers, leaving a graveyard, a visible object put into hand/library
- 603.10b phasing out; 603.10c becoming unattached; 603.10d losing control; 603.10e spell countered; 603.10f player loses the game

Consequences: a creature's own "when this dies" works; Blood Artist sees creatures that die simultaneously with it; an anthem that dies with its creatures still pumped them for the look-back. With SBAs, LKI is from **before all simultaneous SBAs** (704.8). Engine: keep the pre-event snapshot of every leaving object (characteristics, controller, counters, attacking/blocking, attachments) on the `ZoneChanged` event.

### 4.7 "This turn" conditions and history

Many conditions ask about earlier events this turn. The state must hold a per-turn ledger (reset at turn start; 514.2 ends "this turn" *effects* at cleanup, but conditions are about the turn). Common ones in Commander:

| Condition (mechanic) | Needs |
|---|---|
| "if you gained life this turn" (Lifegain payoffs), "you gained N or more life" | Life gained per player this turn (sum and count of events) |
| "if an opponent lost life this turn" (spectacle), "lost N life" | Life lost per player this turn |
| "if a creature died this turn" (morbid) | Count of creature deaths (any controller) |
| "if you attacked this turn" (raid) | Attackers declared by player this turn (508.6) |
| "if a permanent you controlled left the battlefield this turn" (revolt) | Leaves-battlefield by controller |
| "landfall"/"if a land entered under your control this turn", "lands played" | Lands entered per controller; land plays per player (305.2) |
| "second spell each turn", storm count, day/night (502.2) | Spells cast per player this turn |
| "first time each turn", "do this only once each turn" (603.2h) | Per-ability-per-turn flags |
| "cards drawn this turn" (second card drawn), "first card in draw step" | Cards drawn per player (player-announced, M3) |
| "if [player] was dealt damage this turn", "creatures that dealt damage this turn" | Damage events this turn by source/recipient |
| "descended" (permanent card to graveyard), "crime committed" | M3 |
| "during your last turn" / "since your last turn" | Summary of each player's previous turn (800.4i covers players who left). Sealed-turn history (ADR 0004) must keep these aggregates. |

Keep these as aggregates in state (not by scanning history), so snapshots stay self-contained under ADR 0004.

---

## 5. State-based actions (704)

### 5.1 How they run

| Rule | Behavior |
|---|---|
| 704.3, 117.5 | Whenever a player would receive priority: check all SBAs, perform all applicable ones **simultaneously as one event**; repeat while any were performed; then put waiting triggers on the stack; repeat until neither happens. Also in cleanup (514.3a). |
| 704.4 | SBAs don't look at what happens **during** a resolution. A creature at 0 toughness midway through a spell that later pumps it doesn't die. |
| 704.7 | One replacement effect replaces all identical simultaneous SBA results. |
| 704.8 | LKI for permanents leaving via SBAs comes from before **any** of those simultaneous SBAs. |
| 104.4a | If all remaining players lose simultaneously, the game is a draw. |
| 702.12b | Indestructible ignores lethal damage (704.5g) and deathtouch destruction (704.5h) but **not** 0 toughness (704.5f). |

### 5.2 The list, by milestone

**M1: must implement**

| Rule | SBA | Notes |
|---|---|---|
| 704.5a | Player with 0 or less life loses | `PlayerLost{reason:life}` |
| 704.5c | 10+ poison counters → loses | Infect/toxic/proliferate are common enough |
| 704.6c | 21+ combat damage from the same commander → loses (903.10a) | Per (victim, commander card) tally |
| 704.5f | Creature with toughness ≤ 0 → owner's graveyard (not "destroy"; regeneration/indestructible don't help) | Cause = SBA |
| 704.5g | Toughness > 0, damage marked ≥ toughness → destroyed | Indestructible exempt |
| 704.5h | Dealt damage by a deathtouch source since last check → destroyed | Needs a "deathtouch damage since last SBA check" flag |
| 704.5i | Planeswalker with 0 loyalty → graveyard | If planeswalkers' loyalty is tracked |
| 704.5j | Legend rule: same player controls 2+ legendary permanents with the same name → keeps one, rest to graveyard | Question "Which do you keep?" (Commander has many legends and copy tokens) |
| 704.5q | +1/+1 and -1/-1 counters annihilate pairwise | Pure counter math |
| 704.6d | Commander in graveyard or exile, put there since the last check → owner **may** move it to the command zone | Question to owner; "dies" triggers already triggered (603.10a) because the move is after. |
| 704.5d | Token outside the battlefield ceases to exist | Trivial cleanup (dies triggers still see it, 603.10a) |

**M3**

| Rule | SBA |
|---|---|
| 704.5m | Aura attached illegally or to nothing → graveyard (needs attachment tracking; also protection 702.16c) |
| 704.5n | Equipment/Fortification attached illegally → unattached, stays |
| 704.5p | Creature/battle/other non-Aura attached → unattached |
| 704.5r | "Can't have more than N counters" |
| 704.5s | Saga with lore ≥ final chapter and no chapter ability on the stack → sacrificed |
| 704.5t | Dungeon completed → removed (venture/initiative are fairly common in Commander) |
| 704.5v, 704.5w, 704.5x, 704.5y | Battles: 0 defense → graveyard; protector rules |
| 704.5z | More than one Role from the same player on a permanent → keep newest |

**Out of scope / Never**

| Rule | SBA | Why |
|---|---|---|
| 704.5b | Drew from an empty library → loses | Hidden zone; player announces "I lose" (Edit) |
| 704.5e | Copies of spells/cards outside their zones cease to exist | Copy effects out of scope |
| 704.5k | World rule | Essentially never in Commander |
| 704.5u | Space sculptor | Un-set |
| 704.6a, 704.6b | Two-Headed Giant | Not our variant |
| 704.6e, 704.6f | Archenemy, Planechase | Not our variant |

---

## 6. Commander-specific rules (903, 702.124, 800)

| Topic | Rule | Engine/app |
|---|---|---|
| Starting life | 40 (903.7) | M1 |
| Default multiplayer setup | Free-for-All, **attack multiple players**, no range of influence (903.2, 806, 802) | M1: every opponent is a defending player each combat |
| Commander identity | Designation belongs to the card and survives zone changes (903.3). "Control a commander" = on battlefield; "cast a commander" = a spell that's a commander (903.3d). | Store `commanderOf: playerId` on the card record, not the permanent object |
| Command zone return (SBA) | Commander in graveyard/exile, put there since the last SBA check → owner may move it to the command zone (903.9a, 704.6d). Dies/exile triggers happen first. | M1 Question to owner (consider a per-player standing preference, see section 9) |
| Command zone return (replacement) | Commander would go to hand or library from anywhere → owner may put it in the command zone **instead** (903.9b); can apply repeatedly. The hand/library move never happens. | M1 Question. Bounce/tuck of a commander |
| Commander tax | +{2} for each previous cast **from the command zone** this game (903.8). Counts casts, not resolutions: a countered commander still increments. Casting from hand/graveyard doesn't count or pay tax. Partners tracked separately (702.124d). | M1: show "Next cast: +{2N}" on the commander. Cheap, high value even without mana tracking. |
| Commander damage | 903.10a / 704.6c, see 2.7 | M1 |
| Partner / Background | Two commanders (702.124a); combined color identity (702.124c); separate tax and separate commander damage (702.124d); "your commander" refers to either, you choose (702.124e). Background = legendary Background enchantment as second commander (702.124k). "Partner with" also has an ETB tutor trigger (702.124j). | M1 data model: 1–2 commanders per player |
| Brawl | No commander damage SBA (903.12h); 25/30 life (903.12f) | Never (unless a variant setting) |
| Player leaves the game | All objects they **own** leave; control effects giving them objects end; their stack objects not represented by cards cease to exist; objects they still control are exiled (800.4a). Not an SBA; immediate. If it's their turn, the turn continues without an active player (800.4j). Combat damage to them isn't assigned (800.4e). "Until your next turn" effects of theirs last until that turn would have begun (800.4m). | **M1**: happens in every game. `PlayerLost` must cascade `ZoneChanged` for their permanents, return stolen permanents, drop their triggers. |
| Monarch / initiative | Monarch draws at their end step; combat damage to the monarch steals it (726). Initiative: venture at upkeep, steal by combat damage (727). | M3 (common in Commander products) |

---

## 7. Continuous and replacement effects (611–616) at the level we need

### 7.1 Durations

| Duration | Ends | Rule |
|---|---|---|
| "until end of turn", "this turn" | Cleanup, simultaneously with damage removal | 514.2 |
| "until end of combat" | End of the combat phase | 511.2 |
| "until [step/phase]" / "until end of [step/phase]" | As that step begins / ends | 500.4, 500.5 |
| "until your next turn" | When that player's next turn begins (convention; if they left the game, when it would have begun, 800.4m) | 800.4m |
| "for as long as ..." | When the condition ends; never starts if the condition is already false | 611.2b |
| No duration stated (from a resolving spell/ability) | End of game | 611.2a |
| Static ability (anthems, lords) | While the source is on the battlefield, applies to whatever matches **right now** | 611.3a |

**Locked-in set (611.2c):** a resolving effect that changes characteristics decides which objects it affects when it begins ("creatures you control get +1/+1 until end of turn" doesn't pump a creature that enters later). A static ability (Glorious Anthem) applies to whatever matches at any moment. The engine must store resolved effects with an explicit object list, and static effects as a predicate.

### 7.2 Keywords and counters

- Granted keywords are layer 6 (613.1f); keyword counters (flying counter, etc.) also layer 6 (122.1b, 613.1f).
- +1/+1 and -1/-1 counters are layer 7c (613.4c) and annihilate (704.5q).
- Counters persist until removed; they're lost when the permanent changes zones (400.7). "Enters with counters" is a static replacement, not a trigger (603.6d, 122.6).

### 7.3 What we can approximate without the layer system (613)

Correct cheap approximation of **layer 7 only** (P/T), which covers most of what voice play needs:

1. Start with printed P/T (or token-defined, 613.1).
2. 7a characteristic-defining P/T (`*/*` like Tarmogoyf): treat as player-stated value (Question/Edit).
3. 7b "becomes X/Y" / "base P/T is X/Y" effects: latest timestamp wins (613.4b, 613.7).
4. 7c add all modifiers (until-EOT pumps, static anthems, counters) regardless of order (613.4c).
5. 7d switch P/T if odd number of switch effects (613.4d).

That order is exactly the rules' order within layer 7, so a 7b-then-7c-then-7d pipeline is **right**, not an approximation. It is wrong only when earlier layers change things (below).

Keywords: union of printed + granted keywords, minus "loses X" removals applied in timestamp order (613.7). Approximate but right for nearly all casual cases.

### 7.4 Common cases that would be wrong without layers

| Case | Layer | Frequency in casual Commander | Recommendation |
|---|---|---|---|
| Steal effects ("gain control until end of turn, untap, it gains haste": Threaten, Insurrection, Act of Treason) | 2 | **Common** | Model control change as a simple override with duration (M1/M3). Matters for attacking (302.6), commander damage keyed to card, and who gets triggers (603.3a). |
| Animated lands/artifacts (manlands, Tezzeret, Nissa), Opalescence-style | 4 | Moderate | Type override with P/T (M3); otherwise Edit |
| "Loses all abilities" (Humility, Overwhelming Splendor, Kenrith's Transformation) with granted keywords in timestamp order | 6 | Low | Never: "check this" Task |
| Copy/clone effects (Clone, Spark Double, token copies) | 1 | **Common** | Out of scope by decision; the player states the copied card, engine treats it as that card (Edit) |
| Dependency (613.8) | — | Rare | Never |
| Text-changing | 3 | Rare | Never |
| Color-changing affecting protection/intimidate | 5 | Low | Player correction |

### 7.5 Replacement and prevention effects we will meet anyway

| Effect | Rule | Handling |
|---|---|---|
| Commander → command zone instead of hand/library | 903.9b | M1 (Question) |
| Indestructible (static, not replacement) | 702.12b | M1 keyword |
| Regeneration ("next time it would be destroyed, instead tap, remove damage, remove from combat") | 701.19a | M3; note it removes the creature from combat (506.4) |
| Damage prevention (Fog, protection 702.16e) | 615, 702.16e | M1 as a staged "prevent all combat damage" flag; prevented damage triggers nothing (603.2g) and doesn't count as commander damage |
| Token/counter doublers (Doubling Season, Anointed Procession, Parallel Lives) and multiple replacements on one event | 614, 616.1 | **Very common in Commander.** Ordering is out of scope: accept the player-stated result ("I make 4 tokens") and Warn only if a translation knows a doubler is present. |
| "If it would die, exile it instead" (Rest in Peace, Kalitas, "exile it if it would leave") | 614 | M3: changes the `ZoneChanged.to`; "dies" triggers then don't happen |
| "Enters tapped" / "enters with N counters" | 603.6d | Static; part of the entering event, not a trigger |

---

## 8. Things the engine must remember

| What | Scope / reset | Why (rules) | M |
|---|---|---|---|
| Current turn number, active player, current step within a step list (supports extra combats/steps) | Game | 500.1, 500.7–500.11 | M1 |
| Life, poison counters per player | Game | 704.5a, 704.5c, 120.3 | M1 |
| Commander damage per (victim player, commander card) | Game; survives commander zone changes | 903.10a, 903.3, 702.124d | M1 |
| Commander cast count from command zone per commander card | Game | 903.8 | M1 |
| Which cards are commanders and whose | Game, on the card record | 903.3 | M1 |
| Players still in the game; turn order; seat | Game | 800.4, 101.4 (APNAP) | M1 |
| Per permanent: object id (new on every zone change), owner, controller, **controlled-since** (turn or timestamp) | While on battlefield | 400.7, 302.6 (summoning sickness), 603.3a | M1 |
| Per permanent: entered-this-turn / entered-at timestamp | While on battlefield | Timestamps 613.7d; "entered this turn" conditions | M1 |
| Tapped state | While on battlefield | 502.3, 508.1a, 509.1a | M1 |
| Damage marked; "dealt deathtouch damage since last SBA check" | Until cleanup / until next SBA check | 120.6, 514.2, 704.5g–h | M1 |
| Counters by kind (+1/+1, -1/-1, loyalty, defense, lore, keyword counters, poison on players) | Until removed / zone change | 122, 704.5q, 704.5i | M1 (P/T, loyalty, poison); M3 rest |
| Until-end-of-turn modifiers (P/T, keywords) with locked-in affected objects | Until cleanup | 611.2a, 611.2c, 514.2 | M1 |
| Other duration effects (until end of combat, until your next turn, for as long as) | Per duration | 511.2, 611.2b | M1 basic, M3 rest |
| Static effects as predicates (anthems, lords) | While source on battlefield | 611.3a | M3 |
| Control-change overrides with duration | Per duration | 613.1b | M3 (M1 via Edit) |
| Combat: attackers → attacked object; declared vs entered-attacking; blockers → attackers; blocked flag (sticky); removed-from-combat; first-strike-step flag; who dealt damage in step 1 | Combat phase | 506.4, 508.1k, 508.4, 509.1h, 510.4 | M1 |
| Attachments (Aura/Equipment → host) | While on battlefield | 704.5m–n | M3 |
| Stack: spells/abilities with controller, source, LKI of source, targets, modes, intervening-if flag | Until resolved | 405, 113.7a, 608.2b, 603.4 | M1 manual; M3 auto |
| Pending triggers (triggered, not yet on stack) with controller and trigger event | Until next priority | 603.3, 603.3b | M1 shape, M3 content |
| Delayed triggers waiting (condition, object ref, one-shot vs duration, created-at) | Until triggered/expired | 603.7, 513.2 | M1 (manual), M3 auto |
| Last-known information for every object that left a zone (characteristics, controller, counters, combat status, attachments) | Until no stack item/trigger references it | 603.10, 608.2h, 704.8, 702.15c | M1 |
| Per-turn ledger: life gained/lost per player; creature deaths; spells cast per player; lands played/entered; attacks declared; permanents that left by controller; damage dealt by source → recipient; cards drawn (announced); once-per-turn ability flags | Reset at turn start | 603.2h, 502.2, 305.2, section 4.7 | M1 (life, deaths, lands, attacks, spells cast); M3 rest |
| Previous-turn summary per player ("during your last turn") | Until that player's next turn | 800.4i | M3 |
| Designations: monarch, initiative, day/night, city's blessing | Game | 726, 727, 732, 702.131 | M3 |
| Land drops used this turn per player | Turn | 505.6b, 305.2 | M1 (Warning) |

---

## 9. Conflicts and decisions

| # | Proposed model vs rules | Recommendation | M |
|---|---|---|---|
| 1 | **SBA timing.** "When the event queue is empty, run SBAs" is correct only if the queue boundary is one *priority point*. SBAs never run mid-resolution (704.4), but must run between separate things said in one Command ("I bolt the bear, then attack"), between first-strike and regular damage (510.3), and after each resolution (117.5). | Define the batch boundary as: one resolution, one turn-based action, or one special action. A Command with several Actions = several batches, each followed by SBA/trigger loop. | M1 |
| 2 | **SBA/trigger loop order.** Proposal step 3 pushes triggers onto the stack immediately after each event. Rules: triggers *wait*; SBAs loop until none, then triggers go on the stack (APNAP), then SBAs again (704.3, 603.3b). Matters for e.g. a dying creature's triggers seeing simultaneous deaths and for APNAP order including triggers caused by SBAs. | Collect pending triggers during the batch; run SBA fixpoint; then stack all pending in APNAP; repeat until stable. | M1 |
| 3 | **SBAs are simultaneous.** Each pass performs all applicable SBAs as one event (704.3) with LKI from before the pass (704.8); two players hitting 0 at once lose together, draw if all (104.4a). | Compute all SBA results against one state, emit one batch. | M1 |
| 4 | **Trigger scan only looks at permanents.** Triggers also live in graveyards, the command zone, on the stack (cast triggers of the spell itself), in emblems and delayed triggers; look-back triggers use the pre-event state (603.10). | Scan battlefield + delayed triggers + emblems in M1-shape; add graveyard/command/stack sources in M3. For leaves-the-battlefield, scan the *pre-event* snapshot of the leaving object(s). | M1 (look-back), M3 (zones) |
| 5 | **Damage assignment order is gone.** Proposal: "assign lethal damage to the blockers in order". Current 510.1c lets the controller divide freely among blockers; trample needs lethal to all blockers first (702.19b). | Drop "order". Single blocker or no trample: auto. 2+ blockers or trample: Question with an editable pre-filled default. Write an ADR (it changes the proposal). | M1 |
| 6 | **Summoning sickness is about control, not entering** (302.6). | Track `controlledSince`; Warn on attack if controlled since before the controller's most recent turn began is false and no haste. Stolen creatures also count. | M1 |
| 7 | **Arena-like immediate resolution vs cast triggers.** "Whenever you cast" triggers (and ward) sit above the spell and resolve first (601.2i). Immediate resolution must drain the stack top-down, triggers included. Also self-responses (117.3c). | Resolve = drain stack from top until the said spell is done, with triggers and Questions in order. | M1 (shape) / M3 (triggers) |
| 8 | **Late responses and replay.** Inserting "in response to X" and replaying can invalidate later staged items (attacker killed before blocks; target gone; trigger no longer triggers). | Replay from the phase-start snapshot (ADR 0004) using staged *Actions* plus recorded *answers* keyed by stable ids (trigger source + event id). Items that become illegal turn into Warnings/Questions, never silent drops (principles 2, 3). Insertion points must be **step-level** ("before attacks" = beginning of combat, "after attacks" = declare attackers step, "after blocks", "after first strike damage") (506.8, 507.2, 508.2, 509.2, 510.3). | M1 |
| 9 | **Commit granularity: phase vs step.** Combat is one phase with up to 6 steps; Commit at phase change is fine for UX, but effects/triggers are step-scoped ("at end of combat", "until end of combat", first-strike step). | Keep Commit per phase (ADR 0007) but make the staged timeline step-indexed. Don't let a phase Commit while staged stack items are unresolved (500.2): resolve or ask. | M1 |
| 10 | **Auto-run combat damage.** Correct to preview once all defenders are Ready, but players do get priority after blocks and between damage steps (509.2, 510.3), and blocker-step triggers (509.3) resolve first. First-strike step existence is decided as the damage step begins (510.4), so a late "give it first strike after blocks" changes the structure. | Recompute the damage steps on every replay; never cache the "first-strike step exists" decision from block time. | M1 |
| 11 | **Blocked stays blocked.** Attacker whose blockers all died deals no damage unless trample (509.1h, 510.1c, 702.19d); attacker whose planeswalker left deals no damage (506.4c). Common table misconception. | Engine follows the rule; show a Banner explaining why no damage, with "Do it anyway" (override). | M1 |
| 12 | **Commander damage keyed to the card.** Must count combat damage dealt (incl. infect, which causes no life loss), survive zone changes (903.3), count when stolen, separate per partner (702.124d), exclude prevented damage and damage to planeswalkers. | Key tally by commander card id; source = combat `DamageDealt` with `isCommander` from the card. | M1 |
| 13 | **Commander to command zone: two different mechanisms.** Graveyard/exile is an optional SBA after the fact (dies triggers happen, 903.9a); hand/library is a replacement (the move never happens, 903.9b). | `ZoneChanged` to graveyard/exile then Question "Move to command zone?"; hand/library = Question before the move. Decision needed: allow a per-player standing preference ("always") to reduce Questions — recommended, since it's the player's stated choice, not a guess. | M1 |
| 14 | **Player leaving the game cascades** (800.4a): their owned objects leave, stolen ones return/exile, their stack objects and pending triggers vanish, the turn continues without an active player (800.4j). | `PlayerLost` handler emits the cascade; treat as M1 since every game ends this way. | M1 |
| 15 | **APNAP trigger ordering needs choices.** Each controller orders their own simultaneous triggers (603.3b); the active player's resolve last. | Question only when a player controls 2+ simultaneous triggers that both affect tracked state; otherwise use spoken order. | M3 |
| 16 | **Intervening-if and reflexive triggers** need distinct representation (603.4, 603.12); in-effect "if" is checked only at resolution. | Translation schema: `trigger.condition` (intervening, checked twice) vs effect-level conditions; `reflexive` effects checked at end of the resolution batch. | M3 |
| 17 | **"This turn" and "last turn" conditions vs ADR 0004 sealing.** Sealing collapses snapshots; conditions need per-turn aggregates and a previous-turn summary per player (800.4i). | Keep aggregates in state (section 8), not by scanning history; roll the current ledger into `lastTurnSummary[player]` at turn end. | M1 (ledger), M3 (last turn) |
| 18 | **Untap and cleanup have no priority** (502.4, 514.3). Commands said there must be re-homed (upkeep) or Warned. Cleanup can repeat (514.3a). | Implement both now; tiny. | M1 |
| 19 | **Damage removal and EOT effects end simultaneously** (514.2). Removing pumps first, then damage, would wrongly kill creatures. | One cleanup Event doing both. | M1 |
| 20 | **Locked-in vs dynamic effects** (611.2c vs 611.3a). A naive "all creatures you control get +1/+1" stored as a predicate would wrongly pump later arrivals. | Resolved effects store object lists; static effects store predicates. | M1 (resolved), M3 (static) |
| 21 | **Fizzle rule is right but incomplete.** Partial-target resolution, "doesn't resolve" ≠ "countered", target illegal after flicker (400.7), triggered ability with no legal targets never hits the stack (603.3d), intervening-if removal (603.4). | Implement all five; emit `SpellCountered` only for real counters. | M1 (targets), M3 (rest) |
| 22 | **Proposal "reject illegal blocks"** conflicts with principle 3. | Warn with "Do it anyway" for every combat legality check (sections 2.2, 2.3). | M1 |
| 23 | **Proposal "unblocked damage goes to the defending player"** — it goes to whatever the creature attacks: player, planeswalker or battle (510.1b), and each attacker may attack a different opponent (802.3). | Attack target per attacker. | M1 |
| 24 | **Replacement effects out of scope, but doublers are everywhere in Commander** (614, 616.1). | Player-stated quantities win; Warning when a known doubler/"exile instead" effect is present. | M1 (accept stated), Never (ordering) |
| 25 | **Control change is a layer-2 effect** that is common (Threaten effects) and touches summoning sickness, combat removal (506.4: controller change removes from combat), trigger controller. | Simple control override with duration; don't wait for a layer system. | M3 (M1 via Edit) |
| 26 | **Hidden zones:** draw step draw (504.1), cleanup discard (514.1), empty-library loss (704.5b), "drew from empty library". | Automatic `CardDrawn` for the draw-step draw (M3); discard and decking = Banner/Task/player-stated (Never auto). | M3/Never |
| 27 | **Mana not tracked.** Commander tax still worth showing; split second still worth Warning; "mana spent" conditions → Question. | Show tax count; Warning for split second (702.61). | M1 |
| 28 | **Proposal "trigger scan pushes active player's first"** — APNAP: the active player's triggers go on the stack *first*, i.e. lowest, so they resolve *last* (603.3b). Easy to invert. | Unit test: AP and NAP triggers from the same event; NAP's resolves first. | M1 |

