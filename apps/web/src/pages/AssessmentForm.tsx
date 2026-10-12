import { FormEvent, useState } from 'react';
import { api } from '../api';
import { t } from '../i18n';

const ANCHORS: Record<'independence' | 'growth', string[]> = {
  independence: [
    '1 · Substantially dependent',
    '2 · Needs frequent guidance',
    '3 · Meets grade expectations',
    '4 · Above-grade autonomy',
    '5 · Demonstrates and develops others',
  ],
  growth: [
    '1 · No progress on plan',
    '2 · Limited progress',
    '3 · Progressing as agreed',
    '4 · Ahead of plan',
    '5 · Exceptional growth, helps others grow',
  ],
};

function Rubric({
  name,
  label,
  value,
  onChange,
}: {
  name: 'independence' | 'growth';
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <fieldset className="rubric">
      <legend>{label}</legend>
      {ANCHORS[name].map((anchor, i) => (
        <label key={anchor} className={value === i + 1 ? 'selected' : ''}>
          <input
            type="radio"
            name={name}
            value={i + 1}
            checked={value === i + 1}
            onChange={() => onChange(i + 1)}
          />
          {anchor}
        </label>
      ))}
    </fieldset>
  );
}

export function AssessmentForm({
  subjectUserId,
  onSaved,
}: {
  subjectUserId: string;
  onSaved: () => void;
}) {
  const [independence, setIndependence] = useState(0);
  const [growth, setGrowth] = useState(0);
  const [evidence, setEvidence] = useState('');
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const valid = independence > 0 && growth > 0 && evidence.trim().length >= 20;

  async function save(submit: boolean, e?: FormEvent) {
    e?.preventDefault();
    if (!valid) return;
    setBusy(true);
    setStatus(null);
    try {
      await api.post('/api/v1/reviews', { subjectUserId, independence, growth, evidence, submit });
      setStatus({ kind: 'ok', text: submit ? t('submitted') : t('saved') });
      onSaved();
    } catch (err) {
      setStatus({ kind: 'error', text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel form" onSubmit={(e) => save(true, e)} aria-labelledby="assess-title">
      <h2 id="assess-title">{t('newAssessment')}</h2>
      <p className="muted small">
        Human judgment with evidence. Ratings are relative to the person’s grade and development
        plan — never derived from KPIs.
      </p>
      <Rubric
        name="independence"
        label={t('independence')}
        value={independence}
        onChange={setIndependence}
      />
      <Rubric name="growth" label={t('growth')} value={growth} onChange={setGrowth} />
      <label className="field">
        <span>{t('evidence')}</span>
        <textarea
          value={evidence}
          onChange={(e) => setEvidence(e.target.value)}
          rows={5}
          maxLength={4000}
          aria-describedby="evidence-hint"
          required
        />
        <span id="evidence-hint" className="muted small">
          {t('evidenceHint')} ({evidence.trim().length}/20)
        </span>
      </label>
      {status && (
        <p
          role={status.kind === 'error' ? 'alert' : 'status'}
          className={status.kind === 'error' ? 'error-text' : 'ok-text'}
        >
          {status.text}
        </p>
      )}
      <div className="actions">
        <button type="button" className="btn" disabled={!valid || busy} onClick={() => save(false)}>
          {t('saveDraft')}
        </button>
        <button type="submit" className="btn btn-primary" disabled={!valid || busy}>
          {t('submit')}
        </button>
      </div>
    </form>
  );
}
