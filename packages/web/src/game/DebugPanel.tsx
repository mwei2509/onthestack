import type { InterpretationRecord } from '@onthestack/server/protocol';
import { useCallback, useEffect, useState } from 'react';
import { readGameDump, type DumpResult } from './gameDump.js';
import type { GameConnection } from './useGame.js';

type Tab = 'interpretations' | 'state';

/**
 * `?debug`: the game's last interpretations (ADR 0109), and the whole game as JSON (ADR 0130). Both are asked for
 * again whenever the board changes while they're showing, so they keep up without a refresh.
 */
export function DebugPanel({ code, game }: { code: string; game: GameConnection }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('interpretations');
  const [dump, setDump] = useState<DumpResult | null>(null);
  const { send, connection } = game;
  const version = game.update?.version;

  const refreshDump = useCallback(() => {
    void readGameDump(code).then(setDump);
  }, [code]);

  useEffect(() => {
    if (!open || connection !== 'open') return;
    if (tab === 'interpretations') send({ type: 'debugLog' });
    else refreshDump();
  }, [open, tab, connection, version, send, refreshDump]);

  if (!open) {
    return (
      <button className="debug-toggle" onClick={() => setOpen(true)}>
        Debug
      </button>
    );
  }
  return (
    <aside className="debug-panel" aria-label="Debug">
      <header className="debug-header">
        <div className="debug-tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'interpretations'} className={tab === 'interpretations' ? 'on' : ''} onClick={() => setTab('interpretations')}>
            Interpretations
          </button>
          <button role="tab" aria-selected={tab === 'state'} className={tab === 'state' ? 'on' : ''} onClick={() => setTab('state')}>
            Game state
          </button>
        </div>
        <button className="btn" onClick={() => (tab === 'interpretations' ? send({ type: 'debugLog' }) : refreshDump())}>
          Refresh
        </button>
        {tab === 'state' && dump && 'json' in dump && (
          <button className="btn" onClick={() => void navigator.clipboard.writeText(dump.json)}>
            Copy
          </button>
        )}
        <button className="btn" onClick={() => setOpen(false)}>
          Close
        </button>
      </header>
      {tab === 'interpretations' ? <Interpretations log={game.debugLog} /> : <GameState dump={dump} />}
    </aside>
  );
}

function Interpretations({ log }: { log: InterpretationRecord[] | null }) {
  if (log === null) return <p className="muted">Loading…</p>;
  if (log.length === 0) return <p className="muted">Nothing interpreted in this game yet.</p>;
  return (
    <>
      {log.map((r) => (
        <Interpretation key={r.at + r.transcriptVersion} record={r} />
      ))}
    </>
  );
}

/** The game's dump (ADR 0117). The Decks' cards aren't in it: games load them from their Deck versions (ADR 0119). */
function GameState({ dump }: { dump: DumpResult | null }) {
  if (dump === null) return <p className="muted">Loading…</p>;
  if ('error' in dump) return <p className="debug-error">{dump.error}</p>;
  return <pre className="debug-json">{dump.json}</pre>;
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
