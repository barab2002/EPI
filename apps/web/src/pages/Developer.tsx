import { useParams } from 'react-router-dom';
import type { Assessment } from '../api';
import { KpiPanel } from '../components/KpiPanel';
import { Breadcrumb, Crumb } from '../components/Layout';
import { Empty, ErrorState, Loading } from '../components/States';
import { formatDate } from '../format';
import { t } from '../i18n';
import { useSession } from '../session';
import { useApi } from '../useApi';
import { AssessmentForm } from './AssessmentForm';

interface DeveloperDetail {
  id: string;
  display_name: string;
  grade: string | null;
  grade_since: string | null;
  experience_months_at_start: number | null;
  isSelf: boolean;
  teams: {
    id: string;
    name: string;
    group_id: string;
    group_name: string;
    effective_from: string;
    effective_to: string | null;
  }[];
}

export function AssessmentList({ items }: { items: Assessment[] }) {
  if (!items.length) return <Empty>{t('noAssessments')}</Empty>;
  return (
    <ul className="assessments">
      {items.map((a) => (
        <li key={a.id} className="assessment">
          <div className="assessment-head">
            <strong>{a.subject_name}</strong>
            <span className="muted small">
              {formatDate(a.period_start)} · by {a.reviewer_name}
            </span>
            <span className={`badge ${a.status === 'submitted' ? 'badge-managed' : 'badge-warn'}`}>
              {a.status === 'submitted' ? t('submittedStatus') : t('draft')}
            </span>
          </div>
          <p>
            {t('independence')}: <strong>{a.independence}/5</strong> · {t('growth')}:{' '}
            <strong>{a.growth}/5</strong>
          </p>
          <p className="evidence">{a.evidence}</p>
        </li>
      ))}
    </ul>
  );
}

export function DeveloperPage() {
  const { id = '' } = useParams();
  const { me } = useSession();
  const dev = useApi<DeveloperDetail>(`/api/v1/developers/${id}`);
  const reviews = useApi<Assessment[]>(`/api/v1/reviews?subject_user_id=${id}`);
  if (dev.state === 'loading') return <Loading />;
  if (dev.state === 'error') return <ErrorState error={dev.error} onRetry={dev.reload} />;
  const d = dev.data;
  const current = d.teams.find((tm) => tm.effective_to === null);
  const crumbs: Crumb[] = [{ label: t('navOrganization'), to: '/organization' }];
  if (current) crumbs.push({ label: current.name, to: `/teams/${current.id}` });
  crumbs.push({ label: d.display_name });
  const canAssess = !d.isSelf && me.canReview;
  const mine =
    reviews.state === 'ready' ? reviews.data.filter((a) => a.reviewer_user_id === me.user.id) : [];
  const alreadySubmitted = mine.some((a) => a.status === 'submitted');

  return (
    <>
      <Breadcrumb items={crumbs} />
      <h1>{d.display_name}</h1>
      <dl className="facts">
        <div>
          <dt>{t('grade')}</dt>
          <dd>{d.grade ?? '—'}</dd>
        </div>
        <div>
          <dt>Team</dt>
          <dd>{current ? `${current.name} (${current.group_name})` : '—'}</dd>
        </div>
        {d.teams.length > 1 && (
          <div>
            <dt>History</dt>
            <dd>
              {d.teams
                .map(
                  (tm) =>
                    `${tm.name} from ${formatDate(tm.effective_from)}${tm.effective_to ? ` to ${formatDate(tm.effective_to)}` : ''}`,
                )
                .join(' · ')}
            </dd>
          </div>
        )}
      </dl>
      <KpiPanel entityType="developer" entityId={d.id} title={d.isSelf ? t('myKpis') : t('kpis')} />
      <section className="panel">
        <h2>{t('assessments')}</h2>
        {reviews.state === 'loading' && <Loading />}
        {reviews.state === 'error' && <ErrorState error={reviews.error} onRetry={reviews.reload} />}
        {reviews.state === 'ready' && <AssessmentList items={reviews.data} />}
      </section>
      {canAssess && reviews.state === 'ready' && !alreadySubmitted && (
        <AssessmentForm subjectUserId={d.id} onSaved={reviews.reload} />
      )}
    </>
  );
}
