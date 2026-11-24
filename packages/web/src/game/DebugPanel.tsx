import type { InterpretationRecord } from '@onthestack/server/protocol';
import { useEffect, useState } from 'react';
import type { GameConnection } from './useGame.js';

/**
 * The game's last interpretations, for `?debug` (ADR 0109): what was sent and what came back. It asks again whenever
 * the board changes while it's open, so a new reading shows up without a refresh.
 */
export function DebugPanel({ game }: { game: GameConnection }) {
  const [open, setOpen] = useState(false);
  const { send, connection } = game;
  const version = game.update?.version;

  useEffect(() => {
    if (open && connection === 'open') send({ type: 'debugLog' });
  }, [open, connection, version, send]);

  if (!open) {
    return (
      <button className="debug-toggle" onClick={() => setOpen(true)}>
        Debug
      </button>
    );
  }
  return (
    <aside className="debug-panel" aria-label="Interpretations">
      <header className="debug-header">
        <h2>Interpretations</h2>
        <button className="btn" onClick={() => send({ type: 'debugLog' })}>
          Refresh
        </button>
        <button className="btn" onClick={() => setOpen(false)}>
          Close
        </button>
      </header>
      {game.debugLog === null ? (
        <p className="muted">Loading…</p>
      ) : game.debugLog.length === 0 ? (
        <p className="muted">Nothing interpreted in this game yet.</p>
      ) : (
        game.debugLog.map((r) => <Interpretation key={r.at + r.transcriptVersion} record={r} />)
      )}
    </aside>
  );
}

function Interpretation({ record: r }: { record: InterpretationRecord }) {
  const facts = [
    `Turn ${r.turn}`,
    `transcript v${r.transcriptVersion}`,
    new Date(r.at).toLocaleTimeString(),
    r.model,
    `${(r.latencyMs / 1000).toFixed(1)} s`,
    r.inputTokens !== undefined ? `${r.inputTokens} → ${r.outputTokens} tokens` : null,
    `prompt ${r.promptVersion}`,
  ].filter(Boolean);
  return (
    <article className={`debug-entry${r.error ? ' failed' : ''}`}>
      <p className="debug-facts">{facts.join(' · ')}</p>
      {r.error && <p className="debug-error">{r.error}</p>}
      {r.answer !== undefined && (
        <details open>
          <summary>Answer</summary>
          <pre>{pretty(r.answer)}</pre>
        </details>
      )}
      <details>
        <summary>Sent</summary>
        <pre>{r.user}</pre>
      </details>
    </article>
  );
}

function pretty(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}
