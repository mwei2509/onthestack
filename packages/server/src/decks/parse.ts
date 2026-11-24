/** One card line of a pasted Deck list, as written. Matching it to a card is the card store's job. */
export interface DeckLine {
  /** 1-based, so a player can find it in what they pasted. */
  lineNumber: number;
  text: string;
  quantity: number;
  name: string;
  /** Archidekt's export, and some other sites', pin the printing with a set code and collector number. */
  set?: string;
  collectorNumber?: string;
  commander: boolean;
}

export interface UnreadableLine {
  lineNumber: number;
  text: string;
}

export interface ParsedDeckList {
  lines: DeckLine[];
  unreadable: UnreadableLine[];
}

type Section = 'deck' | 'commander' | 'left-out';

const HEADINGS: Record<string, Section> = {
  commander: 'commander',
  commanders: 'commander',
  deck: 'deck',
  main: 'deck',
  mainboard: 'deck',
  maindeck: 'deck',
  sideboard: 'left-out',
  maybeboard: 'left-out',
};

const LEFT_OUT_CATEGORIES = new Set(['sideboard', 'maybeboard']);

// `1x Vona, Butcher of Magan (lcc) 293 [Commander{top}]` or `1 Sol Ring`, optionally with Archidekt's
// `*F*` finish markers and `^Label,#color^` labels between the printing and the categories.
const CARD_LINE =
  /^(\d+)x?\s+(.+?)(?:\s+\(([A-Za-z0-9]+)\)\s+(\S+))?(?:\s+\*[A-Za-z]+\*)*(?:\s+\^[^^]*\^)?(?:\s+\[([^\]]*)\])?$/;

function headingOf(line: string): Section | undefined {
  const word = line.replace(/^\/\/\s*/, '').replace(/:$/, '').trim().toLowerCase();
  return HEADINGS[word];
}

/** Archidekt categories look like `Commander{top}` or `Maybeboard{noDeck}{noPrice}`, comma-separated. */
function categoriesOf(bracket: string | undefined): string[] {
  if (!bracket) return [];
  return bracket.split(',').map((c) => c.replace(/\{[^}]*\}/g, '').trim().toLowerCase());
}

/**
 * Reads Archidekt's text export and the common one-card-per-line format (ADR 0049). Sideboard and
 * Maybeboard cards are left out, whether marked by category or by heading. A line that is neither a
 * card nor a known heading is returned as unreadable, never guessed at (principle 2).
 */
export function parseDeckList(text: string): ParsedDeckList {
  const lines: DeckLine[] = [];
  const unreadable: UnreadableLine[] = [];
  let section: Section = 'deck';

  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    const lineNumber = i + 1;
    if (line === '') return;

    const heading = headingOf(line);
    if (heading) {
      section = heading;
      return;
    }

    const match = CARD_LINE.exec(line);
    const quantity = Number(match?.[1]);
    if (!match || quantity < 1) {
      unreadable.push({ lineNumber, text: line });
      return;
    }

    const categories = categoriesOf(match[5]);
    if (section === 'left-out' || categories.some((c) => LEFT_OUT_CATEGORIES.has(c))) return;

    lines.push({
      lineNumber,
      text: line,
      quantity,
      name: match[2]!,
      ...(match[3] ? { set: match[3].toLowerCase(), collectorNumber: match[4]! } : {}),
      commander: section === 'commander' || categories.includes('commander'),
    });
  });

  return { lines, unreadable };
}
