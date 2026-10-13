import type { Assessment } from '../api';
import { Breadcrumb, PageTitle } from '../components/Layout';
import { ErrorState, Skeleton } from '../components/States';
import { t } from '../i18n';
import { useApi } from '../useApi';
import { AssessmentList } from './Developer';

export function ReviewsPage() {
  const list = useApi<Assessment[]>('/api/v1/reviews');
  return (
    <>
      <Breadcrumb items={[{ label: t('navReviews') }]} />
      <PageTitle>{t('assessments')}</PageTitle>
      <p className="muted">{t('reviewsIntro')}</p>
      {list.state === 'loading' && <Skeleton lines={5} />}
      {list.state === 'error' && <ErrorState error={list.error} onRetry={list.reload} />}
      {list.state === 'ready' && (
        <section className="panel">
          <AssessmentList items={list.data} />
        </section>
      )}
    </>
  );
}
