import { useParams } from 'react-router-dom';
import type { Assessment } from '../api';
import { KpiPanel } from '../components/KpiPanel';
import { Breadcrumb, Crumb, PageTitle } from '../components/Layout';
import { Empty, ErrorState, Skeleton } from '../components/States';
import { formatDate } from '../format';
import { t } from '../i18n';
import { useSession } from '../session';
import { useApi } from '../useApi';
import { AssessmentForm } from './AssessmentForm';

interface DueList {
  cycle: { periodStart: string; periodEnd: string } | null;
  people: { userId: string; status: 'draft' | 'not_started' }[];
}

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

export function AssessmentList({
  items,
  showSubject = true,
}: {
  items: Assessment[];
  showSubject?: boolean;
}) {
  if (!items.length) return <Empty>{t('noAssessments')}</Empty>;
  return (
    <ul className="assessments">
      {items.map((a) => (
        <li key={a.id} className="assessment">
          <div className="assessment-head">
            {showSubject && <strong>{a.subject_name}</strong>}
            <span className="muted small">
              {formatDate(a.period_start)}, {t('by')} {a.reviewer_name}
            </span>
            <span className={`badge ${a.status === 'submitted' ? 'badge-managed' : 'badge-warn'}`}>
              {a.status === 'submitted' ? t('submittedStatus') : t('draft')}
            </span>
          </div>
          <dl className="facts compact">
            <div>
              <dt>{t('independence')}</dt>
              <dd>{a.independence} of 5</dd>
            </div>
            <div>
              <dt>{t('growth')}</dt>
              <dd>{a.growth} of 5</dd>
            </div>
          </dl>
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
  const due = useApi<DueList>(me.canReview ? '/api/v1/reviews/due' : null);
  if (dev.state === 'loading') return <Skeleton title lines={5} />;
  if (dev.state === 'error') return <ErrorState error={dev.error} onRetry={dev.reload} />;
  const d = dev.data;
  const current = d.teams.find((tm) => tm.effective_to === null);
  const crumbs: Crumb[] = [{ label: t('navOrganization'), to: '/organization' }];
  if (current) {
    const canOpenGroup =
      me.managedGroupIds.includes(current.group_id) || me.roles.includes('ADMIN');
    crumbs.push({
      label: current.group_name,
      to: canOpenGroup ? `/groups/${current.group_id}` : undefined,
    });
    crumbs.push({ label: current.name, to: `/teams/${current.id}` });
  }
  crumbs.push({ label: d.display_name });
  const canAssess = !d.isSelf && me.canReview;
  // This month's state comes from the server (open cycle, scoped): due → show the form (with my
  // draft if any); not due → already submitted this month → show the confirmation.
  const dueEntry =
    due.state === 'ready' ? due.data.people.find((p) => p.userId === d.id) : undefined;
  const mine =
    reviews.state === 'ready' ? reviews.data.filter((a) => a.reviewer_user_id === me.user.id) : [];
  const myDraft = mine.find((a) => a.status === 'draft');
  const mySubmitted = mine.find((a) => a.status === 'submitted');

  return (
    <>
      <Breadcrumb items={crumbs} />
      <PageTitle>{d.display_name}</PageTitle>
      <dl className="facts">
        <div>
          <dt>{t('grade')}</dt>
          <dd>{d.grade ?? '—'}</dd>
        </div>
        <div>
          <dt>{t('team')}</dt>
          <dd>{current ? `${current.name} (${current.group_name})` : '—'}</dd>
        </div>
        {d.teams.length > 1 && (
          <div>
            <dt>{t('history')}</dt>
            <dd>
              {d.teams
                .map(
                  (tm) =>
                    `${tm.name} from ${formatDate(tm.effective_from)}${tm.effective_to ? ` to ${formatDate(tm.effective_to)}` : ''}`,
                )
                .join('; ')}
            </dd>
          </div>
        )}
      </dl>
      <KpiPanel entityType="developer" entityId={d.id} title={d.isSelf ? t('myKpis') : t('kpis')} />
      <section className="panel">
        <h2>{t('assessments')}</h2>
        {reviews.state === 'loading' && <Skeleton lines={3} />}
        {reviews.state === 'error' && <ErrorState error={reviews.error} onRetry={reviews.reload} />}
        {reviews.state === 'ready' && <AssessmentList items={reviews.data} showSubject={false} />}
      </section>
      {canAssess && reviews.state === 'ready' && due.state === 'ready' && dueEntry && (
        <AssessmentForm
          key={myDraft?.id ?? 'new'}
          subjectUserId={d.id}
          subjectName={d.display_name.split(' ')[0]}
          initial={myDraft}
          onSaved={() => {
            reviews.reload();
            due.reload();
          }}
        />
      )}
      {canAssess && due.state === 'ready' && due.data.cycle && !dueEntry && mySubmitted && (
        <p className="notice-ok" role="status">
          {t('assessmentDoneFor')} {formatDate(mySubmitted.submitted_at)}.{' '}
          {t('assessmentDoneVisible').replace('{name}', d.display_name.split(' ')[0])}
        </p>
      )}
    </>
  );
}
