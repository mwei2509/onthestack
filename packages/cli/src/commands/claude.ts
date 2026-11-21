import { Command } from 'commander';
import { exec } from '../utils/proc.js';
import { worktreeRoot } from '../utils/git.js';
import { dim } from '../utils/color.js';
import { tintTabUntilExit } from '../utils/tabColor.js';

/**
 * Launch Claude Code at the repo root with the permission mode picked by a short
 * flag, so the long `--dangerously-skip-permissions` isn't something to remember
 * or retype. The root is the current checkout's toplevel, so from inside a
 * worktree this starts in that worktree.
 *
 * Unrecognised flags and any trailing prompt are handed to Claude untouched:
 *   stx claude -o
 *   stx claude -e "fix the failing test"
 *   stx claude --resume
 */
export const claudeCommand = new Command('claude')
  .description('Launch Claude Code at the repo root, tinting the tab')
  .option(
    '-o, --override',
    'skip all permission prompts (--dangerously-skip-permissions)',
  )
  .option(
    '-e, --edits',
    'auto-accept file edits (--permission-mode acceptEdits)',
  )
  .argument('[args...]', 'arguments passed straight through to `claude`')
  .allowUnknownOption()
  .passThroughOptions()
  .action((args: string[], opts: { override?: boolean; edits?: boolean }) => {
    if (opts.override && opts.edits) {
      console.error(
        'stx claude: -o and -e set different permission modes; pick one.',
      );
      process.exit(1);
    }

    const root = worktreeRoot();
    const flags: string[] = [];
    if (opts.override) flags.push('--dangerously-skip-permissions');
    if (opts.edits) flags.push('--permission-mode', 'acceptEdits');

    console.log(dim(`▶ claude ${[...flags, ...args].join(' ')} (in ${root})`));
    tintTabUntilExit('purple');
    process.exit(exec('claude', [...flags, ...args], root));
  });
