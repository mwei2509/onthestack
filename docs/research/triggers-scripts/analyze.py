#!/usr/bin/env python3
"""Trigger-clause analysis of Scryfall Oracle Cards for On The Stack.

Usage: python3 -I analyze.py <oracle-cards.jsonl.gz> <cr.txt> <out_dir>

Outputs (in out_dir):
  trigger_clauses.csv   one row per extracted trigger clause
  stats.json            all aggregate numbers used in triggers.md
  unmatched.txt         unmatched clauses with examples (long tail)
"""
import csv
import collections
import gzip
import json
import re
import sys

SRC = CR = OUT = None

EXCLUDED_LAYOUTS = {"token", "double_faced_token", "emblem", "art_series",
                    "planar", "scheme", "vanguard"}

# --------------------------------------------------------------------------
# Load cards
# --------------------------------------------------------------------------

def load_cards(src=None):
    global SRC
    SRC = src or SRC
    cards = []
    with gzip.open(SRC, "rt", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip().rstrip(",")
            if not line or line in "[]":
                continue
            d = json.loads(line)
            if d.get("legalities", {}).get("commander") != "legal":
                continue
            if d.get("layout") in EXCLUDED_LAYOUTS:
                continue
            if "Token" in (d.get("type_line") or "").split("—")[0]:
                continue
            cards.append(d)
    return cards


SELF_WORDS = r"(?:creature|artifact|enchantment|land|permanent|vehicle|aura|equipment|spell|card|token|saga|siege|class|spacecraft|planeswalker|battle|case|room|plane|dungeon|attraction|contraption|kindred|object|fortification|background|role|curse|shrine)"


def faces(card):
    if card.get("card_faces"):
        return [(f.get("name", ""), f.get("oracle_text") or "", f.get("type_line") or card.get("type_line", ""))
                for f in card["card_faces"]]
    return [(card["name"], card.get("oracle_text") or "", card.get("type_line") or "")]


def strip_reminder(text):
    # reminder text is parenthesised; nested parens do not occur in oracle text
    return re.sub(r"\s*\([^()]*\)", "", text)


def self_names(name):
    out = {name}
    if ", " in name:
        out.add(name.split(", ")[0])
    # "Name the Epithet" short forms
    m = re.match(r"^(\S+) (?:the|of) ", name)
    if m:
        out.add(m.group(1))
    return sorted((n for n in out if len(n) > 2), key=len, reverse=True)


def normalise_self(text, names):
    for n in names:
        text = re.sub(r"(?<![\w'])" + re.escape(n) + r"(?![\w])", "~", text)
    text = re.sub(r"\bthis " + SELF_WORDS + r"\b", "~", text, flags=re.I)
    return text


# --------------------------------------------------------------------------
# Clause extraction
# --------------------------------------------------------------------------

TRIG_START = re.compile(r"(?:(?<=^)|(?<=\n)|(?<=— )|(?<=\. )|(?<=\")|(?<=“))(When|Whenever|At)\b(?! random)")


def condition_end(s):
    """Return index of the comma that ends the trigger condition, skipping
    list commas like 'an artifact, creature, or enchantment'."""
    i = 0
    while True:
        j = s.find(",", i)
        if j < 0:
            # no comma (malformed) -> up to first period
            k = s.find(".")
            return k if k >= 0 else len(s)
        rest = s[j + 1:]
        if j > 0 and s[j - 1].isdigit() and rest[:1].isdigit():
            i = j + 1
            continue
        prev_word = re.findall(r"[\w\-]+$", s[:j])
        if (prev_word and prev_word[0].lower().startswith("non")) or re.match(r"\snon", rest):
            i = j + 1
            continue
        if re.match(r"\s(?:or|and|and/or)\s", rest) or \
           re.match(r"\s(?:a |an )?[\w/+\-]+(?:\s[\w/+\-]+)?,\s(?:and|or|and/or)\s", rest) or \
           re.match(r"\s(?:a |an )?[\w/+\-]+,\s", rest) and re.search(r",\s(?:or|and|and/or)\s", rest[:60]) and not re.match(r"\s(?:if|you|put|draw|create|target|each|that|return|exile|it|this|~)\b", rest):
            i = j + 1
            continue
        return j


def extract(card):
    """Yield dicts: face, kind, clause (raw), cond (normalised lower), ability text."""
    res = []
    for fname, text, tline in faces(card):
        text = strip_reminder(text)
        names = self_names(fname) + self_names(card["name"])
        for para in text.split("\n"):
            para_n = normalise_self(para, names)
            for m in TRIG_START.finditer(para_n):
                start = m.start()
                before = para_n[:start]
                in_quote = before.count('"') % 2 == 1 or before.count("“") > before.count("”")
                at_para_start = before.strip() == "" or re.fullmatch(r"[^.\"]*— ", before) is not None
                if in_quote:
                    kind = "granted"
                elif at_para_start:
                    kind = "printed"
                else:
                    kind = "delayed_or_reflexive"
                s = para_n[start:]
                end = condition_end(s)
                cond = s[:end].strip()
                # ability text: to end of quote / paragraph
                ab = s
                if in_quote:
                    q = re.search(r"[\"”]", s)
                    ab = s[:q.start()] if q else s
                res.append(dict(face=fname, kind=kind, clause=cond, ability=ab.strip(),
                                para=para_n))
    return res


# --------------------------------------------------------------------------
# Classification
# --------------------------------------------------------------------------

STEP_MAP = [
    (r"upkeep", "upkeep"),
    (r"draw step", "draw"),
    (r"(?:postcombat|second) main phases?", "main2"),
    (r"(?:precombat|first) main phases?|main phases?", "main"),
    (r"(?:each |the |your |that )?combat(?: on your turn)?|declare attackers step", "beginning_of_combat"),
    (r"declare blockers step", "declare_blockers"),
    (r"combat damage step", "combat_damage"),
    (r"end step|end of turn", "end"),
    (r"cleanup step", "cleanup"),
    (r"(?:your|each|each player's|each opponent's|the next|that player's|their|an opponent's|target opponent's) turn|turn", "turn"),
]

# Ordered (regex, EventType). First-matching rules win on overlapping spans.
# Patterns run on the lower-cased condition text after the leading word.
R = []
def rule(pat, ev):
    R.append((re.compile(pat), ev))

SUBJ = r"(?:~|it|they|that creature|enchanted \w+|equipped creature|[\w\s,'/+\-~]*?)"

# --- phases / steps (handled specially, see classify) ---
# --- specific / meta (must win before generic verbs) ---
rule(r"\brolls? (?:[\w\-]+ ){0,3}d(?:ie|ice)\b", "DieRolled")
rule(r"\bexploits?\b", "Sacrificed")
rule(r"\b(?:there are|has|have) (?:[\w,]+ or (?:more|fewer)|no) [\w\-]+ counters on", "StateTrigger")
rule(r"\bother than ~'s owner controls|\bcontrols it\b", "ControlChanged")
rule(r"\bchoose a creature as your ring-bearer", "RingTempted")
rule(r"\bdoesn't pay [^,]*cumulative upkeep", "UpkeepCostPaid")
rule(r"\bgains? or loses? life|\bgain or lose life", "LifeGained|LifeLost")
rule(r"\b(?:an opponent|a player|one or more opponents|one or more players|you) (?:is|are) dealt combat damage|\bcombat damage to one of your opponents|\bcombat damage to (?:one or more of )?your opponents", "CombatDamageToPlayer")
rule(r"\bmentors?\b", "Mentored")
rule(r"\benlists?\b", "Enlisted")
rule(r"\bface[sd]? a (?:villainous choice|dilemma)", "VillainousChoiceFaced")
rule(r"\b(?:echo|cumulative upkeep) cost is paid|\bcumulative upkeep is paid|\becho is paid", "UpkeepCostPaid")
rule(r"\bkicks? a spell|\bkicked\b", "SpellCast")
rule(r"\btriggered ability (?:of [^,]* )?to trigger|\bcauses? a triggered ability", "AbilityTriggered")
rule(r"\bdamage that would be dealt [^,]* is prevented|\bdamage is prevented|\bprevent(?:s|ed)? damage", "DamagePrevented")
rule(r"\bget(?:s)? (?:one or more |\w+ )?\{e\}|\bget (?:one or more )?energy", "CountersPut")
rule(r"\bput into the command zone|\bput into (?:your|the) command zone", "PutIntoCommandZone")
rule(r"\bis championed|\bchampions?\b", "Championed")
rule(r"\bwaterbend|\bearthbend|\bfirebend|\bairbend", "Bent")
rule(r"\bput into (?:a|your|their|its owner's) library|\bput into a library", "PutIntoLibrary")
rule(r"\bput into (?:your|a|its owner's) hand from (?:your|a) graveyard", "LeftGraveyard")
rule(r"\bplays? (?:a|an) card|\bplay (?:a|an) card|\bplays? (?:a )?cards? exiled|\bplay (?:a )?cards? exiled|\bplays? a card", "SpellCast|LandPlayed")
rule(r"\bspell or ability is put onto the stack", "SpellCast|AbilityActivated")
rule(r"\bplays? (?:[\w\-]+ ){0,3}(?:lands?|island|swamp|forest|mountain|plains)\b", "LandPlayed")
rule(r"\bputs? [^,]*? onto the battlefield", "PermanentEntered")
rule(r"\bput into (?:a|an?|your|its owner's|an opponent's|their owners'?|that player's|a player's) graveyards? from the battlefield", "Died")
rule(r"\bput into (?:\w+ |a player's )?graveyards? from (?:anywhere|your library|a library|your hand)", "PutIntoGraveyard")
rule(r"\b(?:is|are) returned to (?:a player's |\w+ )?hands?", "ReturnedToHand")
rule(r"\bturns? (?:[\w\-]+ ){0,3}face up", "TurnedFaceUp")
rule(r"\b(?:to be|are|is) exiled\b", "Exiled")
rule(r"\b(?:loses?|lose|lost) (?:exactly )?(?:\d+ (?:or more )?)?life", "LifeLost")
rule(r"\b(?:deals?|dealt|is dealt|are dealt) (?:exactly )?(?:\d+|x) (?:or more |or greater )?(?:excess )?(?:noncombat )?damage|\bdealt excess (?:noncombat )?damage", "DamageDealt")
# --- combat ---
rule(r"\b(?:deals?|dealt) combat damage to (?:a player|an opponent|one or more players|one or more opponents|you|that player|a player or planeswalker|a player or battle|a player, planeswalker|its controller|defending player|the defending player)", "CombatDamageToPlayer")
rule(r"\bdeal combat damage to (?:a player|an opponent|one or more players|one or more opponents|you)", "CombatDamageToPlayer")
rule(r"\b(?:deals?|dealt) combat damage to (?:a creature|a planeswalker|a permanent|a battle|it|~|that creature|another creature|one or more creatures)", "CombatDamageToCreature")
rule(r"\b(?:deals?|dealt) combat damage\b", "CombatDamageAny")
rule(r"\bdeal combat damage\b", "CombatDamageAny")
rule(r"\bis dealt combat damage|\bare dealt combat damage", "CombatDamageAny")
rule(r"\bdealt damage by [^,]*? (?:this turn )?dies", "Died")
rule(r"\b(?:deals?|dealt) (?:noncombat )?(?:excess )?damage\b", "DamageDealt")
rule(r"\bdeal damage\b", "DamageDealt")
rule(r"\b(?:is|are|was|were|becomes?) dealt (?:noncombat )?damage|\bdamage is dealt to\b|\bwould be dealt damage", "DamageDealt")
rule(r"\b(?:attacks|attack) (?:and|but) (?:isn't|aren't) blocked|\bbecomes? unblocked|\bisn't blocked|\baren't blocked", "AttackerUnblocked")
rule(r"\bbecomes? blocked\b|\bis blocked\b|\bare blocked\b", "BecameBlocked")
rule(r"\b(?:attacks|attack)(?: or blocks| and/or blocks)\b", "AttackDeclared|BlockDeclared")
rule(r"\bblocks or (?:becomes blocked|is blocked)", "BlockDeclared|BecameBlocked")
rule(r"\bblocks or attacks", "BlockDeclared|AttackDeclared")
rule(r"\b(?:attacks|attack|attacked)\b", "AttackDeclared")
rule(r"\b(?:blocks|block|blocked)\b", "BlockDeclared")
rule(r"\bfights?\b", "Fought")
# --- zones ---
rule(r"\b(?:dies|die)\b|\bis put into (?:a|your|its owner's|an opponent's) graveyard from the battlefield|\bare put into (?:a|your|its owner's|an opponent's|their owners'?) graveyards? from the battlefield|\bgo(?:es)? to (?:a|the|your) graveyard from the battlefield", "Died")
rule(r"\bput into (?:a|your|its owner's|an opponent's|their owners'?|that player's) graveyards? from (?:anywhere|your library|a library|your hand|the stack)|\bput into (?:a|your|an opponent's) graveyard\b|\bis put into (?:a|your) graveyard|\bare put into (?:your|a) graveyard", "PutIntoGraveyard")
rule(r"\bleaves? the battlefield|\bleave the battlefield", "LeftBattlefield")
rule(r"\b(?:leave|leaves) (?:your|a|an opponent's|their) graveyards?\b|\bleaves? (?:your )?graveyard", "LeftGraveyard")
rule(r"\b(?:is|are|becomes?) (?:put into exile|exiled)|\bexiles? (?:one or more|a|an|~|it|cards?)|\bput into exile\b|\bexile one or more", "Exiled")
rule(r"\b(?:is|are) returned to (?:your|its owner's|their owners'?) hands?|\breturns? to (?:your|its owner's) hand", "ReturnedToHand")
rule(r"\b(?:is turned|turns?|is turned) face up|\bturned face up", "TurnedFaceUp")
rule(r"\bis turned face down|\bturns? face down", "TurnedFaceDown")
rule(r"\b(?:enters|enter|entered)\b(?: the battlefield)?|\bis put onto the battlefield|\bare put onto the battlefield", "PermanentEntered")
rule(r"\bplays? a land|\bplay (?:a|your first|your second) land|\bplays? (?:one or more )?lands?\b", "LandPlayed")
# --- casting / stack ---
rule(r"\bcopy (?:a|an|that|target) (?:spell|instant|sorcery)|\bcopies (?:a|an) |\bcopy a spell|\bspell is copied|\bcopy one or more", "SpellCopied")
rule(r"\b(?:casts?|cast)\b", "SpellCast")
rule(r"\bis countered|\bcounters? (?:a|an|target) spell|\bspell is countered", "SpellCountered")
rule(r"\b(?:activates?|activate|activated)\b", "AbilityActivated")
rule(r"\bresolves?\b", "SpellResolved")
rule(r"\bcrews?\b|\bbecomes? crewed", "Crewed")
rule(r"\bsaddles?\b|\bbecomes? saddled", "Saddled")
rule(r"\bstations?\b", "Stationed")
# --- life ---
rule(r"\bgains? life|\bgain life|\bgains? (?:\d+|one|two|three|x) or more life|\bgain (?:\d+|one or more)|\bgained life", "LifeGained")
rule(r"\bpays? (?:\d+ )?life|\bpay life", "LifePaid")
rule(r"\b(?:loses?|lose|lost) (?:\d+ or more )?life|\bloses? (?:the|their) (?:first|last)", "LifeLost")
rule(r"\bloses? the game|\bleaves the game|\blose the game", "PlayerLost")
rule(r"\bwins? the game", "PlayerWon")
# --- cards ---
rule(r"\bcycles? or discards?|\bcycle or discard", "Cycled|Discarded")
rule(r"\b(?:cycles?|cycle|cycled)\b", "Cycled")
rule(r"\bdiscards?\b|\bdiscard\b|\bis discarded|\bdiscarded\b", "Discarded")
rule(r"\b(?:draws?|draw|drawn)\b", "CardDrawn")
rule(r"\bmills?\b|\bmill\b|\bmilled\b", "Milled")
rule(r"\bsearch(?:es)? (?:a |your |their |that player's )?library|\bsearches\b", "LibrarySearched")
rule(r"\bshuffles?\b", "LibraryShuffled")
rule(r"\bscry\b|\bscries\b", "Scried")
rule(r"\bsurveils?\b", "Surveilled")
rule(r"\breveals?\b|\bis revealed", "Revealed")
rule(r"\bforetells?\b", "Foretold")
rule(r"\bplots?\b|\bbecomes? plotted", "Plotted")
rule(r"\bexplores?\b", "Explored")
rule(r"\bconnives?\b", "Connived")
rule(r"\bdiscovers?\b", "Discovered")
rule(r"\bcollects? evidence|\bcollect evidence", "EvidenceCollected")
rule(r"\bforages?\b", "Foraged")
rule(r"\bmanifests? dread|\bmanifests?\b|\bcloaks?\b", "Manifested")
rule(r"\binvestigates?\b", "Investigated")
# --- permanents state ---
rule(r"\bsacrifices?\b|\bsacrifice\b|\bis sacrificed|\bsacrificed\b", "Sacrificed")
rule(r"\bis destroyed|\bare destroyed|\bdestroys?\b", "Destroyed")
rule(r"\b(?:becomes?|become) the target|\bbecomes? a target|\btargets\b", "BecameTarget")
rule(r"\b(?:is tapped for mana|tap(?:s|ped)? (?:a|an|~|it|that|one or more)?[\w\s\-]* for mana)", "TappedForMana")
rule(r"\b(?:becomes?|become) untapped|\buntaps?\b|\buntap\b", "Untapped")
rule(r"\b(?:becomes?|become) tapped|\btaps?\b|\btap\b|\bis tapped", "Tapped")
rule(r"\badds? (?:one or more )?mana|\badd mana|\bmana is added|\bmana is spent|\bspend(?:s)? mana|\bexpends?\b|\bspend\b", "ManaProduced/Spent")
rule(r"\b(?:one or more )?(?:[+\-]\d/[+\-]\d |\w+ )?counters? (?:is|are) (?:put|placed) on|\bputs? (?:one or more |a |an |\w+ )?(?:[+\-]\d/[+\-]\d |\w+ )?counters? on|\bput (?:one or more |a |an |\w+ )?(?:[+\-]\d/[+\-]\d |\w+ )?counters? on", "CountersPut")
rule(r"\b(?:counters? (?:is|are) removed|removes? (?:one or more |a |an |the last |\w+ )?(?:[+\-]\d/[+\-]\d |\w+ )?counters?|last \w+ counter is removed)", "CountersRemoved")
rule(r"\bproliferates?\b", "Proliferated")
rule(r"\bcreates? (?:one or more |a |an |\w+ )?(?:[\w\s/+\-]*?)?tokens?|\bcreate (?:one or more |a |an )?(?:[\w\s/+\-]*?)?tokens?|\btokens? (?:is|are) created", "TokenCreated")
rule(r"\btransforms?\b|\bconverts?\b", "Transformed")
rule(r"\bbecomes? monstrous", "BecameMonstrous")
rule(r"\bbecomes? renowned", "BecameRenowned")
rule(r"\bexerts?\b", "Exerted")
rule(r"\bmutates?\b", "Mutated")
rule(r"\bevolves?\b", "Evolved")
rule(r"\b(?:becomes?|become) attached|\bbecomes? enchanted|\bbecomes? equipped|\battaches?\b|\bequips?\b", "Attached")
rule(r"\bbecomes? unattached|\bunattach", "Unattached")
rule(r"\b(?:gains?|gain|takes?) control|\bcontrol of [^,]* changes|\bgains? control|\bloses? control", "ControlChanged")
rule(r"\bphases? (?:in|out)\b", "Phased")
rule(r"\bbecomes? (?:a|an) (?:\w+ )?(?:creature|artifact)\b", "BecameType")
rule(r"\b(?:becomes|become) the monarch|\bis the monarch", "BecameMonarch")
rule(r"\btakes? the initiative|\bhave the initiative", "InitiativeTaken")
rule(r"\bventures? into the dungeon|\bcompletes? a dungeon|\bcomplete a dungeon", "VenturedOrDungeon")
rule(r"\bring tempts you", "RingTempted")
rule(r"\bcommits? a crime|\bcommit a crime", "CrimeCommitted")
rule(r"\b(?:unlocks?|unlock) (?:a |this |~ )?door|\bfully unlock|\bunlocks?\b", "DoorUnlocked")
rule(r"\b(?:becomes|reaches) level|\blevel \d", "ClassLevelGained")
rule(r"\bsolved?\b|\bsolves?\b", "CaseSolved")
rule(r"\bdescends?\b|\bdescended\b", "Descended")
rule(r"\bgives? a gift|\bgift\b", "GiftGiven")
rule(r"\btrains?\b", "Trained")
rule(r"\bflips? (?:a |one or more )?coins?|\bwins? (?:a|the) (?:coin )?flip|\bloses? a (?:coin )?flip", "CoinFlipped")
rule(r"\brolls? (?:a |one or more |the planar )?d(?:ie|ice)|\broll (?:a |one or more )?d(?:ie|ice)|\brolls?\b", "DieRolled")
rule(r"\bvotes?\b|\bvoting\b", "Voted")
rule(r"\bplaneswalks?\b|\bchaos ensues", "Planechase")
rule(r"\b(?:it|day|night) becomes (?:day|night)|\bbecomes? (?:day|night)", "DayNightChanged")
rule(r"\bclash(?:es)?\b", "Clashed")
rule(r"\bbecomes? the target", "BecameTarget")
rule(r"\b(?:sets?|set) (?:a |an )?(?:scheme )?in motion", "SchemeSetInMotion")
rule(r"\bspecializes?\b", "Specialized")
rule(r"\bopens? an attraction|\bvisit|\bclaim the prize|\broll to visit", "Attraction")
rule(r"\bcrank|\bsticker", "UnfinityMisc")
rule(r"\bseek\b|\bperpetually\b|\bconjure", "DigitalOnly")
rule(r"\bbecomes? (?:\w+ )?(?:power|toughness)|\bpower (?:becomes|is)", "PTChanged")
rule(r"\bgains? (?:flying|haste|trample|an ability|indestructible|hexproof|deathtouch|lifelink|first strike|double strike|menace|vigilance|reach)|\bloses? (?:flying|all abilities)", "AbilityGained")
rule(r"\bmoves? (?:a|one or more|\w+) counters?", "CountersMoved")
rule(r"\bbecomes? (?:a |an )?(?:copy|blocked|the|untapped|tapped|monstrous|attached)", "BecameOther")
rule(r"\b(?:has|have|had) (?:flying|\d+ or (?:less|more) life)|\bcontrols? (?:a|an|no|\w+ or more) |\bare on the battlefield|\bis on the battlefield|\bisn't the most common|\bhave (?:\d+|ten|seven) or less life|\bhas (?:\d+|ten) or less life", "StateTrigger")
rule(r"\bhas no cards in hand|\bhave no cards in hand|\bno cards in (?:your|their) hand", "StateTrigger(hand)")
rule(r"\bthere are no|\bcontrols? no |\byou control no |\bhas (?:\d+|seven|ten|twenty) or (?:more|fewer)|\bhave (?:\d+|seven|ten|twenty) or (?:more|fewer)|\bhas no\b|\bhave no\b|\bcontrol (?:\w+ or more|no)|\b(?:is|has) (?:\w+ )?(?:life|loyalty|power|toughness)", "StateTrigger")
rule(r"\bchapter ability|\blore counter", "SagaChapter")


def classify_phase(c):
    """c: lower-cased condition text starting with 'at '."""
    if not c.startswith("at "):
        return None
    if re.match(r"at end of combat|at the end of (?:the first )?combat", c):
        return "PhaseStarted(end_of_combat)"
    if re.match(r"at (?:the )?end of (?:the |each |your |that )?turn", c):
        return "PhaseStarted(end)"
    m = re.match(r"at the beginning of (.*)", c)
    if not m:
        return None
    rest = m.group(1)
    rest = re.sub(r"\b(?:or|and) (?:the |each )?beginning of\b", " and ", rest)
    found = []
    for pat, step in STEP_MAP:
        if re.search(pat, rest):
            found.append(step)
            rest = re.sub(pat, " ", rest, count=1)
    if not found:
        return None
    # e.g. "your upkeep and the beginning of your draw step" -> keep unique order
    if len(found) > 1 and "turn" in found:
        found.remove("turn")
    seen = []
    for f in found:
        if f == "main2" and "main" in seen:
            continue
        if f not in seen:
            seen.append(f)
    return "|".join("PhaseStarted(%s)" % s for s in seen)


def classify(cond_lower):
    c = cond_lower
    ph = classify_phase(c)
    if ph:
        return ph
    body = re.sub(r"^(when|whenever|at)\s+", "", c)
    # "while ..." qualifiers are state checks, not events
    body = re.sub(r"\bwhile\b.*$", "", body)
    # intervening-if / "during your turn" qualifiers don't change the event
    consumed = [False] * len(body)
    labels = []
    for rx, ev in R:
        for m in rx.finditer(body):
            if any(consumed[m.start():m.end()]):
                continue
            for k in range(m.start(), m.end()):
                consumed[k] = True
            for e in ev.split("|"):
                if e not in labels:
                    labels.append(e)
            break  # one match per rule is enough
    if not labels:
        if re.match(r"(you do|you don't|they do|that player does|a player does|you can't|you spend|they can't|you pay|a player pays|no one does|you choose|you've|that happens|it does|you've done|you have done)", body):
            return "Reflexive"
        return "UNMATCHED"
    # Reflexive "When you do" etc. sometimes collide; handled above
    # Order-preserving cleanup of nonsense combos
    if "Died" in labels and "DamageDealt" in labels and re.search(r"dealt damage by", body):
        labels.remove("DamageDealt")
    if "CombatDamageToPlayer" in labels and "CombatDamageAny" in labels:
        labels.remove("CombatDamageAny")
    if "TokenCreated" in labels and "PermanentEntered" in labels and re.search(r"tokens? enters?", body):
        labels.remove("TokenCreated")
    if len(labels) > 1:
        for weak in ("StateTrigger", "PTChanged"):
            if weak in labels:
                labels.remove(weak)
    if "BecameTarget" in labels and ("SpellCast" in labels or "AbilityActivated" in labels) \
            and not re.search(r"becomes? the target|become the target", body):
        labels.remove("BecameTarget")
    if "TappedForMana" in labels and "Tapped" in labels:
        labels.remove("Tapped")
    return "|".join(labels)


def subject_filter(cond_lower):
    """Coarse 'whose event' dimension."""
    b = re.sub(r"^(when|whenever|at)\s+", "", cond_lower)
    if b.startswith("the beginning of") or b.startswith("end of") or b.startswith("the end of"):
        if re.search(r"\byour\b", b):
            return "you"
        if re.search(r"\beach opponent|an opponent|opponent's", b):
            return "opponent"
        if re.search(r"\bthe next|\bnext\b", b):
            return "next(delayed)"
        if re.search(r"enchanted player|that player|chosen player|target player", b):
            return "specific_player"
        return "each"
    if re.match(r"(~|it\b|this\b|they\b)", b):
        return "self"
    if re.match(r"(enchanted|equipped|fortified|haunted|paired|exiled|the exiled|the creature it haunts)", b):
        return "attached/linked"
    if re.match(r"another\b|one or more other\b", b):
        return "another"
    if re.match(r"(you|your)\b", b):
        return "you"
    if re.match(r"(an opponent|each opponent|one or more opponents|target opponent|your opponents|opponents)\b", b):
        return "opponent"
    if re.search(r"\byou control\b|\byour\b|\byou own\b", b.split(",")[0]):
        return "yours"
    if re.search(r"\ban opponent controls\b|\bopponents control\b|\byour opponents\b|\ban opponent owns\b", b):
        return "opponents'"
    if re.match(r"(a player|each player|one or more players|any player|that player|chosen player)\b", b):
        return "any_player"
    return "any"


# Effects/conditions that reference hidden zones (library / hand)
HIDDEN_COND = re.compile(r"\b(draws?|drawn|discards?|discarded|search(es)?|shuffles?|mills?|milled|scry|surveils?|reveals?|from (your|a|their|an opponent's) (hand|library)|in (your|their|a player's) hand|cards? in hand|library|hand)\b")
HIDDEN_EFFECT = re.compile(r"\b(draws? (?:a|an|two|three|four|x|that many|cards?|\d)|discards?|search(?:es)? (?:your|their|a|that player's) library|shuffles?|mills?|scry|surveils?|look at the top|reveal the top|reveals? the top|reveals? (?:a|their|that|your) hand|return[^.]* to (?:its owner's|your|their owners'|their) hands?|put [^.]* into (?:your|its owner's|their) hand|from (?:your|their|a|that player's) (?:hand|library)|on (?:the )?(?:top|bottom) of (?:your|its owner's|their|a) library|exile the top|cards? in (?:your|their) hand|into (?:your|its owner's|their) library)\b")


# Keywords whose rules (CR 702) define triggered abilities; mapped to our events.
KEYWORD_TRIGGER_EVENTS = {
    "Prowess": "SpellCast", "Extort": "SpellCast", "Cascade": "SpellCast", "Storm": "SpellCast",
    "Gravestorm": "SpellCast", "Ripple": "SpellCast", "Replicate": "SpellCast", "Conspire": "SpellCast",
    "Casualty": "SpellCast", "Increment": "SpellCast", "Epic": "PhaseStarted(upkeep)",
    "Exalted": "AttackDeclared", "Annihilator": "AttackDeclared", "Battle cry": "AttackDeclared",
    "Myriad": "AttackDeclared", "Melee": "AttackDeclared", "Mentor": "AttackDeclared",
    "Training": "AttackDeclared", "Dethrone": "AttackDeclared", "Mobilize": "AttackDeclared",
    "Firebending": "AttackDeclared", "Enlist": "AttackDeclared", "Flanking": "BecameBlocked",
    "Bushido": "BlockDeclared|BecameBlocked", "Rampage": "BecameBlocked", "Afflict": "BecameBlocked",
    "Provoke": "AttackDeclared", "Decayed": "AttackDeclared", "Frenzy": "AttackerUnblocked",
    "Undying": "Died", "Persist": "Died", "Afterlife": "Died", "Modular": "Died", "Soulshift": "Died",
    "Haunt": "Died", "Recover": "PutIntoGraveyard", "Ward": "BecameTarget",
    "Evolve": "PermanentEntered", "Exploit": "PermanentEntered", "Fabricate": "PermanentEntered",
    "Backup": "PermanentEntered", "Squad": "PermanentEntered", "Living weapon": "PermanentEntered",
    "For Mirrodin!": "PermanentEntered", "Hideaway": "PermanentEntered", "Champion": "PermanentEntered|LeftBattlefield",
    "Soulbond": "PermanentEntered", "Offspring": "PermanentEntered", "Job select": "PermanentEntered",
    "Ravenous": "PermanentEntered", "Bargain": None, "Devour": None, "Amplify": None,
    "Echo": "PhaseStarted(upkeep)", "Cumulative upkeep": "PhaseStarted(upkeep)",
    "Fading": "PhaseStarted(upkeep)", "Vanishing": "PhaseStarted(upkeep)",
    "Suspend": "PhaseStarted(upkeep)|CountersRemoved", "Rebound": "PhaseStarted(upkeep)",
    "Impending": "PhaseStarted(end)", "Dash": "PhaseStarted(end)", "Blitz": "PhaseStarted(end)|Died",
    "Unearth": "PhaseStarted(end)", "Encore": "PhaseStarted(end)", "Warp": "PhaseStarted(end)",
    "Renown": "CombatDamageToPlayer", "Ingest": "CombatDamageToPlayer", "Poisonous": "CombatDamageToPlayer",
    "Toxic": None, "Cipher": "CombatDamageToPlayer", "Madness": "Discarded", "Miracle": "CardDrawn",
    "Start your engines!": "LifeLost", "Daybound": "PhaseStarted(turn)", "Nightbound": "PhaseStarted(turn)",
    "Mutate": None, "Partner": None,
}

COMBAT_KEYWORDS = ["Flying", "Trample", "Deathtouch", "Lifelink", "First strike", "Double strike",
                   "Vigilance", "Menace", "Reach", "Indestructible", "Haste", "Hexproof", "Ward",
                   "Protection", "Infect", "Toxic", "Shroud", "Defender", "Flash", "Prowess",
                   "Annihilator", "Exalted", "Myriad", "Skulk", "Intimidate", "Fear", "Shadow",
                   "Horsemanship", "Landwalk", "Islandwalk", "Swampwalk", "Forestwalk", "Mountainwalk",
                   "Wither", "Bushido", "Flanking", "Rampage", "Melee", "Battle cry", "Afflict"]


# --------------------------------------------------------------------------
# CR: keywords whose rule text says "triggered ability"
# --------------------------------------------------------------------------

def cr_triggered_keywords():
    txt = open(CR, encoding="utf-8-sig").read().replace("\r", "")
    out = {}
    blocks = re.split(r"\n(?=702\.\d+\. )", txt)
    for b in blocks:
        m = re.match(r"702\.(\d+)\. (.+)", b)
        if not m or int(m.group(1)) < 2:
            continue
        body = b.split("\n703.")[0]
        out[m.group(2).strip()] = "triggered ability" in body
    return out


# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------

def main():
    cards = load_cards()
    ranked = sorted([c for c in cards if c.get("edhrec_rank")], key=lambda c: c["edhrec_rank"])
    rankpos = {c["oracle_id"]: i + 1 for i, c in enumerate(ranked)}  # position within our set
    top = {n: {c["oracle_id"] for c in ranked[:n]} for n in (1000, 5000)}

    rows = []
    card_has_trig = collections.Counter()
    card_hidden = collections.defaultdict(set)
    for c in cards:
        for x in extract(c):
            cl = x["clause"]
            low = cl.lower()
            ev = classify(low)
            filt = subject_filter(low)
            # step-trigger filter
            hcond = bool(HIDDEN_COND.search(low))
            # ability text for hidden effect check (to end of paragraph/quote)
            heff = bool(HIDDEN_EFFECT.search(x["ability"].lower()))
            rows.append(dict(card=c["name"], oracle_id=c["oracle_id"], edhrec_rank=c.get("edhrec_rank") or "",
                             rank_in_set=rankpos.get(c["oracle_id"], ""),
                             face=x["face"], kind=x["kind"], clause=cl, event=ev, filter=filt,
                             hidden_zone_condition=int(hcond), hidden_zone_effect=int(heff),
                             ability=x["ability"]))
            card_has_trig[(c["oracle_id"], x["kind"])] += 1

    # ---- outputs ----
    with open(f"{OUT}/trigger_clauses.csv", "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["card_name", "edhrec_rank", "rank_in_commander_set", "kind", "clause", "event_type",
                    "filter", "hidden_zone_condition", "hidden_zone_effect"])
        for r in sorted(rows, key=lambda r: (r["edhrec_rank"] or 10**9, r["card"])):
            w.writerow([r["card"], r["edhrec_rank"], r["rank_in_set"], r["kind"], r["clause"], r["event"],
                        r["filter"], r["hidden_zone_condition"], r["hidden_zone_effect"]])

    stats = {"n_cards": len(cards), "n_ranked": len(ranked)}
    def scope_rows(scope, kinds):
        out = []
        for r in rows:
            if r["kind"] not in kinds:
                continue
            if scope == "all" or r["oracle_id"] in top[scope]:
                out.append(r)
        return out

    MAIN_KINDS = ("printed", "granted")
    ALL_KINDS = ("printed", "granted", "delayed_or_reflexive")
    for scope in ("all", 5000, 1000):
        key = str(scope)
        sr = scope_rows(scope, MAIN_KINDS)
        ar = scope_rows(scope, ALL_KINDS)
        ncards_scope = len(cards) if scope == "all" else scope
        trig_cards = {r["oracle_id"] for r in sr}
        ev_counts = collections.Counter()
        base_counts = collections.Counter()
        ev_cards = collections.defaultdict(set)
        for r in sr:
            for e in r["event"].split("|"):
                ev_counts[e] += 1
                base_counts[re.sub(r"\(.*\)", "", e)] += 1
                ev_cards[e].add(r["oracle_id"])
        kinds = collections.Counter(r["kind"] for r in ar)
        delayed = collections.Counter()
        for r in ar:
            if r["kind"] == "delayed_or_reflexive":
                for e in r["event"].split("|"):
                    delayed[e] += 1
        unmatched = [r for r in sr if r["event"] == "UNMATCHED"]
        filt = collections.defaultdict(collections.Counter)
        for r in sr:
            for e in r["event"].split("|"):
                filt[e][r["filter"]] += 1
        stats[key] = dict(
            n_cards=ncards_scope, n_cards_with_trigger=len(trig_cards), n_clauses=len(sr),
            kinds=dict(kinds), event_counts=ev_counts.most_common(), base_event_counts=base_counts.most_common(),
            event_card_counts={e: len(s) for e, s in ev_cards.items()},
            unmatched=len(unmatched), unmatched_pct=round(100 * len(unmatched) / max(1, len(sr)), 2),
            delayed_event_counts=delayed.most_common(), filters={e: dict(v) for e, v in filt.items()},
        )
        # coverage curve over clauses (a clause is covered only when all its labels are in the set)
        for label_kind, counter in (("event", ev_counts), ("base", base_counts)):
            order = [e for e, _ in counter.most_common()]
            curve = []
            chosen = set()
            for i, e in enumerate(order):
                chosen.add(e)
                cov = 0
                for r in sr:
                    labs = r["event"].split("|")
                    if label_kind == "base":
                        labs = [re.sub(r"\(.*\)", "", l) for l in labs]
                    if all(l in chosen for l in labs):
                        cov += 1
                curve.append((i + 1, e, round(100 * cov / max(1, len(sr)), 2)))
            stats[key]["curve_" + label_kind] = curve
        # hidden zones (cards)
        hc = {r["oracle_id"] for r in sr if r["hidden_zone_condition"]}
        he = {r["oracle_id"] for r in sr if r["hidden_zone_effect"]}
        stats[key]["hidden_cond_cards"] = len(hc)
        stats[key]["hidden_effect_cards"] = len(he)
        stats[key]["hidden_any_cards"] = len(hc | he)
        stats[key]["hidden_cond_clauses"] = sum(r["hidden_zone_condition"] for r in sr)
        stats[key]["hidden_effect_clauses"] = sum(r["hidden_zone_effect"] for r in sr)

    # examples per event (most popular cards first)
    ex = collections.defaultdict(list)
    for r in sorted(rows, key=lambda r: r["edhrec_rank"] or 10**9):
        if r["kind"] not in MAIN_KINDS:
            continue
        for e in r["event"].split("|"):
            if len(ex[e]) < 3 and r["card"] not in ex[e]:
                ex[e].append(r["card"])
    stats["examples"] = ex

    # unmatched long tail
    with open(f"{OUT}/unmatched.txt", "w", encoding="utf-8") as fh:
        um = [r for r in rows if r["event"] == "UNMATCHED" and r["kind"] in MAIN_KINDS]
        um.sort(key=lambda r: r["edhrec_rank"] or 10**9)
        for r in um:
            fh.write(f"{r['edhrec_rank']}\t{r['card']}\t{r['clause']}\n")

    # keyword frequencies on top-1000 / top-5000 / all
    kw = {}
    for scope in (1000, 5000, "all"):
        pool = cards if scope == "all" else [c for c in cards if c["oracle_id"] in top[scope]]
        cnt = collections.Counter()
        grant = collections.Counter()
        for c in pool:
            ks = set(c.get("keywords") or [])
            text = " ".join(strip_reminder(t) for _, t, _ in faces(c)).lower()
            for k in COMBAT_KEYWORDS:
                if k in ks:
                    cnt[k] += 1
                elif re.search(r"\b" + re.escape(k.lower()) + r"\b", text):
                    grant[k] += 1
        kw[str(scope)] = {k: [cnt[k], grant[k]] for k in COMBAT_KEYWORDS}
    stats["keywords"] = kw

    # keyword-implied triggers (reminder-text triggers that our clause extraction can't see)
    crk = cr_triggered_keywords()
    stats["cr_triggered_keywords"] = sorted(k for k, v in crk.items() if v)
    kt = {}
    for scope in (1000, 5000, "all"):
        pool = cards if scope == "all" else [c for c in cards if c["oracle_id"] in top[scope]]
        cnt = collections.Counter()
        for c in pool:
            for k in set(c.get("keywords") or []):
                if k in KEYWORD_TRIGGER_EVENTS and KEYWORD_TRIGGER_EVENTS[k]:
                    cnt[k] += 1
        kt[str(scope)] = cnt.most_common()
    stats["keyword_triggers"] = kt
    stats["keyword_trigger_events"] = KEYWORD_TRIGGER_EVENTS

    # saga cards (chapter abilities are triggered but don't start with When/Whenever/At)
    stats["saga_cards"] = {str(s): sum(1 for c in (cards if s == "all" else [c for c in cards if c["oracle_id"] in top[s]])
                                       if "Saga" in (c.get("type_line") or "")) for s in (1000, 5000, "all")}

    # cards with any trigger (incl. keyword-implied + saga)
    def any_trig(c):
        if any(r for r in []):
            return True
        return False

    with open(f"{OUT}/stats.json", "w", encoding="utf-8") as fh:
        json.dump(stats, fh, indent=1, default=list)
    s = stats["all"]
    print("cards", stats["n_cards"], "ranked", stats["n_ranked"])
    for k in ("all", "5000", "1000"):
        print(k, "cards_with_trig", stats[k]["n_cards_with_trigger"], "clauses", stats[k]["n_clauses"],
              "unmatched", stats[k]["unmatched"], stats[k]["unmatched_pct"], "%", stats[k]["kinds"])


if __name__ == "__main__":
    SRC, CR, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
    main()
