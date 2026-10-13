import { LOCALES, t } from '../i18n';
import { useLocale } from '../locale';

/** English | עברית. Each name is shown in its own language and marked with its lang. */
export function LanguageSwitch() {
  const { locale, change } = useLocale();
  return (
    <div className="segmented segmented-sm" role="group" aria-label={t('language')}>
      {LOCALES.map((l) => (
        <button
          key={l.code}
          type="button"
          lang={l.code}
          aria-pressed={locale === l.code}
          className={locale === l.code ? 'active' : ''}
          onClick={() => change(l.code)}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
