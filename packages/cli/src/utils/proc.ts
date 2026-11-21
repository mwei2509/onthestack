import { spawnSync } from 'node:child_process';

export function exec(
  cmd: string,
  args: string[],
  cwd: string,
  env?: Record<string, string>,
): number {
  const result = spawnSync(cmd, args, {
    stdio: 'inherit',
    cwd,
    env: { ...process.env, ...env },
  });
  if (result.error) {
    console.error(result.error.message);
    return 1;
  }
  return result.status ?? 0;
}
