const off = !!process.env.NO_COLOR || process.env.CI === 'true';
const c = (code: number) => (s: string) => (off ? s : `\x1b[${code}m${s}\x1b[0m`);

export const dim = c(2);
