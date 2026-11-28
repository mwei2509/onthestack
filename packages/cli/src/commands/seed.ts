import { Command } from 'commander';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { worktreeRoot } from '../utils/git.js';

/** Runs the seed script of the checkout `stx` was called from, so each worktree saves and loads its own state (ADR 0143). */
function runSeed(args: string[]): never {
  const r = spawnSync('node', [join(worktreeRoot(), 'packages/server/scripts/seed.mjs'), ...args], { stdio: 'inherit' });
  process.exit(r.status ?? 1);
}

export const seedCommand = new Command('seed').description("This checkout's local seed: Decks and test games (ADR 0143)");

seedCommand
  .command('save')
  .description("Write every local Deck to packages/server/seed/local.json, keeping the seed's games and adding or refreshing the named ones")
  .argument('[games...]', 'game codes to add or refresh from this checkout')
  .option('--only', "keep only the named games, dropping the seed's others")
  .action((games: string[], opts: { only?: boolean }) => runSeed(['save', ...(opts.only ? ['--only'] : []), ...games]));

seedCommand
  .command('load')
  .description("Load the seed into this checkout, replacing the Decks and games it holds")
  .action(() => runSeed(['load']));
