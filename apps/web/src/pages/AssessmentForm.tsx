import { FormEvent, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { MessageKey, t } from '../i18n';

const ANCHORS: Record<'independence' | 'growth', MessageKey[]> = {
  independence: [
    'anchorIndependence1',
    'anchorIndependence2',
    'anchorIndependence3',
    'anchorIndependence4',
    'anchorIndependence5',
  ],
  growth: ['anchorGrowth1', 'anchorGrowth2', 'anchorGrowth3', 'anchorGrowth4', 'anchorGrowth5'],
};

function Rubric({
  name,
  label,
  value,
  onChange,
  error,
  firstRef,
}: {
  name: 'independence' | 'growth';
  label: string;
  value: number;
  onChange: (v: number) => void;
  error: string | null;
  firstRef?: React.Ref<HTMLInputElement>;
}) {
  const errId = `${name}-error`;
  return (
    <fieldset
      className={`rubric${error ? ' invalid' : ''}`}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? errId : undefined}
    >
      <legend>{label}</legend>
      {ANCHORS[name].map((anchor, i) => (
        <label key={anchor} className={value === i + 1 ? 'selected' : ''}>
          <input
            ref={i === 0 ? firstRef : undefined}
            type="radio"
            name={name}
            value={i + 1}
            checked={value === i + 1}
            onChange={() => onChange(i + 1)}
          />
          <span className="rubric-score">{i + 1}</span>
          <span>
            <span className="sr-only">: </span>
            {t(anchor)}
          </span>
        </label>
      ))}
      {error && (
        <p id={errId} className="field-error">
          {error}
        </p>
      )}
    </fieldset>
  );
}

export interface AssessmentDraft {
  independence: number;
  growth: number;
  evidence: string;
}

const MIN_EVIDENCE = 20;

export function AssessmentForm({
  subjectUserId,
  subjectName,
  onSaved,
  initial,
}: {
  subjectUserId: string;
  subjectName?: string;
  onSaved: () => void;
  /** The reviewer's saved draft for this cycle, so saving never overwrites it with blanks. */
  initial?: AssessmentDraft;
}) {
  const [independence, setIndependence] = useState(initial?.independence ?? 0);
  const [growth, setGrowth] = useState(initial?.growth ?? 0);
  const [evidence, setEvidence] = useState(initial?.evidence ?? '');
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  /** Which action is in flight: the busy label goes on the button that was pressed. */
  const [pending, setPending] = useState<'draft' | 'submit' | null>(null);
  const busy = pending !== null;
  const [tried, setTried] = useState(false);
  const [dirty, setDirty] = useState(false);
  const independenceRef = useRef<HTMLInputElement>(null);
  const growthRef = useRef<HTMLInputElement>(null);
  const evidenceRef = useRef<HTMLTextAreaElement>(null);
  const length = evidence.trim().length;
  const errors = {
    independence: independence ? null : t('errIndependence'),
    growth: growth ? null : t('errGrowth'),
    evidence:
      length >= MIN_EVIDENCE ? null : `${t('errEvidence')} (${length} of ${MIN_EVIDENCE} so far).`,
  };

  // Warn before leaving with unsaved changes (Web Interface Guidelines: forms).
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  async function save(submit: boolean, e?: FormEvent) {
    e?.preventDefault();
    setTried(true);
    if (errors.independence) return independenceRef.current?.focus();
    if (errors.growth) return growthRef.current?.focus();
    if (errors.evidence) return evidenceRef.current?.focus();
    setPending(submit ? 'submit' : 'draft');
    setStatus(null);
    try {
      await api.post('/api/v1/reviews', { subjectUserId, independence, growth, evidence, submit });
      setStatus({ kind: 'ok', text: submit ? t('submitted') : t('saved') });
      setDirty(false);
      onSaved();
    } catch (err) {
      setStatus({ kind: 'error', text: (err as Error).message });
    } finally {
      setPending(null);
    }
  }

  const change =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setDirty(true);
    };

  return (
    <form
      className="panel form"
      onSubmit={(e) => save(true, e)}
      aria-labelledby="assess-title"
      noValidate
    >
      <h2 id="assess-title">{t('newAssessment')}</h2>
      <p className="muted small">{t('assessmentIntro')}</p>
      <Rubric
        name="independence"
        label={t('independence')}
        value={independence}
        onChange={change(setIndependence)}
        error={tried ? errors.independence : null}
        firstRef={independenceRef}
      />
      <Rubric
        name="growth"
        label={t('growth')}
        value={growth}
        onChange={change(setGrowth)}
        error={tried ? errors.growth : null}
        firstRef={growthRef}
      />
      <label className="field">
        <span>{t('evidence')}</span>
        <textarea
          ref={evidenceRef}
          name="evidence"
          value={evidence}
          onChange={(e) => change(setEvidence)(e.target.value)}
          rows={5}
          maxLength={4000}
          aria-invalid={tried && errors.evidence ? true : undefined}
          aria-describedby="evidence-hint"
          required
        />
        <span
          id="evidence-hint"
          className={tried && errors.evidence ? 'field-error' : 'muted small'}
        >
          {tried && errors.evidence
            ? errors.evidence
            : `${t('evidenceHint')} ${length} of at least ${MIN_EVIDENCE} characters.`}
        </span>
      </label>
      <div aria-live="polite">
        {status && (
          <p
            role={status.kind === 'error' ? 'alert' : 'status'}
            className={status.kind === 'error' ? 'error-text' : 'ok-text'}
          >
            {status.text}
          </p>
        )}
      </div>
      <div className="actions">
        <span className="muted small actions-note">
          {subjectName ? t('submitNoteNamed').replace('{name}', subjectName) : t('submitNote')}
        </span>
        <button
          type="button"
          className="btn"
          disabled={busy}
          aria-busy={pending === 'draft'}
          onClick={() => save(false)}
        >
          {pending === 'draft' ? t('saving') : t('saveDraft')}
        </button>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={busy}
          aria-busy={pending === 'submit'}
        >
          {pending === 'submit' ? t('submitting') : t('submit')}
        </button>
      </div>
    </form>
  );
}
