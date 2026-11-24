import type { SVGProps } from 'react';

const icon = (props: SVGProps<SVGSVGElement>) => ({
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  ...props,
});

export const Logo = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 26 26" {...icon({ stroke: 'var(--accent)' })}>
    <rect x="7" y="2" width="14" height="18" rx="2.5" />
    <rect x="4" y="5" width="14" height="18" rx="2.5" fill="var(--ink)" />
  </svg>
);

export const Plus = () => (
  <svg width="22" height="22" viewBox="0 0 22 22" {...icon({ strokeWidth: 2.4 })}>
    <path d="M11 4v14M4 11h14" />
  </svg>
);

export const ShareIcon = () => (
  <svg width="18" height="18" viewBox="0 0 20 20" {...icon({})}>
    <path d="M10 13V3M6 7l4-4 4 4M4 11v5a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-5" />
  </svg>
);

export const CopyIcon = () => (
  <svg width="18" height="18" viewBox="0 0 20 20" {...icon({})}>
    <rect x="7" y="7" width="10" height="10" rx="2" />
    <path d="M13 4H5a1 1 0 0 0-1 1v8" />
  </svg>
);

export const EditIcon = () => (
  <svg width="18" height="18" viewBox="0 0 20 20" {...icon({})}>
    <path d="M13.5 3.5l3 3L7 16H4v-3z" />
  </svg>
);

export const ScreenIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 20 20" {...icon({})}>
    <rect x="2" y="4" width="16" height="11" rx="2" />
    <path d="M7 18h6" />
  </svg>
);

export const Grip = () => (
  <svg width="14" height="20" viewBox="0 0 14 20" fill="currentColor" aria-hidden>
    {[4, 10, 16].flatMap((y) => [<circle key={`a${y}`} cx="4" cy={y} r="1.6" />, <circle key={`b${y}`} cx="10" cy={y} r="1.6" />])}
  </svg>
);

export const Arrow = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" {...icon({ stroke: 'var(--text-3)' })}>
    <path d="M3 7h8M8 4l3 3-3 3" />
  </svg>
);

export const Back = () => (
  <svg width="22" height="22" viewBox="0 0 22 22" {...icon({ strokeWidth: 2 })}>
    <path d="M14 5l-6 6 6 6" />
  </svg>
);

export const Forward = () => (
  <svg width="22" height="22" viewBox="0 0 22 22" {...icon({ strokeWidth: 2 })}>
    <path d="M8 5l6 6-6 6" />
  </svg>
);

export const Close = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" {...icon({ strokeWidth: 2 })}>
    <path d="M5 5l10 10M15 5L5 15" />
  </svg>
);

export const SearchIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" {...icon({ stroke: 'var(--text-3)' })}>
    <circle cx="8" cy="8" r="5.5" />
    <path d="M12.2 12.2L16 16" />
  </svg>
);

export const Chevron = ({ open }: { open?: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 18 18" {...icon({ stroke: 'var(--text-3)', strokeWidth: 2 })} style={{ transform: open ? 'rotate(90deg)' : undefined }}>
    <path d="M7 4l5 5-5 5" />
  </svg>
);

export const More = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="var(--text-2)" aria-hidden>
    <circle cx="4" cy="10" r="1.8" />
    <circle cx="10" cy="10" r="1.8" />
    <circle cx="16" cy="10" r="1.8" />
  </svg>
);

export const Check = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" {...icon({ stroke: 'var(--accent)', strokeWidth: 2.2 })}>
    <path d="M3.5 9.5l3.5 3.5 7.5-8" />
  </svg>
);
