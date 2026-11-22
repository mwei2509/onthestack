"""Upper-bound proxy for how many sampled cards an XMage->Translation converter could handle.

Usage: python3 -I coverage_proxy.py <sample.csv> <mage repo root>

A card counts as "convertible" when it has no helper classes and every trigger/effect/condition class it
references is in a whitelist of the K most-used such classes across all XMage cards (filters, targets,
costs, keywords and mana abilities are assumed mappable). Prints the share for several K.
"""
import collections
import csv
import os
import re
import sys

sample_csv, root = sys.argv[1], sys.argv[2]
cards_root = os.path.join(root, 'Mage.Sets', 'src', 'mage', 'cards')
NEW_RE = re.compile(r'new\s+(\w+)\s*[(<]')

use = collections.Counter()
for dirpath, _, files in os.walk(cards_root):
    for f in files:
        if f.endswith('.java'):
            body = open(os.path.join(dirpath, f), encoding='utf-8').read()
            use.update(set(NEW_RE.findall(body)))


def ranked(suffix):
    return [k for k, _ in use.most_common() if k.endswith(suffix)]


triggers, effects, conds = ranked('TriggeredAbility'), ranked('Effect'), ranked('Condition')
rows = [r for r in csv.DictReader(open(sample_csv, encoding='utf-8')) if r['found'] == 'True']
for label in sorted({r['sample'] for r in rows}):
    rs = [r for r in rows if r['sample'] == label and 'Land' not in r['type_line']]
    has_trigger = [r for r in rs if 'TriggeredAbility' in r['library_classes'] or 'TriggeredAbility' in r['extra_classes']]
    print(f'{label}: nonland={len(rs)}, with triggered abilities={len(has_trigger)}')
    for k in (20, 40, 80, 160):
        wl = set(triggers[:k]) | set(effects[:2 * k]) | set(conds[:k // 2])
        ok = 0
        trig_ok = 0
        for r in rs:
            classes = r['library_classes'].split()
            relevant = [c for c in classes if c.endswith(('TriggeredAbility', 'Effect', 'Condition'))]
            if r['category'] == 'pure_library' and all(c in wl for c in relevant):
                ok += 1
        for r in has_trigger:
            t = [c for c in r['library_classes'].split() if c.endswith('TriggeredAbility')]
            if r['category'] == 'pure_library' and t and all(c in wl for c in t):
                trig_ok += 1
        print(f'  K={k:>3} (triggers {k}, effects {2 * k}, conditions {k // 2}): whole card {ok / len(rs):.0%}; '
              f'trigger condition only {trig_ok / max(1, len(has_trigger)):.0%}')
