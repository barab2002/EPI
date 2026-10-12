import type { Assessment } from '../api';
import { Breadcrumb } from '../components/Layout';
import { ErrorState, Loading } from '../components/States';
import { t } from '../i18n';
import { useApi } from '../useApi';
import { AssessmentList } from './Developer';

export function ReviewsPage() {
  const list = useApi<Assessment[]>('/api/v1/reviews');
  return (
    <>
      <Breadcrumb items={[{ label: t('navReviews') }]} />
      <h1>{t('assessments')}</h1>
      <p className="muted">
        You see assessments about yourself (once submitted), assessments you wrote, and submitted
        assessments of people you manage. To write one, open a team member’s profile.
      </p>
      {list.state === 'loading' && <Loading />}
      {list.state === 'error' && <ErrorState error={list.error} onRetry={list.reload} />}
      {list.state === 'ready' && <AssessmentList items={list.data} />}
    </>
  );
}
