import json, sys
s = json.load(open(sys.argv[1]))
for k in ("all", "5000", "1000"):
    d = s[k]
    print("=== scope", k, "cards", d["n_cards"], "with trig", d["n_cards_with_trigger"], "clauses", d["n_clauses"], "unmatched", d["unmatched"], d["unmatched_pct"])
    print("kinds", d["kinds"])
    print("events", d["event_counts"][:70])
    print("base", d["base_event_counts"][:40])
    print("curve_event", [(n, e, p) for n, e, p in d["curve_event"][:40]])
    print("curve_base", [(n, e, p) for n, e, p in d["curve_base"][:30]])
    print("hidden cond cards", d["hidden_cond_cards"], "effect cards", d["hidden_effect_cards"], "any", d["hidden_any_cards"], "clauses cond/effect", d["hidden_cond_clauses"], d["hidden_effect_clauses"])
    print("delayed", d["delayed_event_counts"][:15])
print("keywords", json.dumps(s["keywords"]))
print("kwtrig", json.dumps(s["keyword_triggers"]))
print("saga", s["saga_cards"])
print("cr trig kws", s["cr_triggered_keywords"])
