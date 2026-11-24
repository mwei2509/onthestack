import { useEffect, useId, useState } from 'react';
import { Check } from '../icons.js';
import { suggestNames, type UnmatchedLine } from './api.js';
import { lineWithName, nameInLine } from './format.js';

const REASON = { 'not-found': 'No card by that name', unreadable: "Couldn't read this line" } as const;

/** Scryfall's names for what's typed, asked after a pause in typing (ADR 0082). */
function useSuggestions(query: string): { names: string[]; answered: string | null } {
  const [result, setResult] = useState<{ names: string[]; answered: string | null }>({ names: [], answered: null });
  useEffect(() => {
    if (query.trim().length < 2) {
      setResult({ names: [], answered: null });
      return;
    }
    const abort = new AbortController();
    const timer = setTimeout(() => {
      suggestNames(query, abort.signal).then(
        (n) => setResult({ names: n.slice(0, 6), answered: query }),
        () => setResult({ names: [], answered: null }),
      );
    }, 250);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [query]);
  return result;
}

/**
 * An unmatched line (ADR 0077). A line naming a card nobody recognised is fixed by picking a name
 * Scryfall suggests; one that couldn't be read is retyped. Either can be skipped.
 */
export function ProblemLine({
  line,
  busy,
  onFix,
  onSkip,
}: {
  line: UnmatchedLine;
  busy: boolean;
  onFix: (text: string) => void;
  onSkip: () => void;
}) {
  const [open, setOpen] = useState(false);
  const notFound = line.reason === 'not-found';
  const [typed, setTyped] = useState(notFound ? nameInLine(line.text) : line.text);
  const [picked, setPicked] = useState<string | null>(null);
  const { names: suggestions, answered } = useSuggestions(open && notFound ? typed : '');
  const inputId = useId();

  if (!open) {
    return (
      <div className="problem">
        <span className="problem-text">
          <span className="mono">{line.text}</span>
          <span className="problem-reason">{REASON[line.reason]}</span>
        </span>
        <button className="btn" style={{ height: 44, padding: '0 14px', borderRadius: 12 }} onClick={() => setOpen(true)} disabled={busy}>
          Fix
        </button>
        <button className="btn btn-text muted" style={{ height: 44, padding: '0 10px' }} onClick={onSkip} disabled={busy}>
          Skip
        </button>
      </div>
    );
  }

  return (
    <div className="problem open">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span className="mono" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {line.text}
        </span>
        <span className="problem-reason" style={{ flexShrink: 0 }}>
          {REASON[line.reason]}
        </span>
      </div>
      <label htmlFor={inputId} className="muted" style={{ fontSize: 13 }}>
        {notFound ? 'Which card is it?' : 'Type the line, like “1 Sol Ring”'}
      </label>
      <input
        id={inputId}
        className="fix-input"
        value={typed}
        autoFocus
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => {
          setTyped(e.target.value);
          setPicked(null);
        }}
      />
      {notFound && suggestions.length > 0 && (
        <ul role="listbox" aria-label="Matching cards" className="suggestions">
          {suggestions.map((name) => (
            <li key={name} role="option" aria-selected={picked === name}>
              <button type="button" onClick={() => setPicked(name)}>
                <span className="display">{name}</span>
                {picked === name && <Check />}
              </button>
            </li>
          ))}
        </ul>
      )}
      {notFound && answered === typed && suggestions.length === 0 && (
        <p className="hint" style={{ margin: 0 }}>
          No card names start with “{typed.trim()}”. Try fewer letters.
        </p>
      )}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <button className="btn btn-text muted" style={{ height: 44 }} onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </button>
        <button className="btn" style={{ height: 44, borderRadius: 12 }} onClick={onSkip} disabled={busy}>
          Skip
        </button>
        {notFound ? (
          <button
            className="btn btn-light"
            style={{ height: 44, borderRadius: 12, fontSize: 14 }}
            disabled={busy || picked === null}
            onClick={() => picked && onFix(lineWithName(line.text, picked))}
          >
            {picked ? `Use ${picked}` : 'Pick a card'}
          </button>
        ) : (
          <button className="btn btn-light" style={{ height: 44, borderRadius: 12, fontSize: 14 }} disabled={busy || typed.trim() === ''} onClick={() => onFix(typed)}>
            Fix line
          </button>
        )}
      </div>
    </div>
  );
}
