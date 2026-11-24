import type { SeatView } from '@onthestack/server/protocol';
import { useState, type CSSProperties, type ReactNode } from 'react';
import { CopyIcon, Logo, ShareIcon } from '../icons.js';
import { initial } from './seats.js';
import type { Connection } from './useGame.js';

export function GameHeader({ code, right }: { code: string; right?: ReactNode }) {
  return (
    <header className="game-header">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <Logo />
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <span className="faint" style={{ fontSize: 12 }}>
            Game
          </span>
          <span className="code">{code}</span>
        </div>
      </div>
      {right}
    </header>
  );
}

export function ConnectionPill({ connection }: { connection: Connection }) {
  const open = connection === 'open';
  return (
    <span className="pill" role="status">
      <span className={`dot ${open ? 'on' : 'off'}`} style={{ width: 8, height: 8 }} />
      {open ? 'Online' : 'Reconnecting…'}
    </span>
  );
}

/** A seat's coin: its colour as a ring around the player's initial (ADR 0081). `active` adds the gold ring of whose turn it is. */
export function Avatar({ name, colour, size, active }: { name: string; colour: string; size?: number; active?: boolean }) {
  const style = { '--coin-ring': colour, ...(size ? { width: size, height: size, fontSize: Math.round(size * 0.45) } : {}) } as CSSProperties;
  return (
    <span className={`avatar${active ? ' active' : ''}`} style={style} aria-hidden>
      {initial(name)}
    </span>
  );
}

/** The painted glow behind a seat, in its colour. Its parent must be positioned. */
export function SeatWash({ colour, strength = 24 }: { colour: string; strength?: number }) {
  const wash = `radial-gradient(60% 140% at 70% 0%, color-mix(in srgb, ${colour} ${strength}%, transparent), transparent 70%)`;
  return <span className="wash" style={{ '--wash': wash } as CSSProperties} aria-hidden />;
}

export function SeatDot({ seat }: { seat: SeatView }) {
  return <span className={`dot ${seat.connected ? 'on' : 'off'}`} role="img" aria-label={seat.connected ? 'Connected' : 'No device'} />;
}

export const gameLink = (code: string) => `${location.origin}/g/${code}`;

export function Invite({ code, note }: { code: string; note?: string }) {
  const link = gameLink(code);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };
  const canShare = typeof navigator.share === 'function';
  return (
    <section className="panel">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 className="display" style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
          Invite the table
        </h2>
        {note && <span className="faint" style={{ fontSize: 13 }}>{note}</span>}
      </div>
      <div className="link-box">
        <span>{link.replace(/^https?:\/\//, '')}</span>
        <button aria-label={copied ? 'Link copied' : 'Copy link'} onClick={copy}>
          <CopyIcon />
        </button>
      </div>
      {copied && <span className="muted" role="status" style={{ fontSize: 13 }}>Link copied</span>}
      {canShare && (
        <button className="btn" onClick={() => navigator.share({ title: 'Join my game on On The Stack', url: link }).catch(() => undefined)}>
          <ShareIcon />
          Share
        </button>
      )}
    </section>
  );
}

export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="toast" role="alert">
      {message}
    </div>
  );
}
