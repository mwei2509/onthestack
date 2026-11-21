import { execFileSync } from 'node:child_process';

export type TabColor = 'purple';

const RGB: Record<TabColor, { r: number; g: number; b: number }> = {
  // Blue violet — an agent session is doing something to the tree.
  purple: { r: 138, g: 43, b: 226 },
};

const off = !!process.env.NO_COLOR || process.env.CI === 'true';

export function setTabColor(color: TabColor): void {
  if (off) return;
  const term = process.env.TERM_PROGRAM;

  if (term === 'iTerm.app') {
    const { r, g, b } = RGB[color];
    process.stdout.write(`\x1b]6;1;bg;red;brightness;${r}\x07`);
    process.stdout.write(`\x1b]6;1;bg;green;brightness;${g}\x07`);
    process.stdout.write(`\x1b]6;1;bg;blue;brightness;${b}\x07`);
    return;
  }

  if (term === 'Apple_Terminal') {
    const { r, g, b } = RGB[color];
    const script = `tell application "Terminal" to set background color of selected tab of window 1 to {${r * 257}, ${g * 257}, ${b * 257}, 0}`;
    try {
      execFileSync('osascript', ['-e', script], { stdio: 'ignore' });
    } catch {
      // terminal not scriptable — silently ignore
    }
  }
}

export function resetTabColor(): void {
  if (off) return;
  const term = process.env.TERM_PROGRAM;

  if (term === 'iTerm.app') {
    process.stdout.write('\x1b]6;1;bg;*;default\x07');
    return;
  }

  if (term === 'Apple_Terminal') {
    const script =
      'tell application "Terminal" to set background color of selected tab of window 1 to (background color of (default settings))';
    try {
      execFileSync('osascript', ['-e', script], { stdio: 'ignore' });
    } catch {
      // ignore
    }
  }
}

export function tintTabUntilExit(color: TabColor): void {
  setTabColor(color);
  process.on('exit', resetTabColor);
}
