import { ApiError } from '../api';
import { t } from '../i18n';

export function Loading({ label = t('loading') }: { label?: string }) {
  return (
    <div className="state" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" /> {label}
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
        <p className="muted">Reference: {error.correlationId}</p>
      )}
      {onRetry && (
        <button type="button" className="btn" onClick={onRetry}>
          {t('retry')}
        </button>
      )}
    </div>
  );
}
