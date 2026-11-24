const BROWSERS: [RegExp, string][] = [
  [/Edg\//, 'Edge'],
  [/SamsungBrowser\//, 'Samsung Internet'],
  [/Firefox\/|FxiOS\//, 'Firefox'],
  [/Chrome\/|CriOS\//, 'Chrome'],
  [/Safari\//, 'Safari'],
];

const DEVICES: [RegExp, string][] = [
  [/iPhone/, 'iPhone'],
  [/iPad/, 'iPad'],
  [/Android/, 'Android'],
  [/CrOS/, 'ChromeOS'],
  [/Macintosh/, 'Mac'],
  [/Windows/, 'Windows'],
  [/Linux/, 'Linux'],
];

/** "Safari on iPhone": how the account page tells passkeys apart (ADR 0105). */
export function deviceLabel(userAgent: string | null): string {
  const ua = userAgent ?? '';
  const browser = BROWSERS.find(([pattern]) => pattern.test(ua))?.[1];
  const device = DEVICES.find(([pattern]) => pattern.test(ua))?.[1];
  if (browser && device) return `${browser} on ${device}`;
  return browser ?? device ?? 'Passkey';
}
