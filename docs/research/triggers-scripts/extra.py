#!/usr/bin/env python3
"""Supplementary numbers for triggers.md.
Usage: python3 -I extra.py <oracle-cards.jsonl.gz> <trigger_clauses.csv> <stats.json>"""
import csv, collections, gzip, json, re, sys
SRC, CSV, STATS = sys.argv[1:4]
sys.path.insert(0, __import__("os").path.dirname(__file__))
import analyze as A  # noqa: E402

cards = A.load_cards(SRC)
ranked = sorted([c for c in cards if c.get("edhrec_rank")], key=lambda c: c["edhrec_rank"])
top = {n: {c["oracle_id"] for c in ranked[:n]} for n in (1000, 5000)}
byid = {c["oracle_id"]: c for c in cards}

# type mix
for n in (1000, 5000):
    tc = collections.Counter()
    for oid in top[n]:
        tl = byid[oid]["type_line"].split("//")[0]
        for t in ("Creature", "Land", "Instant", "Sorcery", "Artifact", "Enchantment", "Planeswalker", "Battle"):
            if t in tl: tc[t] += 1
    print("types top", n, dict(tc))

rows = [r for r in csv.DictReader(open(CSV)) if r["kind"] != "delayed_or_reflexive"]
s = json.load(open(STATS))

M1 = {"PhaseStarted(upkeep)", "PhaseStarted(draw)", "PhaseStarted(main)", "PhaseStarted(main2)",
      "PhaseStarted(beginning_of_combat)", "PhaseStarted(declare_blockers)", "PhaseStarted(combat_damage)",
      "PhaseStarted(end_of_combat)", "PhaseStarted(end)", "PhaseStarted(cleanup)", "PhaseStarted(turn)",
      "AttackDeclared", "BlockDeclared", "BecameBlocked", "AttackerUnblocked",
      "CombatDamageToPlayer", "CombatDamageToCreature", "CombatDamageAny", "DamageDealt",
      "LifeGained", "LifeLost", "LifePaid", "SpellCast", "PermanentEntered", "Died", "LeftBattlefield",
      "PutIntoGraveyard", "Exiled", "ReturnedToHand", "PutIntoCommandZone", "PlayerLost"}
M3 = {"CardDrawn", "Sacrificed", "Tapped", "Untapped", "TappedForMana", "BecameTarget", "TurnedFaceUp",
      "Discarded", "Cycled", "CountersPut", "CountersRemoved", "LeftGraveyard", "SpellCopied",
      "AbilityActivated", "Transformed", "Mutated", "LandPlayed", "Milled", "Scried", "Surveilled",
      "TokenCreated", "Proliferated", "DoorUnlocked", "ClassLevelGained", "CaseSolved", "CrimeCommitted",
      "BecameMonstrous", "BecameRenowned", "DieRolled", "CoinFlipped", "Crewed", "Saddled", "Stationed",
      "Attached", "Unattached", "ControlChanged", "Exerted", "Explored", "Connived", "Discovered",
      "Fought", "SpellCountered", "DayNightChanged", "RingTempted", "BecameMonarch", "InitiativeTaken",
      "VenturedOrDungeon", "Investigated", "Foretold", "Plotted", "EvidenceCollected", "Foraged",
      "Manifested", "Mentored", "Enlisted", "Evolved", "Trained", "Championed", "Phased", "Destroyed",
      "Bent", "GiftGiven", "Descended", "SpellResolved", "Voted", "DamagePrevented", "TurnedFaceDown",
      "UpkeepCostPaid", "AbilityTriggered", "PutIntoLibrary", "Clashed"}

def card_cov(scope, allowed):
    per = collections.defaultdict(list)
    for r in rows:
        if scope != "all" and r["rank_in_commander_set"] and int(r["rank_in_commander_set"]) <= scope or scope == "all":
            per[r["card_name"]].append(r["event_type"].split("|"))
    tot = len(per)
    ok = sum(1 for labs in per.values() if all(l in allowed for ls in labs for l in ls))
    return tot, ok
for scope in (1000, 5000, "all"):
    t, a = card_cov(scope, M1); t2, b = card_cov(scope, M1 | M3)
    # clause coverage
    sr = [r for r in rows if scope == "all" or (r["rank_in_commander_set"] and int(r["rank_in_commander_set"]) <= scope)]
    c1 = sum(1 for r in sr if all(l in M1 for l in r["event_type"].split("|")))
    c3 = sum(1 for r in sr if all(l in M1 | M3 for l in r["event_type"].split("|")))
    print(f"scope {scope}: trigger cards {t}; fully M1 {a} ({100*a/t:.1f}%); M1+M3 {b} ({100*b/t:.1f}%) | clauses {len(sr)} M1 {100*c1/len(sr):.1f}% M1+M3 {100*c3/len(sr):.1f}%")

leftover = collections.Counter()
for r in rows:
    for l in r["event_type"].split("|"):
        if l not in M1 | M3: leftover[l] += 1
print("not in M1/M3:", leftover.most_common())

# hidden-zone effect breakdown (which hidden-zone thing does the effect do)
HZ = [("draw", r"\bdraws? (?:a|an|two|three|four|x|that many|cards?|\d)"),
      ("search library", r"\bsearch(?:es)? (?:your|their|a|that player's) library"),
      ("to hand (bounce/regrowth/tutor)", r"(?:return|put)[^.]* (?:to|into) (?:its owner's|your|their owners'|their) hands?"),
      ("discard", r"\bdiscards?\b"),
      ("look/reveal top", r"\blook at the top|\breveals? the top|\bexile the top"),
      ("scry/surveil", r"\bscry\b|\bsurveils?\b"),
      ("mill", r"\bmills?\b"),
      ("library top/bottom placement/shuffle", r"on (?:the )?(?:top|bottom) of (?:your|its owner's|their|a) library|\bshuffles?\b|into (?:your|its owner's|their) library"),
      ("from hand/library (cast/put from)", r"from (?:your|their|a|that player's) (?:hand|library)"),
      ("hand size reference", r"cards? in (?:your|their) hand")]
import csv as _c
full = {}
for c in cards:
    for x in A.extract(c):
        if x["kind"] == "delayed_or_reflexive": continue
        full.setdefault(c["oracle_id"], []).append(x["ability"].lower())
for scope in (1000, "all"):
    cnt = collections.Counter(); n = 0
    for oid, abs_ in full.items():
        if scope != "all" and oid not in top[scope]: continue
        hit = set()
        for ab in abs_:
            for name, rx in HZ:
                if re.search(rx, ab): hit.add(name)
        if hit: n += 1
        for h in hit: cnt[h] += 1
    print("hidden effect breakdown", scope, n, cnt.most_common())

# filter breakdown for big events (all and top-5k)
for scope in ("all", "5000"):
    f = s[scope]["filters"]
    for e in ("PermanentEntered", "AttackDeclared", "Died", "SpellCast", "CombatDamageToPlayer", "PhaseStarted(upkeep)", "PhaseStarted(end)", "DamageDealt", "CardDrawn", "LeftBattlefield"):
        print(scope, e, sorted(f.get(e, {}).items(), key=lambda kv: -kv[1]))

# landfall share of PermanentEntered
pe = [r for r in rows if "PermanentEntered" in r["event_type"]]
land = sum(1 for r in pe if re.search(r"\blands?\b", r["clause"].lower()))
self_ = sum(1 for r in pe if r["filter"] == "self")
print("PermanentEntered: land-related", land, "self", self_, "of", len(pe))
# multi-label share
print("multi-label clauses", sum(1 for r in rows if "|" in r["event_type"]), "of", len(rows))
