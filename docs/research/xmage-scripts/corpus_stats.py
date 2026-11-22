"""Whole-corpus stats for XMage card files and its reusable library.

Usage: python3 -I corpus_stats.py <mage repo root>
Prints: share of card files with helper classes; library class counts by package; most common
triggered-ability and effect classes across all cards (to compare with our Translation schema).
"""
import collections
import os
import re
import sys

root = sys.argv[1]
cards_root = os.path.join(root, 'Mage.Sets', 'src', 'mage', 'cards')
lib_root = os.path.join(root, 'Mage', 'src', 'main', 'java', 'mage')
CLASS_RE = re.compile(r'^\s*(?:(?:public|private|protected|static|final|abstract)\s+)*(?:class|enum)\s+(\w+)', re.M)
ANON_RE = re.compile(r'new\s+\w+(?:<[^>]*>)?\s*\([^;{}]*\)\s*\{')
NEW_RE = re.compile(r'new\s+(\w+)\s*[(<]')

pkg = collections.Counter()
library = set()
for dirpath, _, files in os.walk(lib_root):
    rel = os.path.relpath(dirpath, lib_root)
    for f in files:
        if f.endswith('.java'):
            library.add(f[:-5])
            pkg[rel] += 1

total = helper = anon = 0
use = collections.Counter()
for dirpath, _, files in os.walk(cards_root):
    for f in files:
        if not f.endswith('.java'):
            continue
        total += 1
        body = open(os.path.join(dirpath, f), encoding='utf-8').read()
        body = re.sub(r'/\*.*?\*/', '', body, flags=re.S)
        body = re.sub(r'//[^\n]*', '', body)
        classes = CLASS_RE.findall(body)
        if len(classes) > 1:
            helper += 1
        elif ANON_RE.search(body):
            anon += 1
        for u in set(NEW_RE.findall(body)):
            if u in library:
                use[u] += 1

print(f'card files: {total}; with helper classes: {helper} ({helper / total:.1%}); anonymous only: {anon} ({anon / total:.1%})')
print('library packages (classes):')
for k in ['abilities/effects/common', 'abilities/effects/common/continuous', 'abilities/effects/common/counter',
          'abilities/common', 'abilities/keyword', 'abilities/condition/common', 'abilities/costs/common',
          'abilities/dynamicvalue/common', 'filter/predicate/permanent', 'filter/predicate/mageobject', 'filter/common',
          'target/common', 'watchers/common']:
    print(f'  {k}: {pkg.get(k, 0)}')
for suffix in ['TriggeredAbility', 'Effect', 'Condition']:
    top = [(k, n) for k, n in use.most_common() if k.endswith(suffix)][:30]
    print(f'top {suffix}:', ', '.join(f'{k}:{n}' for k, n in top))
