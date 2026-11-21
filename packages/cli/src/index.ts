import { Command } from 'commander';
import { claudeCommand } from './commands/claude.js';
import { worktreeCommand } from './commands/worktree.js';
import { shellInitCommand } from './commands/shellInit.js';
import { startCommand } from './commands/start.js';

const program = new Command()
  .name('stx')
  .description('On The Stack repo CLI')
  .version('0.1.0')
  // Required so `stx claude` can pass its own flags (-r, --resume, …) through
  // to Claude Code untouched; `stx`'s own options have to precede the
  // subcommand.
  .enablePositionalOptions();

program.addCommand(claudeCommand);
program.addCommand(worktreeCommand);
program.addCommand(shellInitCommand);
program.addCommand(startCommand);

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
