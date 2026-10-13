import { ApiError } from '../api';
import { t } from '../i18n';

export function Loading({ label = t('loading') }: { label?: string }) {
  return (
    <div className="state" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" /> {label}
    </div>
  );
}

/** Placeholder lines in the shape of the content being loaded (DESIGN.md §5 States). */
export function Skeleton({ lines = 3, title = false }: { lines?: number; title?: boolean }) {
  return (
    <div className="skeleton" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{t('loading')}</span>
      {title && <span className="skeleton-line skeleton-title" aria-hidden="true" />}
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} className="skeleton-line" aria-hidden="true" />
      ))}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="state state-empty">{children}</div>;
}

export function ErrorState({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  if (error instanceof ApiError && error.status === 404) {
    return (
      <div className="state state-error" role="alert">
        <h2>{t('notFoundTitle')}</h2>
        <p>{t('notFoundBody')}</p>
      </div>
    );
  }
  return (
    <div className="state state-error" role="alert">
      <h2>{t('errorTitle')}</h2>
      <p>{error.message}</p>
      {error instanceof ApiError && error.correlationId && (
        <p className="muted">
          Reference: <code translate="no">{error.correlationId}</code>
        </p>
      )}
      {onRetry && (
        <button type="button" className="btn" onClick={onRetry}>
          {t('retry')}
        </button>
      )}
    </div>
  );
}
