import { Command } from 'commander';
import { gameCommand } from './commands/game.js';
import { startCommand } from './commands/start.js';

const program = new Command()
  .name('stx')
  .description('On The Stack repo CLI')
  .version('0.1.0');

program.addCommand(startCommand);
program.addCommand(gameCommand);

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
