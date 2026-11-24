import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { Back } from '../icons.js';

export function PageHeader({ title, back, backLabel, right }: { title: string; back: string; backLabel: string; right?: ReactNode }) {
  const navigate = useNavigate();
  return (
    <header className="page-header">
      <button className="icon-btn back" aria-label={backLabel} onClick={() => navigate(back)}>
        <Back />
      </button>
      <h1 className="display">{title}</h1>
      {right}
    </header>
  );
}

export function LoadError({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div className="center-screen" style={{ gap: 12 }}>
      <p role="alert" style={{ margin: 0, color: 'var(--danger)' }}>
        {message}
      </p>
      <button className="btn" onClick={retry}>
        Try again
      </button>
    </div>
  );
}
