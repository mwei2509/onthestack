import { useEffect, useRef, useState } from 'react';
import type { TableView } from '@onthestack/engine';
import { Avatar } from '../parts.js';
import type { BoardPlayer, CommanderHit } from './model.js';
import { CUE_AT } from './model.js';
import { nextPlayerId, STEP_NAMES, stepTrack } from './steps.js';

/**
 * True for a moment after the Step changes with a PlayerTask still undone, so the Step pulses; it never blocks
 * (ADR 0125).
 */
export function useStepNudge(view: TableView): boolean {
  const step = view.turn.step;
  const undone = view.playerTasks.some((t) => !t.doneBy);
  const last = useRef(step);
  const [nudge, setNudge] = useState(false);
  useEffect(() => {
    if (last.current === step) return;
    last.current = step;
    if (!undone) return;
    setNudge(true);
    const timer = setTimeout(() => setNudge(false), 2400);
    return () => clearTimeout(timer);
  }, [step, undone]);
  return nudge;
}

export function StepCard({ view }: { view: TableView }) {
  const track = stepTrack(view);
  const nudge = useStepNudge(view);
  return (
    <section aria-label="Current step" className={`step-card${nudge ? ' nudge' : ''}`}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
        <span className="display" style={{ fontSize: 20, fontWeight: 700 }}>
          {STEP_NAMES[view.turn.step]}
        </span>
        <span className="phase-label">{track.phase}</span>
      </div>
      <div className="track" aria-hidden>
        {track.phases.map((p, i) => (
          <div key={i} className="track-phase">
            {p.steps.map((s) => (
              <div key={s.step} className={`tick ${s.state}`} />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

/** The step strip on a Shared screen: every Step named, the current one in amber. */
export function StepStrip({ view }: { view: TableView }) {
  const track = stepTrack(view);
  const nudge = useStepNudge(view);
  return (
    <ol className={`strip${nudge ? ' nudge' : ''}`} aria-label="Steps">
      {track.phases.map((p, i) => (
        <li key={i} style={{ flexGrow: p.steps.length }}>
          <span className="strip-phase">{p.label}</span>
          <div style={{ display: 'flex', gap: 4 }}>
            {p.steps.map((s) => (
              <div key={s.step} className={`strip-step ${s.state}`} aria-current={s.state === 'current' ? 'step' : undefined}>
                <div className={`tick ${s.state}`} />
                <span>{s.short}</span>
              </div>
            ))}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function nextLabel(view: TableView): string {
  const next = view.stepsAhead[0];
  return next ? STEP_NAMES[next] : `${view.players[nextPlayerId(view)]!.name}'s turn`;
}

export function NextStepButton({ view, disabled, onNext }: { view: TableView; disabled?: boolean; onNext: () => void }) {
  return (
    <button className="next-step" onClick={onNext} disabled={disabled}>
      <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 0 }}>
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', opacity: 0.8 }}>NEXT STEP</span>
        <span className="display" style={{ fontSize: 17, fontWeight: 800 }}>
          {nextLabel(view)}
        </span>
      </span>
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M8 5l6 6-6 6" />
      </svg>
    </button>
  );
}

/** Next step as a compact square, leaving the dock's wide space to typing now and the mic later (ADR 0106). */
export function NextStepCompact({ view, disabled, onNext }: { view: TableView; disabled?: boolean; onNext: () => void }) {
  return (
    <button className="next-compact" aria-label={`Next step: ${nextLabel(view)}`} onClick={onNext} disabled={disabled}>
      <svg width="20" height="20" viewBox="0 0 22 22" fill="none" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M8 5l6 6-6 6" />
      </svg>
      <span>Next</span>
    </button>
  );
}

export function StepMenuButton({ onOpen, disabled }: { onOpen: () => void; disabled?: boolean }) {
  return (
    <button className="menu-button" aria-label="Jump to a step" onClick={onOpen} disabled={disabled}>
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
        <path d="M4 6h14M4 11h14M4 16h9" />
      </svg>
    </button>
  );
}

export const clockTime = (at: Date) => at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export function EndedPill() {
  return (
    <span className="pill" role="status" style={{ border: 0 }}>
      Ended
    </span>
  );
}

export const cue = (damage: number) => (damage >= CUE_AT ? 'var(--danger)' : 'var(--text)');

/** Commander damage one player has taken: whose commander, and how much. 15 or more is shown in the warning colour. */
export function HitChips({ hits, players }: { hits: CommanderHit[]; players: Record<string, BoardPlayer> }) {
  return (
    <>
      {hits
        .filter((h) => h.damage > 0)
        .map((h) => (
          <span key={h.fromId} className="hit-chip" aria-label={`${h.damage} from ${h.commander}`}>
            <Avatar name={players[h.fromId]!.name} colour={players[h.fromId]!.ring} size={22} />
            <span style={{ fontSize: 12, color: 'var(--italic)', maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.commander}</span>
            <span className="num" style={{ fontSize: 15, fontWeight: 700, color: cue(h.damage) }}>
              {h.damage}
            </span>
          </span>
        ))}
    </>
  );
}

/** The most commander damage a player has taken, as "9 from Atraxa", or nothing. */
export function worstHit(hits: CommanderHit[]): string | null {
  const worst = hits.reduce<CommanderHit | null>((w, h) => (h.damage > (w?.damage ?? 0) ? h : w), null);
  return worst ? `${worst.damage} from ${worst.commander}` : null;
}

export function Tag({ kind }: { kind: 'you' | 'your turn' | 'their turn' }) {
  return <span className={kind === 'you' ? 'you-tag' : 'turn-tag'}>{kind.toUpperCase()}</span>;
}

/** The crest life sits in. */
export function Crest({ life, size, out }: { life: number; size: number; out?: boolean }) {
  return (
    <div className="crest" style={{ width: size * 1.03, height: size }}>
      <svg viewBox="0 0 132 128" fill="none" aria-hidden>
        <path d="M66 4 L120 18 V60 C120 92 96 112 66 124 C36 112 12 92 12 60 V18 Z" fill="rgba(17,13,20,0.55)" stroke="#C9973A" strokeWidth="2" />
        <path d="M66 12 L112 24 V60 C112 87 92 104 66 115 C40 104 20 87 20 60 V24 Z" stroke="#C9973A" strokeOpacity="0.35" strokeWidth="1" />
      </svg>
      <span className="num" aria-live="polite" style={{ fontSize: size * 0.52, marginTop: -size * 0.05, textDecoration: out ? 'line-through' : undefined }}>
        {life}
      </span>
    </div>
  );
}
