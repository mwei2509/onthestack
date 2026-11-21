# Docs and agent context vs. code

Applies to `CLAUDE.md` files, `.claude/` rules and skills, and READMEs.

## Point to code; don't restate it

- If a fact is defined in code or config (version pins, package lists, script names, ports, workflow triggers), reference the file that defines it instead of copying the value. Write "root `package.json` `engines.node`", not the version number.
- Docs should carry what code can't express: why something is the way it is, gotchas, and conventions.
- When a value must exist in more than one place, prefer making one consumer read the other (e.g. CI `node-version-file:`) over adding a copy.
- Before adding a doc statement about the repo, verify it against the code. Don't carry forward claims from other docs unchecked.

## Intentional mirrors: keep in sync

Some duplication is kept because it saves agents exploration. When you change the source on the left, update the mirror on the right in the same change. When you add a new mirror, add a row here.

| Source of truth | Mirrors |
| --- | --- |
| `pnpm-workspace.yaml` `packages` + top-level package dirs | Root `CLAUDE.md` "Status" line |
| `packages/cli/src/commands/*` and root `package.json` `scripts` | Root `CLAUDE.md` "Dev CLI" table |
| `docs/adr/` decisions (and the proposal where no ADR overrides it) | Root `CLAUDE.md` "Non-negotiable principles" |

When a doc and the code disagree, the code wins: fix the doc as part of the current change, or tell the user if it's out of scope.
