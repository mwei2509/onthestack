# Trigger events: what the engine must model

Research note for the On The Stack rules engine. Data: Scryfall Oracle Cards (Commander-legal, real cards), Comprehensive Rules effective 2026-11-06, Forge trigger modes. All numbers come from the scripts in [`triggers-scripts/`](triggers-scripts/) and are reproducible from the inputs listed under Sources.

## Summary

- **32,643** Commander-legal cards (tokens, emblems, art-series, planes, schemes and vanguards excluded). **13,867 (42.5%)** have at least one When/Whenever/At trigger clause. That rises to **15,025 (46.0%)** once you count triggers that live only in keyword reminder text (ward, prowess, echo, suspend, ...) and Saga chapters.
- **15,841** trigger clauses (printed 15,360, granted inside quotes 481), plus 515 delayed or reflexive clauses ("When you do, ...", "At the beginning of the next end step, sacrifice it"), which are counted separately.
- **Unmatched: 0** clauses after iteration. About 105 clauses (0.7%) fall into catch-all buckets (StateTrigger, mana spent, Reflexive, Un-set mechanics) that are deliberately left unmodeled. See Long tail.
- **Popular cards trigger less often, and more uniformly.** Only 300 of the top 1,000 cards by EDHREC rank (30%) have a trigger, because the top 1,000 is 29% lands, and instants, sorceries and mana rocks fill most of the rest. Of those 300, **43% of clauses are "enters"**. Two event types cover half of all top-1k clauses, 7 cover 80%, 12 cover 90% and 26 cover 99%.
- **Hidden zones are everywhere on the effect side, rare on the condition side.** 48% of top-1k trigger cards have a trigger whose *effect* touches the library or hand (mostly "draw a card"). Only 17 top-1k cards (6%) have a trigger *condition* the app can't observe without being told (draw, discard, search).

### Recommended Event list

Model a small set of **primitive events** with payloads. Most of the ~100 fine-grained trigger types are predicates over those payloads, the same way Forge's `ChangesZone` covers enters, dies and leaves-the-battlefield (CR 603.6).

**Milestone 1: the core loop emits these.** No card-specific triggers yet, but SBAs, combat, life and commander damage need them anyway.

| Primitive event | Payload (sketch) | Derived trigger types it serves |
| --- | --- | --- |
| `PhaseStarted` | step, activePlayer, turnNumber | upkeep, draw, main 1/2, beginning of combat, end of combat, end step, cleanup, turn start |
| `AttackersDeclared` | attacker → defender (player, planeswalker or battle) | "attacks", "you attack", "attacks you" |
| `BlockersDeclared` | blocker → attacker | "blocks", "becomes blocked", "attacks and isn't blocked" |
| `DamageDealt` | source, recipient (player or permanent), amount, combat flag | combat damage to a player or creature, noncombat damage, "is dealt damage", **commander damage** (combat damage whose source is a commander) |
| `LifeChanged` | player, delta, cause (damage, payment, effect) | life gained, life lost, life paid |
| `SpellCast` | caster, card ref, from-zone, types, mana value, isCommander | "whenever you cast", "an opponent casts", commander tax bookkeeping |
| `ZoneChanged` | object, from, to, cause (destroy, sacrifice, SBA, effect, cast, token created) | enters (incl. "tokens enter" and landfall), dies, leaves the battlefield, exiled, returned to hand, put into a graveyard from anywhere, command zone |
| `CountersChanged` | object or player, counter kind, delta | poison (SBA 704.5c), loyalty (704.5i), +1/+1 vs -1/-1 annihilation (704.5q), "counters are put on" |
| `PlayerLost` | player, reason | SBA losses (704.5a–c, 704.6c), "whenever an opponent loses the game" |

Everything in Milestone 1 is a public-zone event the table already announces. These 9 primitives (about 30 derived types) cover **89% of trigger clauses at every popularity tier**, and **88% of trigger-bearing cards have all of their triggers inside this vocabulary**. Milestone 3 card translations can then subscribe to them without any new event types.

**Milestone 3: added alongside automatic triggers from card translations.** Each one is cheap but only matters because some card listens for it.

- Explicit zone-change causes. `Sacrificed`, `Discarded`, `Milled`, `Cycled` and `Exiled` are `ZoneChanged` with a cause or verb tag, but they need their own announce verbs in the voice grammar.
- `CardDrawn`: hand is hidden, so it's player-announced. It's the #7 type on the top-1k list (Smothering Tithe, Orcish Bowmasters, Rhystic Study's effect).
- `TapStateChanged`, covering tapped, untapped and tapped for mana (Wild Growth, Crypt Ghast, City of Brass).
- `BecameTarget` (ward, heroic, Phantasmal Image). Also needed to derive `CrimeCommitted`.
- `AbilityActivated`, `SpellCopied`, `SpellCountered`, `SpellResolved`, `AbilityTriggered`.
- `LandPlayed`, distinct from a land entering (Burgeoning, City of Traitors).
- `FaceChanged`, covering transformed, turned face up and mutated.
- Named-mechanic events: `ClassLevelGained`, `DoorUnlocked`, `CaseSolved`, `RingTempted`, `BecameMonarch`, `InitiativeTaken`, `VenturedOrDungeon`, `DayNightChanged`, `CrimeCommitted`.
- Keyword-action events: `Explored`, `Connived`, `Discovered`, `Proliferated`, `Investigated`, `Fought`, `Exerted`, `Crewed`, `Saddled`, `Stationed`, `BecameMonstrous`, `BecameRenowned`, `Evolved`, `Mentored`, `Trained`, `Enlisted`, `Championed`, `Foretold`, `Plotted`, `EvidenceCollected`, `Foraged`, `Manifested`, `GiftGiven`, `Bent`.
- Randomness: `DieRolled`, `CoinFlipped`, `Voted`, `Clashed`.
- Other: `Attached` and `Unattached`, `ControlChanged`, `Phased`, `DamagePrevented`, `UpkeepCostPaid`.

With Milestone 3 added, coverage reaches **99.3% of clauses and 99.3–99.6% of trigger-bearing cards**.

**Never, or unmodeled (→ "check this card" task):** state triggers (`StateTrigger`, 56 clauses, e.g. Dark Depths, Darksteel Reactor), mana production and spending (`ManaProduced/Spent`, because the app doesn't track mana pools), hidden-zone-only conditions (`LibrarySearched`, `LibraryShuffled`, "no cards in hand"), Un-set stickers and Attractions, Villainous Choice, P/T thresholds, and Planechase/Archenemy. Together these are about 0.7% of clauses.

## Turn structure and zones (CR, effective 2026-11-06)

**Turn structure (CR 500–514)**

| Phase | Steps | Notes for the engine |
| --- | --- | --- |
| Beginning (501) | Untap (502), Upkeep (503), Draw (504) | No priority in untap. "At the beginning of your upkeep" triggers fire at the start of 503. |
| Precombat main (505) | — | "Main phase" triggers (Black Market Connections, Paradigm). |
| Combat (506) | Beginning of combat (507), Declare attackers (508), Declare blockers (509), Combat damage (510; a second first-strike damage step if needed), End of combat (511) | Declare-attackers and declare-blockers steps are skipped if no attackers. |
| Postcombat main (505) | — | Extra combats add more combat and main phases ("each of your postcombat main phases"). |
| Ending (512) | End step (513), Cleanup (514) | Cleanup normally has no priority unless SBAs happen or something triggers. |

**Zones (CR 400–408):** Library (401, hidden), Hand (402, hidden), Battlefield (403), Graveyard (404), Stack (405), Exile (406, public unless face down), Ante (407, not used), Command (408, holds commanders and emblems).

**Keyword actions (701.2–701.72):** Activate, Attach, Behold, Cast, Counter, Create, Destroy, Discard, Double, Triple, Exchange, Exile, Fight, Goad, Investigate, Mill, Play, Regenerate, Reveal, Sacrifice, Scry, Search, Shuffle, Surveil, Tap and Untap, Transform, Convert, Fateseal, Clash, Planeswalk, Set in Motion, Abandon, Proliferate, Detain, Populate, Monstrosity, Vote, Bolster, Manifest, Support, Meld, Exert, Explore, Assemble, Adapt, Amass, Learn, Venture into the Dungeon, Connive, Open an Attraction, Roll to Visit Your Attractions, Incubate, The Ring Tempts You, Face a Villainous Choice, Time Travel, Discover, Cloak, Collect Evidence, Suspect, Forage, Manifest Dread, Endure, Harness, Airbend, Earthbend, Waterbend, Blight, Heal, Recruit, Empower Jace, Assimilate.

**Keyword abilities (702.2–702.196):** Deathtouch, Defender, Double Strike, Enchant, Equip, First Strike, Flash, Flying, Haste, Hexproof, Indestructible, Intimidate, Landwalk, Lifelink, Protection, Reach, Shroud, Trample, Vigilance, Ward, Banding, Rampage, Cumulative Upkeep, Flanking, Phasing, Buyback, Shadow, Cycling, Echo, Horsemanship, Fading, Kicker, Flashback, Madness, Fear, Morph, Amplify, Provoke, Storm, Affinity, Entwine, Modular, Sunburst, Bushido, Soulshift, Splice, Offering, Ninjutsu, Epic, Convoke, Dredge, Transmute, Bloodthirst, Haunt, Replicate, Forecast, Graft, Recover, Ripple, Split Second, Suspend, Vanishing, Absorb, Aura Swap, Delve, Fortify, Frenzy, Gravestorm, Poisonous, Transfigure, Champion, Changeling, Evoke, Hideaway, Prowl, Reinforce, Conspire, Persist, Wither, Retrace, Devour, Exalted, Unearth, Cascade, Annihilator, Level Up, Rebound, Umbra Armor, Infect, Battle Cry, Living Weapon, Undying, Miracle, Soulbond, Overload, Scavenge, Unleash, Cipher, Evolve, Extort, Fuse, Bestow, Tribute, Dethrone, Hidden Agenda, Outlast, Prowess, Dash, Exploit, Menace, Renown, Awaken, Devoid, Ingest, Myriad, Surge, Skulk, Emerge, Escalate, Melee, Crew, Fabricate, Partner, Undaunted, Improvise, Aftermath, Embalm, Eternalize, Afflict, Ascend, Assist, Jump-Start, Mentor, Afterlife, Riot, Spectacle, Escape, Companion, Mutate, Encore, Boast, Foretell, Demonstrate, Daybound and Nightbound, Disturb, Decayed, Cleave, Training, Compleated, Reconfigure, Blitz, Casualty, Enlist, Read Ahead, Ravenous, Squad, Space Sculptor, Visit, Prototype, Living Metal, More Than Meets the Eye, For Mirrodin!, Toxic, Backup, Bargain, Craft, Disguise, Solved, Plot, Saddle, Spree, Freerunning, Gift, Offspring, Impending, Exhaust, Max Speed, Start Your Engines!, Harmonize, Mobilize, Job Select, Tiered, Station, Warp, ∞ (Infinity), Mayhem, Web-slinging, Firebending, Sneak, Increment, Paradigm, Power-up, Teamwork, Storied, Beam me up.

Of these, the CR text of **67 keywords defines a triggered ability**: Afflict, Afterlife, Annihilator, Backup, Battle Cry, Blitz, Bushido, Cascade, Casualty, Conspire, Cumulative Upkeep, Dash, Decayed, Demonstrate, Dethrone, Echo, Enlist, Epic, Escape, Evoke, Evolve, Exalted, Exploit, Extort, Fabricate, Firebending, Flanking, For Mirrodin!, Frenzy, Gift, Graft, Gravestorm, Haunt, Hideaway, Impending, Increment, Ingest, Job Select, Living Weapon, Madness, Melee, Mentor, Miracle, Mobilize, Modular, Myriad, Paradigm, Persist, Poisonous, Provoke, Prowess, Rampage, Ravenous, Rebound, Recover, Renown, Replicate, Ripple, Solved, Soulshift, Squad, Start Your Engines!, Storm, Training, Undying, Ward, Warp. Stripping reminder text hides these triggers from clause extraction, so they're counted separately below.

**Triggered abilities (CR 603), in brief**

- The form is "[When/Whenever/At] [event], [effect]" (603.1). An ability triggers whenever a game event matches. It is put on the stack the next time a player would receive priority (603.2–603.3). If several trigger at once, they go on in APNAP order and each controller orders their own (603.3b).
- "At the beginning of [step]" triggers fire as the step begins (603.2b). "Becomes" triggers fire only on the transition (603.2e). Prevented or replaced events trigger nothing (603.2g). An event that happens several times at once triggers once per occurrence (603.2c).
- Intervening "if" clauses are checked both on trigger and on resolution (603.4). Optional "may" triggers still go on the stack (603.5).
- Zone-change triggers (603.6): ETB is checked after the event; leaves-the-battlefield, sacrifice, "leaves a graveyard", control loss, phasing out, countered and loses-the-game triggers **look back in time** (603.10a–g). The engine must evaluate them against pre-event state.
- Delayed triggers are created by resolving effects and fire once unless they have a duration (603.7). State triggers fire when a condition becomes true and don't retrigger until it has resolved (603.8). Reflexive triggers are "when you do" (603.12).

**State-based actions (CR 704.5, plus 704.6 for Commander)**, checked whenever a player would receive priority and repeated until none apply:

- A player loses for 0 or less life, drawing from an empty library, or 10+ poison (704.5a–c), or for 21+ combat damage from a single commander (704.6c).
- Tokens and copies outside their legal zone cease to exist (704.5d–e).
- A creature dies from toughness ≤ 0, lethal damage, or any damage from a deathtouch source (704.5f–h). A planeswalker with 0 loyalty goes to the graveyard (704.5i).
- Legend rule (704.5j) and world rule (704.5k).
- Illegal attachments: Auras go to the graveyard, and Equipment and Fortifications become unattached (704.5m–p).
- +1/+1 and -1/-1 counters annihilate (704.5q), and counter caps apply (704.5r).
- Sagas, dungeons, battles, Roles and speed (704.5s–aa).
- A commander that went to the graveyard or exile may move to the command zone (704.6d).

SBA results are themselves events (`ZoneChanged` with cause SBA, `PlayerLost`) and can trigger abilities, which is why the engine loop repeats.

## Event catalog

Counts are trigger **clauses** (printed and granted; a clause like "enters or attacks" counts once under each label). The top-5k and top-1k scopes are the top N Commander-legal cards by Scryfall `edhrec_rank`. The full per-clause data is in `trigger_clauses.csv`, which the scripts regenerate (not checked in).

| Event type | Emitted by | Example cards (most popular first) | All | Top 5k | Top 1k | Milestone |
| --- | --- | --- | ---: | ---: | ---: | --- |
| PermanentEntered | ZoneChanged(→battlefield) incl. tokens, landfall | Bojuka Bog, Solemn Simulacrum, Garruk's Uprising | 5,745 | 872 | 153 | 1 |
| AttackDeclared | AttackersDeclared | Sword of the Animist, Etali, Primal Storm, Sun Titan | 1,903 | 304 | 20 | 1 |
| Died | ZoneChanged(battlefield→graveyard) | Skullclamp, Solemn Simulacrum, Blood Artist | 1,411 | 245 | 33 | 1 |
| SpellCast | SpellCast | Rhystic Study, Esper Sentinel, Mystic Remora | 1,411 | 322 | 32 | 1 |
| PhaseStarted(upkeep) | PhaseStarted | The One Ring, Phyrexian Arena, Mana Vault | 1,120 | 161 | 22 | 1 |
| CombatDamageToPlayer | DamageDealt(combat, player) | Professional Face-Breaker, Ragavan, Toski | 828 | 187 | 21 | 1 |
| PhaseStarted(end) | PhaseStarted | Braids, Arisen Nightmare, Underworld Breach, Conjurer's Closet | 654 | 137 | 8 | 1 |
| PhaseStarted(beginning_of_combat) | PhaseStarted | The Ozolith, Helm of the Host, Unnatural Growth | 345 | 51 | 5 | 1 |
| DamageDealt (any / noncombat / "is dealt") | DamageDealt | Curiosity, Brash Taunter, Mikaeus, the Unhallowed | 297 | 44 | 2 | 1 |
| LeftBattlefield | ZoneChanged(battlefield→any) | The Ozolith, Nadier's Nightblade | 204 | 27 | 2 | 1 |
| BlockDeclared | BlockersDeclared | Smuggler's Copter, Elder Gargaroth | 197 | 9 | 0 | 1 |
| BecameBlocked | BlockersDeclared | Grazilaxx, Anzrag, the Quake-Mole | 168 | 6 | 0 | 1 |
| CardDrawn | player-announced draw | Smothering Tithe, Orcish Bowmasters, Faerie Mastermind | 156 | 49 | 12 | 3 |
| Sacrificed | ZoneChanged(cause=sacrifice) incl. exploit | Mirkwood Bats, Mayhem Devil, Tireless Tracker | 134 | 33 | 3 | 3 |
| Tapped | TapStateChanged | City of Brass, Forsaken Monument, Magda | 127 | 14 | 2 | 3 |
| BecameTarget | targeting on cast/activate | Goldspan Dragon, Phantasmal Image | 123 | 11 | 1 | 3 |
| TurnedFaceUp | FaceChanged | Trail of Mystery, Rattleclaw Mystic, Den Protector | 121 | 0 | 0 | 3 |
| LifeGained | LifeChanged(+) | Vito, Sanguine Bond, Enduring Tenacity | 104 | 28 | 4 | 1 |
| Discarded | ZoneChanged(hand→graveyard, discard) | Necropotence, Waste Not | 99 | 32 | 2 | 3 |
| Cycled | ZoneChanged(cause=cycle) | Shark Typhoon, Archfiend of Ifnir | 89 | 10 | 0 | 3 |
| CountersPut | CountersChanged(+) | Midnight Clock, Terrasymbiosis, Evolution Witness | 79 | 24 | 3 | 1 (primitive) / 3 (triggers) |
| PutIntoGraveyard (from anywhere) | ZoneChanged(→graveyard) | Syr Konrad, Bloodchief Ascension, Gitrog Monster | 69 | 13 | 3 | 1 |
| PhaseStarted(main) / (main2) | PhaseStarted | Black Market Connections, Neheb, the Eternal | 66 / 29 | 14 / 11 | 3 / 0 | 1 |
| TappedForMana | TapStateChanged(for mana) | Wild Growth, Utopia Sprawl, Crypt Ghast | 57 | 24 | 5 | 3 |
| StateTrigger | state condition | Dark Depths, Darksteel Reactor | 56 | 3 | 0 | never (task) |
| AbilityActivated | ability activation | Rings of Brighthearth, Illusionist's Bracers | 48 | 7 | 0 | 3 |
| DoorUnlocked | Room mechanic | Walk-In Closet, Entity Tracker | 44 | 8 | 0 | 3 |
| LeftGraveyard | ZoneChanged(graveyard→any) | Syr Konrad, Insidious Roots | 44 | 9 | 1 | 3 |
| AttackerUnblocked | BlockersDeclared | Coveted Jewel, Master of Cruelties | 38 | 3 | 0 | 1 |
| SpellCopied | copy effect | Storm-Kiln Artist, Archmage Emeritus | 36 | 9 | 3 | 3 |
| CombatDamageToCreature | DamageDealt(combat, creature) | Kaldra Compleat, Stinkweed Imp | 35 | 3 | 0 | 1 |
| Transformed | FaceChanged | Ashling, Brigid | 35 | 2 | 0 | 3 |
| PhaseStarted(draw) | PhaseStarted | Mana Vault, Sylvan Library, Howling Mine | 34 | 13 | 3 | 1 |
| Mutated | FaceChanged / merge | Gemrazer, Nethroi | 32 | 1 | 0 | 3 |
| CombatDamageAny | DamageDealt(combat) | The Aetherspark, Umezawa's Jitte | 30 | 4 | 0 | 1 |
| Untapped | TapStateChanged | Mesmeric Orb, Key to the City | 30 | 5 | 0 | 3 |
| LandPlayed | land drop (special action) | Burgeoning, City of Traitors | 29 | 7 | 1 | 3 |
| Exiled | ZoneChanged(→exile) | Kaya's Ghostform, Laelia, Soulherder | 29 | 9 | 1 | 1 |
| Scried / Surveilled | player-announced | Planetarium of Wan Shi Tong, Matoya | 22 / 15 | 2 / 2 | 0 | 3 |
| LifeLost | LifeChanged(−) | Exquisite Blood, Bloodthirsty Conqueror | 21 | 8 | 3 | 1 |
| DieRolled / CoinFlipped | randomness | Vexing Puzzlebox, Okaun | 21 / 7 | 3 / 1 | 0 | 3 |
| CrimeCommitted | derived from BecameTarget (opponent or their stuff) | Patrolling Peacemaker, Magda, the Hoardmaster | 20 | 4 | 0 | 3 |
| PhaseStarted(end_of_combat) | PhaseStarted | Delina, Zariel | 19 | 2 | 0 | 1 |
| BecameMonstrous | keyword action | Hydra Broodmaster | 19 | 2 | 0 | 3 |
| CountersRemoved | CountersChanged(−) | Protean Hydra | 16 | 0 | 0 | 3 |
| ManaProduced/Spent | mana pool (not tracked) | Caged Sun, expend cards | 14 | 3 | 1 | never (task) |
| ClassLevelGained | Class mechanic | Caretaker's Talent, Wizard Class | 11 | 7 | 2 | 3 |
| DayNightChanged | day/night | The Celestus | 10 | 0 | 0 | 3 |
| Crewed, RingTempted, Milled, PlayerLost, Phased, Attached, ControlChanged, Explored, Exerted, ReturnedToHand, BecameMonarch, Proliferated, TokenCreated, Unattached, Ventured, Connived, Saddled, SpellCountered, AbilityTriggered, Voted, ... | various | — | 2–9 each | ≤2 each | ≤0 | 3 (PlayerLost, ReturnedToHand: 1) |

Notes:

- **Who the event is about.** For PermanentEntered, 85% of clauses are about the card itself ("When ~ enters"), 8% are about "a creature/land you control", and 4% are "another ...". For AttackDeclared, 71% are about the card itself, 10% are "you attack", and 5% are attached Equipment or Auras. For SpellCast, 82% are "you cast", 8% "an opponent casts" and 9% "a player casts". For upkeep and end-step triggers, 72–76% are "your" step and 19–27% are "each" step. Self-scoped triggers are the cheapest to wire: the source object is the subject.
- **Token creation is mostly a ZoneChanged event.** Current templating says "whenever one or more tokens you control enter", so a separate TokenCreated trigger is almost unused (4 clauses). Model token creation as `ZoneChanged(from: none, to: battlefield)`.
- **Batched "one or more" triggers** ("whenever one or more creatures you control deal combat damage to a player") need events that carry *sets*. `AttackersDeclared` and `DamageDealt` should be emitted once per batch, not once per object, with per-object detail inside. CR 603.2c covers multiple occurrences in one event.
- **Delayed and reflexive clauses (515).** 265 are reflexive ("When you do"). The rest are mostly "at the beginning of the next end step" (57: sacrifice or exile hasty tokens, unearth-like effects), Died (38) and SpellCast (28). The engine needs a `DelayedTrigger` registry keyed by these same event types.

## Coverage curve

Event types sorted by frequency. Each cell is the number of types needed to cover X% of trigger clauses. A clause counts as covered only when *all* of its labels are in the set.

| Scope | Clauses | Distinct types | 50% | 80% | 90% | 95% | 99% |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Top 1,000 | 339 | 29 | 2 | 7 | 12 | 18 | 26 |
| Top 5,000 | 2,674 | 63 | 3 | 8 | 15 | 24 | 44 |
| All Commander-legal | 15,841 | 105 | 3 | 8 | 16 | 27 | 53 |
| Top 1,000, phases merged into one PhaseStarted | 339 | 25 | 2 | 6 | 9 | 14 | 22 |

Top-1k order: PermanentEntered 43.4% → +Died 52.5% → +SpellCast 61.1% → +upkeep 67.6% → +CombatDamageToPlayer 73.8% → +AttackDeclared 79.4% → +CardDrawn 82.9% → +end step 85.3% → +TappedForMana 86.7% → +beginning of combat 88.2% → +LifeGained 89.4% → +Sacrificed 90.3% → … → 99.7% after LandPlayed → 100% with Exiled.

**Milestone coverage, by milestone event set:**

| Scope | Trigger-bearing cards | All triggers in M1 vocabulary | All triggers in M1+M3 vocabulary | Clauses in M1 | Clauses in M1+M3 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Top 1,000 | 300 | 265 (88.3%) | 298 (99.3%) | 89.1% | 99.4% |
| Top 5,000 | 2,244 | 1,967 (87.7%) | 2,234 (99.6%) | 89.1% | 99.6% |
| All | 13,867 | 12,294 (88.7%) | 13,764 (99.3%) | 89.7% | 99.3% |

## Long tail

After iterating on the classifier, no clause is unmatched. What's left is about 100 clauses that classify but shouldn't be automated:

| Bucket | Clauses | Examples | Suggested handling |
| --- | ---: | --- | --- |
| StateTrigger (CR 603.8) | 56 | Dark Depths "has no ice counters", Darksteel Reactor "twenty or more charge counters", The Millennium Calendar "1,000 or more time counters", "When you control no Islands" | Unmodeled → "check this card" task. A later milestone could check these after each SBA pass, since they are state predicates. |
| ManaProduced/Spent | 14 | Caged Sun, Wandertale Mentor "whenever you expend 4", Path of Ancestry "when that mana is spent" | The app doesn't track mana. → task. |
| Hidden-zone-only conditions | 9 | Archivist of Oghma "an opponent searches their library", Psychic Surgery "shuffles", Veiled Crocodile "no cards in hand" | → reminder ("Did anyone search?"). |
| Villainous Choice, Attractions, stickers | 17 | Seven of Nine, The Most Dangerous Gamer, Unlawful Entry | → task. Rare in casual Commander. |
| Reflexive / choice-based | 5 | Call of the Ring, The Temporal Anchor | → task. |
| Saga-chapter meta, P/T threshold | 4 | Narci, Fable Singer; Phyrexian Devourer | → task. |

Also unmodeled by design, and outside the clause extraction:

- **Saga chapter abilities.** 237 Sagas, 43 of them in the top 5k. Chapter abilities are triggered (lore counters) but are written "I — ...". Handle them via `CountersChanged(lore)` in Milestone 3.
- **Keyword-implied triggers.** 980 cards have triggers *only* via keywords; see Keyword frequencies.

Rule for the engine: if a card has any trigger the translation doesn't cover, show a "check this card" task when its event fires. Never guess.

## Hidden-zone triggers

The app tracks only public zones, so triggers that depend on library or hand become reminders or tasks.

| Scope | Trigger cards | Condition references a hidden zone (draw, discard, search, "from your hand", hand size) | Effect references a hidden zone |
| --- | ---: | ---: | ---: |
| Top 1,000 | 300 | 17 cards (18 clauses) | 143 cards (48%) |
| Top 5,000 | 2,244 | 109 cards | 824 cards (37%) |
| All | 13,867 | 385 cards (400 clauses) | 4,276 cards (31%) |

What the hidden-zone effects do:

| Effect | Top-1k cards | All cards |
| --- | ---: | ---: |
| Draw cards | 70 | 1,643 |
| Return or put a card into hand (bounce, regrowth, tutor-to-hand) | 25 | 1,096 |
| Scry or surveil | 21 | 345 |
| Put on top or bottom of library, or shuffle | 20 | 706 |
| Search library | 14 | 365 |
| Mill | 7 | 300 |
| Discard | 6 | 618 |
| Look at or reveal the top | 5 | 487 |
| Cast or put from hand or library | 6 | 233 |

Implications:

- **Hidden-zone conditions** (CardDrawn, Discarded, LibrarySearched, Shuffled; e.g. Smothering Tithe, Orcish Bowmasters, Faerie Mastermind) can only fire when a player announces the action. Milestone 3 needs voice verbs "I draw", "I discard", "I searched" for this. Otherwise they become standing reminders ("Smothering Tithe: did an opponent draw?").
- **Hidden-zone effects** are fine as tasks. The trigger fires from a public event, and the app shows "Solemn Simulacrum: search for a basic land" or "Skullclamp: draw 2". Card *counts* in hand and library are public information and could be tracked as numbers later, but the cards themselves never are.

## Keyword frequencies

Counted on the top 1,000 cards by EDHREC rank, of which only 244 are creatures. "Has" uses Scryfall's `keywords` field. "Mentions" means the card has no such keyword but its text grants or references it ("creatures you control have flying", "gains indestructible").

| Keyword | Top 1k: has | Top 1k: mentions | Top 5k: has | Top 5k: mentions | All: has | All: mentions |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Flying | 34 | 16 | 417 | 137 | 3,184 | 1,284 |
| Trample | 6 | 10 | 135 | 92 | 1,010 | 617 |
| Deathtouch | 5 | 4 | 60 | 37 | 333 | 229 |
| Lifelink | 4 | 9 | 79 | 61 | 370 | 315 |
| First strike | 2 | 0 | 50 | 28 | 379 | 403 |
| Double strike | 0 | 3 | 19 | 39 | 122 | 189 |
| Vigilance | 11 | 5 | 93 | 55 | 747 | 386 |
| Menace | 1 | 0 | 51 | 25 | 397 | 238 |
| Reach | 3 | 0 | 53 | 17 | 429 | 135 |
| Indestructible | 12 | 22 | 61 | 108 | 114 | 405 |
| Haste | 6 | 15 | 68 | 142 | 648 | 741 |
| Hexproof | 1 | 14 | 9 | 76 | 94 | 247 |
| Ward | 3 | 3 | 47 | 18 | 198 | 46 |
| Protection | 2 | 8 | 13 | 40 | 195 | 163 |
| Infect / Toxic | 1 / 0 | 0 / 0 | 7 / 10 | 5 / 3 | 46 / 37 | 15 / 22 |

Takeaways:

- Flying, vigilance, indestructible, haste and trample dominate.
- Indestructible, haste and hexproof are **granted** more often than printed, so the combat model needs per-turn granted keywords (from "until end of turn" effects), not just printed ones.
- First strike and double strike are rare among popular cards but do appear (via Equipment and anthems), so plan for the second combat damage step from the start.

**Keyword-implied triggers.** These are triggers hidden in reminder text, mapped to our events in `KEYWORD_TRIGGER_EVENTS`.

- **Top 1k:** Prowess 3, Hideaway 3, Ward 3, Storm 3, Extort 2, Exalted 2, Rebound, Dash, Fabricate, Offspring, Cumulative upkeep, Echo, Mobilize and Evolve 1 each.
- **Top 5k:** Ward 47, Warp 12, Suspend 11, Prowess 11, Annihilator 10, Storm 10, Myriad 9, Cascade 8.
- **All cards:** Ward 198, Prowess 94, Cumulative upkeep 80, Suspend 70, Madness 61, Unearth 56, Echo 50, Start your engines! 41, Cascade 37.

All of these map onto events already in the M1 or M3 list: SpellCast, AttackDeclared, PhaseStarted, Died, BecameTarget, PermanentEntered.

## Forge trigger-mode cross-check

Source: Forge `docs/Card-scripting-API/Triggers.md` (which documents about 60 modes) plus the mode *names* from `TriggerType` (148 names, commit `e4bef51`, 2026-11-20). Only the names were used; no Forge code or card scripts were copied.

| Our event / primitive | Forge trigger modes |
| --- | --- |
| ZoneChanged → PermanentEntered, Died, LeftBattlefield, PutIntoGraveyard, ReturnedToHand, LeftGraveyard, PutIntoLibrary, PutIntoCommandZone, TokenCreated | ChangesZone, ChangesZoneAll, TokenCreated, TokenCreatedOnce |
| Exiled / Destroyed / Sacrificed | Exiled; Destroyed; Sacrificed, SacrificedOnce, Exploited, Devoured |
| AttackersDeclared → AttackDeclared | Attacks, AttackersDeclared, AttackersDeclaredOneTarget |
| BlockersDeclared → BlockDeclared, BecameBlocked, AttackerUnblocked | Blocks, BlockersDeclared, AttackerBlocked, AttackerBlockedOnce, AttackerBlockedByCreature, AttackerUnblocked, AttackerUnblockedOnce |
| DamageDealt (all combat/noncombat variants) | DamageDone, DamageDoneOnce, DamageDealtOnce, DamageAll, DamageDoneOnceByController, ExcessDamage, ExcessDamageAll |
| DamagePrevented | DamagePreventedOnce |
| PhaseStarted | Phase, TurnBegin |
| SpellCast / SpellCopied | SpellCast, SpellCastOrCopy, SpellAbilityCast, SpellCopy, SpellAbilityCopy |
| AbilityActivated / AbilityTriggered / SpellResolved / SpellCountered | AbilityCast, AbilityTriggered, AbilityResolves, Countered |
| LifeChanged → LifeGained, LifeLost, LifePaid | LifeGained, LifeLost, LifeLostAll, PayLife |
| PlayerLost | LosesGame |
| CountersChanged | CounterAdded, CounterAddedOnce, CounterAddedAll, CounterPlayerAddedAll, CounterTypeAddedAll, CounterRemoved, CounterRemovedOnce, Proliferate |
| CardDrawn, Discarded, Milled, Cycled, LibrarySearched, Shuffled, Scried, Surveilled | Drawn, Discarded, DiscardedAll, Milled, MilledOnce, MilledAll, Cycled, SearchedLibrary, Shuffled, Scry, Surveil |
| TapStateChanged / TappedForMana | Taps, TapAll, Untaps, UntapAll, TapsForMana |
| BecameTarget | BecomesTarget, BecomesTargetOnce |
| FaceChanged / Mutated / Phased | Transformed, TurnFaceUp, Mutates, PhaseIn, PhaseOut, PhaseOutAll |
| Attached / Unattached / ControlChanged | Attached, Unattached, ChangesController |
| LandPlayed | LandPlayed |
| Keyword-action events | BecomeMonstrous, BecomeRenowned, Exerted, Evolved, Crewed, BecomesCrewed, Saddled, BecomesSaddled, Stationed, Championed, Enlisted, Mentored, Trains, Explores, Connives, Discover, Investigated, Forage, Foretell, BecomesPlotted, CollectEvidence, ManifestDread, Fight, FightOnce, Adapt, Airbend, Earthbend, Waterbend, Firebend, ElementalBend, GiveGift |
| Named mechanics / designations | BecomeMonarch, TakesInitiative, DungeonCompleted, RoomEntered, RingTemptsYou, CommitCrime, UnlockDoor, FullyUnlock, ClassLevelGained, CaseSolved |
| Randomness / voting | RolledDie, RolledDieOnce, FlippedCoin, FlippedCoinOnce, Vote, Clashed |
| UpkeepCostPaid | PayCumulativeUpkeep, PayEcho |
| ManaProduced/Spent (unmodeled) | ManaAdded, ManaExpend |
| StateTrigger (unmodeled) | Always |
| Reflexive / delayed (registry, not an event) | Immediate |
| **Never** (other formats, Un-sets, digital) | PlanarDice, PlaneswalkedTo, PlaneswalkedFrom, ChaosEnsues, SetInMotion, Abandoned, FacesDilemma, CrankContraption, StickerPlaced, VisitAttraction, ClaimPrize, ConjureAll, SeekAll, Specializes, NewGame |

Cross-check result:

- Every Forge mode maps to one of our primitives or to an explicit never/unmodeled bucket.
- Forge has finer "Once" and "All" variants (batched vs per-object). Our "events carry sets" design covers those.
- Our only event without a dedicated Forge mode is `DayNightChanged`, which Forge models as state.
- Forge has no events beyond what the Scryfall data showed. Its large count (148) comes mostly from batching variants and one-mechanic modes.

## Sources

- Comprehensive Rules, effective **2026-11-06**, TXT: https://media.wizards.com/2026/downloads/MagicCompRules%2020261106.txt (linked from https://magic.wizards.com/en/rules). Fetched 2026-11-21.
- Scryfall Oracle Cards bulk data (https://scryfall.com/docs/api/bulk-data), file `oc.jsonl.gz` downloaded 2026-11-20 (39,356 objects).
- Forge Triggers.md: https://github.com/Card-Forge/forge/blob/master/docs/Card-scripting-API/Triggers.md. Mode names only from https://github.com/Card-Forge/forge/blob/master/forge-game/src/main/java/forge/game/trigger/TriggerType.java at commit e4bef517 (2026-11-20). Fetched 2026-11-21. Forge is GPL; nothing was copied beyond identifier names.
- EDHREC popularity via Scryfall's `edhrec_rank` field (32,575 of the 32,643 cards are ranked).

## Method and caveats

**Card set.** `legalities.commander == "legal"`, excluding layouts token, double_faced_token, emblem, art_series, planar, scheme and vanguard, and any type line containing "Token". All faces' `oracle_text` is included. Reminder text in parentheses is stripped. Self-references (card name, short legendary name, "this creature/artifact/...") are normalized to `~`.

**Clause extraction.**
- A clause is a sentence starting with When/Whenever/At at the start of a paragraph, after an ability-word dash ("Landfall — Whenever"), after a period, or after an opening quote.
- Clauses are tagged `printed` (paragraph start or after an ability word), `granted` (inside quotes, e.g. "creatures you control have 'Whenever ...'"), or `delayed_or_reflexive` (mid-paragraph).
- The condition runs up to the first comma that isn't part of a list ("an artifact, creature, or enchantment", "nontoken, non-Spirit", "1,000").

**Classification.**
- An ordered list of regexes is matched against the condition. Specific patterns go first ("dealt damage by ~ this turn dies" → Died), and every rule may claim one non-overlapping span. That gives multi-labels for "enters or attacks" (583 clauses, 3.7%).
- "while ..." qualifiers are dropped. State-ish labels are removed when a real event is also present. "cast a spell that targets" counts as SpellCast, not BecameTarget.
- Precision was checked by sampling random clauses per label and auditing every multi-label combination.

**Caveats.**
- Regex classification is approximate. Expect a small error rate in mid-frequency labels (e.g. some DamageDealt vs CombatDamageAny boundary cases).
- Counts are clauses, not abilities weighted by how often they fire in play. An upkeep trigger fires every turn; a cycling trigger rarely does.
- "Top N" is the top N *within this card set* by `edhrec_rank`, so basic lands and staples are included. EDHREC rank measures deck inclusion, not play frequency.
- The hidden-zone regex flags any library or hand mention in the ability text, so it overcounts slightly, e.g. "return to its owner's hand" from the battlefield is a public→hidden move the app can still record.
- Keyword-implied triggers rely on Scryfall's `keywords` field and a hand-written keyword→event map (`KEYWORD_TRIGGER_EVENTS`), cross-checked against CR keywords whose text says "triggered ability".

**Outputs and scripts.**

The scripts write these outputs, which are not checked in:

- `trigger_clauses.csv`: 16,356 rows; columns card_name, edhrec_rank, rank_in_commander_set, kind, clause, event_type, filter, hidden_zone_condition, hidden_zone_effect.
- `stats.json`: every aggregate above.
- `unmatched.txt`: currently empty.

Scripts in `triggers-scripts/`: `analyze.py` (main, also imported by the others), `extra.py` (type mix, milestone coverage, hidden-zone breakdown, filters), `any_trigger.py`, `report.py`.

To reproduce, download the Scryfall Oracle Cards bulk file and the Comprehensive Rules text (both under Sources), then:

```sh
python3 -I docs/research/triggers-scripts/analyze.py <oracle-cards.jsonl.gz> <comprehensive-rules.txt> <outdir>
python3 -I docs/research/triggers-scripts/extra.py <oracle-cards.jsonl.gz> <outdir>/trigger_clauses.csv <outdir>/stats.json
```
