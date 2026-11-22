# Zone changes name their reason with Arena's categories

Status: Accepted (decided with Melissa, 2026-11-21, after reading her Arena game log).

Amends ADR 0021. `ZoneChanged.how` uses the categories Arena's own engine attaches to every zone transfer (`docs/research/arena-log-observations.md`): `castSpell`, `resolve`, `draw`, `playLand`, `exile`, `destroy`, `sacrifice`, `surveil`, `mill`, `return`, `put`, `warp`, `countered`, plus ours that Arena expresses differently: `stateBased`, `token` and `fizzled`. ADR 0021's `how: 'play'` for land drops becomes `playLand`. A tested, real-world vocabulary beats inventing our own, and it gives triggers and the readback a precise reason for every move.
