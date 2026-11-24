import type { TableView } from '@onthestack/engine';
import { Avatar } from '../parts.js';
import type { BoardPlayer, CommanderHit } from './model.js';
import { CUE_AT, LETHAL } from './model.js';
import { nextPlayerId, STEP_NAMES, stepTrack } from './steps.js';

export function StepCard({ view }: { view: TableView }) {
  const track = stepTrack(view);
  return (
    <section aria-label="Current step" className="step-card">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span className="phase-label">{track.phase}</span>
        <span className="display" style={{ fontSize: 21, fontWeight: 600, letterSpacing: '-0.01em' }}>
          {STEP_NAMES[view.turn.step]}
        </span>
      </div>
      <div className="track" aria-hidden>
        {track.phases.map((p, i) => (
          <div key={i} className="track-phase" style={{ flexGrow: p.steps.length }}>
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
  return (
    <ol className="strip" aria-label="Steps">
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
      <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1 }}>
        <span className="muted" style={{ fontSize: 12 }}>
          Next step
        </span>
        <span style={{ fontSize: 17, fontWeight: 600 }}>{nextLabel(view)}</span>
      </span>
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M8 5l6 6-6 6" />
      </svg>
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

export const cue = (damage: number) => (damage >= CUE_AT ? 'var(--danger)' : 'var(--text)');

/** Commander damage one player has taken, as small chips: who dealt it and how much. */
export function HitChips({ hits, players, size = 16 }: { hits: CommanderHit[]; players: Record<string, BoardPlayer>; size?: number }) {
  const dealt = hits.filter((h) => h.damage > 0);
  if (dealt.length === 0) return <span className="faint" style={{ fontSize: 12 }}>No commander damage</span>;
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {dealt.map((h) => (
        <span key={h.fromId} className="chip" aria-label={`${h.damage} from ${h.commander}`}>
          <Avatar name={players[h.fromId]!.name} colour={players[h.fromId]!.colour} size={size} />
          <span className="num" style={{ fontSize: 13, fontWeight: 600, color: cue(h.damage) }}>
            {h.damage}
          </span>
        </span>
      ))}
    </div>
  );
}

export function HitBar({ damage }: { damage: number }) {
  return (
    <span className="hit-bar" aria-hidden>
      <span style={{ width: `${Math.min(100, (damage / LETHAL) * 100)}%`, background: damage >= CUE_AT ? 'var(--danger)' : 'var(--text-2)' }} />
    </span>
  );
}

export function Tag({ kind }: { kind: 'you' | 'turn' }) {
  return <span className={kind === 'you' ? 'you-tag' : 'turn-tag'}>{kind === 'you' ? 'YOU' : 'TURN'}</span>;
}
