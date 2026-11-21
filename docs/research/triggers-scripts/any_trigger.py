#!/usr/bin/env python3
"""Cards with any triggered ability: printed clause, keyword-implied (reminder-text) trigger, or Saga chapter.
Usage: python3 -I any_trigger.py <oracle-cards.jsonl.gz> <trigger_clauses.csv>"""
import csv, sys, os
sys.path.insert(0, os.path.dirname(__file__))
import analyze as A
cards = A.load_cards(sys.argv[1])
ranked = sorted([c for c in cards if c.get("edhrec_rank")], key=lambda c: c["edhrec_rank"])
top = {n: {c["name"] for c in ranked[:n]} for n in (1000, 5000)}
rows = list(csv.DictReader(open(sys.argv[2])))
printed = {r["card_name"] for r in rows if r["kind"] == "printed"}
pg = {r["card_name"] for r in rows if r["kind"] in ("printed", "granted")}
kw = {c["name"] for c in cards if any(A.KEYWORD_TRIGGER_EVENTS.get(k) for k in (c.get("keywords") or []))}
saga = {c["name"] for c in cards if "Saga" in (c.get("type_line") or "")}
for scope in ("all", 5000, 1000):
    pool = {c["name"] for c in cards} if scope == "all" else top[scope]
    n = len(pool)
    f = lambda s: f"{len(s & pool)} ({100*len(s & pool)/n:.1f}%)"
    print(scope, "printed", f(printed), "printed+granted", f(pg), "kw-only extra", len((kw - pg) & pool),
          "saga-only extra", len((saga - pg - kw) & pool), "any", f(pg | kw | saga))
