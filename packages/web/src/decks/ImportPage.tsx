import { useNavigate, useSearchParams } from 'react-router';
import { ImportForm } from './ImportForm.js';
import { PageHeader } from './parts.js';

/** Only a game link can be returned to, so a crafted link can't send the player elsewhere. */
const GAME_PATH = /^\/g\/[A-Za-z0-9-]{1,32}$/;

export function ImportPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const returnTo = params.get('return');
  const toGame = returnTo && GAME_PATH.test(returnTo) ? returnTo : null;
  const seat = params.get('seat');
  const seatParam = seat && /^p\d{1,3}$/.test(seat) ? `&seat=${seat}` : '';
  return (
    <div className="phone" style={{ gap: 16 }}>
      <PageHeader title="Import a deck" back={toGame ?? '/decks'} backLabel={toGame ? 'Back to the game' : 'Back to decks'} />
      <ImportForm
        onImported={(deck) => navigate(toGame ? `${toGame}?deck=${encodeURIComponent(deck.id)}${seatParam}` : `/decks/${deck.id}`, { replace: true })}
      />
    </div>
  );
}
