import { useState } from 'react';
import { DeckApiError, importArchidekt, importList, type DeckDetail } from './api.js';
import { lineCount, nameFromList } from './format.js';

type Source = 'archidekt' | 'paste';

/** Import by Archidekt link or pasted list (ADR 0049), as on the canvas's Decks screens. */
export function ImportForm({ onImported, initial = 'archidekt' }: { onImported: (deck: DeckDetail) => void; initial?: Source }) {
  const [source, setSource] = useState<Source>(initial);
  const [link, setLink] = useState('');
  const [list, setList] = useState('');
  const [name, setName] = useState('');
  const [nameEdited, setNameEdited] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lines = lineCount(list);
  const ready = source === 'archidekt' ? link.trim() !== '' : lines > 0 && name.trim() !== '';

  const changeList = (text: string) => {
    setList(text);
    if (!nameEdited) setName(nameFromList(text));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      onImported(source === 'archidekt' ? await importArchidekt(link) : await importList(name, list));
    } catch (err) {
      setError(err instanceof DeckApiError ? err.message : 'Something went wrong. Try again.');
      setBusy(false);
    }
  };

  return (
    <form className="import-form" onSubmit={submit}>
      <div role="tablist" aria-label="Import from" className="tabs">
        <button type="button" role="tab" aria-selected={source === 'archidekt'} onClick={() => setSource('archidekt')}>
          Archidekt link
        </button>
        <button type="button" role="tab" aria-selected={source === 'paste'} onClick={() => setSource('paste')}>
          Paste a list
        </button>
      </div>

      {source === 'archidekt' ? (
        <label className="field">
          Archidekt deck link
          <input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="archidekt.com/decks/…"
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            style={{ fontSize: 15 }}
          />
          <span className="hint">The deck must be public on Archidekt. Importing the same link again updates it.</span>
        </label>
      ) : (
        <>
          <label className="field">
            Deck name
            <input
              className="display"
              value={name}
              maxLength={60}
              onChange={(e) => {
                setName(e.target.value);
                setNameEdited(true);
              }}
              style={{ fontSize: 16, fontWeight: 700 }}
            />
          </label>
          <label className="field deck-list-field">
            Deck list
            <textarea value={list} onChange={(e) => changeList(e.target.value)} spellCheck={false} placeholder={'Commander\n1 Vona, Butcher of Magan\n\nDeck\n1 Sol Ring'} />
            <span className="hint">
              One card per line, like “1 Sol Ring”. Put the commander under a “Commander” heading. Exports from Archidekt, Moxfield and MTGO work.
            </span>
          </label>
        </>
      )}

      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <button className="btn btn-primary" type="submit" disabled={!ready || busy}>
        {busy ? 'Importing…' : source === 'paste' && lines > 0 ? `Import ${lines} ${lines === 1 ? 'line' : 'lines'}` : 'Import'}
      </button>
    </form>
  );
}
