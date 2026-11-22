"""Sample popular Commander cards (Scryfall edhrec_rank) and classify their XMage implementations.

Usage: python3 -I sample_cards.py <oc.jsonl.gz> <mage repo root> <out dir>

For each sampled card, finds Mage.Sets/src/mage/cards/<x>/<ClassName>.java and records:
- extra_classes: inner/top-level helper classes beyond the card class (custom effects, triggers, watchers)
- anonymous: anonymous class bodies (new Foo(...) { ... })
- lambdas: '->' occurrences (inline predicates/conditions)
- abilities / effects / triggers / costs / conditions / filters: library class names referenced
Writes sample.csv and summary.json to <out dir>.
"""
import collections
import csv
import gzip
import json
import os
import random
import re
import sys
import unicodedata

oc_path, mage_root, out_dir = sys.argv[1], sys.argv[2], sys.argv[3]
cards_root = os.path.join(mage_root, 'Mage.Sets', 'src', 'mage', 'cards')
lib_root = os.path.join(mage_root, 'Mage', 'src', 'main', 'java', 'mage')

# Index of library class names (anything defined under Mage/src/main/java/mage).
library = set()
for dirpath, _, files in os.walk(lib_root):
    for f in files:
        if f.endswith('.java'):
            library.add(f[:-5])

index = {}
for letter in os.listdir(cards_root):
    d = os.path.join(cards_root, letter)
    if os.path.isdir(d):
        for f in os.listdir(d):
            if f.endswith('.java'):
                index[f[:-5].lower()] = os.path.join(d, f)


def class_name(name: str) -> str:
    name = name.split(' // ')[0]
    name = unicodedata.normalize('NFKD', name).encode('ascii', 'ignore').decode()
    parts = re.split(r"[^A-Za-z0-9']+", name)
    out = ''
    for p in parts:
        p = p.replace("'", '')
        if p:
            out += p[0].upper() + p[1:]
    return out


cards = []
with gzip.open(oc_path, 'rt', encoding='utf-8') as fh:
    for line in fh:
        c = json.loads(line)
        if c.get('legalities', {}).get('commander') != 'legal':
            continue
        if c.get('edhrec_rank') is None:
            continue
        if 'Basic' in c.get('type_line', ''):
            continue
        cards.append(c)
cards.sort(key=lambda c: c['edhrec_rank'])

top = cards[:200]
random.seed(42)
mid = random.sample(cards[200:3000], 200)
samples = {'top200': top, 'rank201_3000_random200': mid}

CLASS_RE = re.compile(r'^\s*(?:(?:public|private|protected|static|final|abstract)\s+)*(?:class|enum)\s+(\w+)', re.M)
ANON_RE = re.compile(r'new\s+\w+(?:<[^>]*>)?\s*\([^;{}]*\)\s*\{')
NEW_RE = re.compile(r'new\s+(\w+)\s*[(<]')
INST_RE = re.compile(r'\b([A-Z]\w+)\.(?:getInstance\(\)|instance\b)')


def kind(n: str) -> str:
    if n.endswith('TriggeredAbility'):
        return 'trigger'
    if n.endswith('Ability'):
        return 'ability'
    if n.endswith('Effect'):
        return 'effect'
    if n.endswith('Cost') or n.endswith('Costs'):
        return 'cost'
    if n.endswith('Condition'):
        return 'condition'
    if n.startswith('Filter') or n.endswith('Predicate') or n.endswith('Predicates'):
        return 'filter'
    if n.startswith('Target'):
        return 'target'
    if n.endswith('Hint') or n.endswith('Value') or n.endswith('Count'):
        return 'value'
    return 'other'


os.makedirs(out_dir, exist_ok=True)
summary = {}
rows = []
for label, sample in samples.items():
    counters = collections.Counter()
    lib_use = collections.Counter()
    custom_kinds = collections.Counter()
    for c in sample:
        cn = class_name(c['name'])
        path = index.get(cn.lower())
        row = {'sample': label, 'rank': c['edhrec_rank'], 'name': c['name'], 'type_line': c.get('type_line', ''),
               'class': cn, 'found': bool(path)}
        if not path:
            counters['not_found'] += 1
            rows.append(row)
            continue
        src = open(path, encoding='utf-8').read()
        body = re.sub(r'/\*.*?\*/', '', src, flags=re.S)
        body = re.sub(r'//[^\n]*', '', body)
        classes = CLASS_RE.findall(body)
        extra = [k for k in classes if k.lower() != cn.lower()]
        anon = len(ANON_RE.findall(body))
        lambdas = body.count('->')
        used = set(NEW_RE.findall(body)) | set(INST_RE.findall(body))
        lib = sorted(u for u in used if u in library)
        for u in lib:
            lib_use[(kind(u), u)] += 1
        for e in extra:
            # what the helper class extends tells us what kind of custom code it is
            m = re.search(r'(?:class|enum)\s+' + re.escape(e) + r'\b([^{]*)\{', body)
            decl = m.group(1) if m else ''
            mm = re.search(r'extends\s+(\w+)', decl) or re.search(r'implements\s+(\w+)', decl)
            base = mm.group(1) if mm else 'none'
            custom_kinds[base] += 1
        if extra:
            cat = 'custom_class'
        elif anon:
            cat = 'anonymous_class'
        elif lambdas:
            cat = 'library_plus_lambda'
        else:
            cat = 'pure_library'
        counters[cat] += 1
        land = 'Land' in c.get('type_line', '')
        counters[('land_' if land else 'nonland_') + cat] += 1
        row.update({'category': cat, 'extra_classes': ' '.join(extra), 'anonymous': anon, 'lambdas': lambdas,
                    'library_classes': ' '.join(lib), 'lines': src.count('\n')})
        rows.append(row)
    summary[label] = {
        'n': len(sample),
        'categories': dict(counters),
        'top_library_classes': [[k[0], k[1], n] for k, n in lib_use.most_common(80)],
        'custom_helper_bases': custom_kinds.most_common(25),
    }

with open(os.path.join(out_dir, 'sample.csv'), 'w', newline='', encoding='utf-8') as fh:
    keys = ['sample', 'rank', 'name', 'type_line', 'class', 'found', 'category', 'extra_classes', 'anonymous', 'lambdas',
            'lines', 'library_classes']
    w = csv.DictWriter(fh, fieldnames=keys)
    w.writeheader()
    for r in rows:
        w.writerow({k: r.get(k, '') for k in keys})
with open(os.path.join(out_dir, 'summary.json'), 'w', encoding='utf-8') as fh:
    json.dump(summary, fh, indent=1)
for label, s in summary.items():
    print(label, s['n'], json.dumps(s['categories']))
    print('  helper bases:', s['custom_helper_bases'][:12])
