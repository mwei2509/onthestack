import { useNavigate } from 'react-router';
import { ImportForm } from './ImportForm.js';
import { PageHeader } from './parts.js';

export function ImportPage() {
  const navigate = useNavigate();
  return (
    <div className="phone" style={{ gap: 16 }}>
      <PageHeader title="Import a deck" back="/decks" backLabel="Back to decks" />
      <ImportForm onImported={(deck) => navigate(`/decks/${deck.id}`, { replace: true })} />
    </div>
  );
}
