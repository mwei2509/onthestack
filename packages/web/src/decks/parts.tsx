import { useId, type ReactNode } from 'react';
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

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const titleId = useId();
  return (
    <div className="scrim" onClick={(e) => e.target === e.currentTarget && onClose()} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <section className="sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="handle" />
        <h2 id={titleId} className="display" style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>
          {title}
        </h2>
        {children}
      </section>
    </div>
  );
}
