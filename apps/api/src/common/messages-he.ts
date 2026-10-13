import type { Locale } from './locale';

/**
 * Hebrew for the messages the server shows to people (ADR-035 stage 3b): API errors, field
 * validation, directory import reasons and warnings, connection tests. Messages stay English in
 * the code and logs; they are translated on the way out when the request asks for Hebrew.
 * messages-he.spec.ts scans the source and fails when a fixed message has no translation.
 * Names, e-mails, addresses, DNs and numbers inside a message are kept as they are.
 */
/** A key, not a secret: the CSRF error text (kept out of a `…token': '…'` line for the scanner). */
const CSRF_MESSAGE = 'Missing or invalid CSRF token';

const EXACT: Record<string, string> = {
  'Not found': 'לא נמצא',
  'Internal error': 'שגיאה פנימית',
  'Administrator role required': 'נדרשת הרשאת מנהל מערכת',
  'Team is inactive': 'הצוות אינו פעיל',
  'End date must be after the start date': 'תאריך הסיום חייב להיות אחרי תאריך ההתחלה',
  'Connection not found': 'החיבור לא נמצא',
  'Administrators cannot change their own roles (ask another administrator)':
    'מנהלי מערכת אינם יכולים לשנות את התפקידים של עצמם (פנו למנהל מערכת אחר)',
  'scopeId is required for organization/group/team roles and forbidden for SYSTEM':
    'יש לבחור ארגון, קבוצה או צוות לתפקיד הזה (ולא לתפקיד מערכת)',
  'You cannot deactivate yourself': 'אי אפשר להשבית את עצמכם',
  'Unknown time zone': 'אזור זמן לא מוכר',
  'Unknown status': 'סטטוס לא מוכר',
  'Unknown source': 'מקור לא מוכר',
  'Unknown source account': 'חשבון מקור לא מוכר',
  'Unknown or inactive user': 'משתמש לא מוכר או לא פעיל',
  'Unknown demo user': 'משתמש הדגמה לא מוכר',
  'Unknown connection': 'חיבור לא מוכר',
  'Unknown connection or status': 'חיבור או סטטוס לא מוכרים',
  'Unknown KPI': 'מדד לא מוכר',
  'Transfer date must be after the start of the current membership':
    'תאריך המעבר חייב להיות אחרי תחילת החברות הנוכחית בצוות',
  'This role is already assigned on that scope': 'התפקיד הזה כבר הוקצה בהיקף הזה',
  'The directory or EPI changed since the preview. Preview again before applying.':
    'הספרייה או EPI השתנו מאז התצוגה המקדימה. הציגו שוב לפני ההחלה.',
  'The directory import is not configured on this server (EPI_LDAP_* settings).':
    'ייבוא מהספרייה לא הוגדר בשרת הזה (הגדרות EPI_LDAP_*).',
  'Teams can only move between groups of the same organization':
    'אפשר להעביר צוות רק בין קבוצות של אותו ארגון',
  'Team not found': 'הצוות לא נמצא',
  'Role assignment already ended': 'הקצאת התפקיד כבר הסתיימה',
  'Person already has this grade': 'לאדם כבר יש את הדרגה הזו',
  'Person already belongs to this team at that date': 'האדם כבר חבר בצוות הזה בתאריך הזה',
  'Only the team groups configured in EPI_LDAP_TEAM_GROUPS can be mapped':
    'אפשר למפות רק את קבוצות הצוות שהוגדרו ב-EPI_LDAP_TEAM_GROUPS',
  'Not signed in or session expired': 'לא מחוברים, או שתוקף ההתחברות פג',
  'No open monthly review cycle': 'אין מחזור הערכה חודשי פתוח',
  'New grade must start after the current grade started':
    'הדרגה החדשה חייבת להתחיל אחרי תחילת הדרגה הנוכחית',
  [CSRF_MESSAGE]: 'אסימון אבטחה (CSRF) חסר או לא תקין; רעננו את הדף',
  'Membership already ended': 'החברות בצוות כבר הסתיימה',
  'Invalid cursor': 'מיקום דפדוף לא תקין',
  'EPI must keep at least one active administrator': 'ב-EPI חייב להישאר לפחות מנהל מערכת פעיל אחד',
  'Bot accounts cannot be mapped to people': 'אי אפשר למפות חשבונות בוט לאנשים',
  'Assessment already submitted for this cycle': 'ההערכה למחזור הזה כבר הוגשה',
  'Account is not mapped': 'החשבון אינו ממופה',
  'A membership changed during the import; preview again.':
    'חברות בצוות השתנתה במהלך הייבוא; הציגו תצוגה מקדימה שוב.',
  // Settings › connections (connection-input.ts)
  'Name: 2–40 lower-case letters, digits or dashes (e.g. jira-main)':
    'שם: 2–40 אותיות לטיניות קטנות, ספרות או מקפים (לדוגמה jira-main)',
  'Enter a valid address, e.g. https://jira.corp.example':
    'הזינו כתובת תקינה, לדוגמה https://jira.corp.example',
  'The address must start with https://': 'הכתובת חייבת להתחיל ב-https://',
  'Do not put a user name or password in the address; the token is a file on the server':
    'אל תכניסו שם משתמש או סיסמה לכתובת; הטוקן נשמר בקובץ בשרת',
  'Remove the query (?…) or fragment (#…) from the address': 'הסירו מהכתובת את החלק שאחרי ? או #',
  'Add at least one project': 'הוסיפו לפחות פרויקט אחד',
  'GitLab projects are numeric project IDs (Project › Settings › General)':
    'פרויקטים של GitLab הם מזהים מספריים (Project › Settings › General)',
  'Kind must be jira or gitlab': 'הסוג חייב להיות jira או gitlab',
  'The token secret name is upper-case letters, digits and _ (e.g. EPI_JIRA_TOKEN)':
    'שם הסוד של הטוקן: אותיות לטיניות גדולות, ספרות ו-_ (לדוגמה EPI_JIRA_TOKEN)',
  // Directory import (import-plan.ts, directory.client.ts)
  'Deactivated in EPI; reactivate them under People first.':
    'מושבת ב-EPI; הפעילו אותו מחדש תחת „אנשים” קודם.',
  'an entry does not exist (check the users/groups DNs)':
    'רשומה לא קיימת (בדקו את נתיבי המשתמשים והקבוצות)',
  'the directory refused the read-only bind account (invalid credentials)':
    'הספרייה דחתה את חשבון הקריאה (פרטי התחברות שגויים)',
  'the bind account lacks read rights': 'לחשבון הקריאה אין הרשאות קריאה',
  'the directory is busy': 'הספרייה עמוסה',
  'the directory is unavailable': 'הספרייה אינה זמינה',
  'the directory is unwilling to perform the request': 'הספרייה מסרבת לבצע את הבקשה',
};

const NOUNS: Record<string, string> = {
  Organization: 'הארגון',
  Group: 'הקבוצה',
  Team: 'הצוות',
  Person: 'האדם',
  Membership: 'החברות בצוות',
  'Role assignment': 'הקצאת התפקיד',
  Grade: 'הדרגה',
  Connection: 'החיבור',
  Assessment: 'ההערכה',
};

type Rule = [RegExp, (...m: string[]) => string];

const PATTERNS: Rule[] = [
  [/^(.+) not found$/, (w) => (NOUNS[w] ? `${NOUNS[w]} לא נמצא/ה` : `לא נמצא: ${w}`)],
  [
    /^This person is already mapped to another (\w+) account \((.+)\); unmap it first$/,
    (s, id) => `האדם כבר ממופה לחשבון ${s} אחר (${id}); בטלו את המיפוי קודם`,
  ],
  [
    /^End the (\d+) current membership\(s\) before deactivating the team$/,
    (n) => `סיימו את ${n} החברויות הנוכחיות בצוות לפני השבתת הצוות`,
  ],
  [/^A connection named "(.+)" already exists$/, (n) => `כבר קיים חיבור בשם "${n}"`],
  [/^(\w+) is implicit and cannot be assigned$/, (r) => `${r} ניתן לכולם ואי אפשר להקצות אותו`],
  [/^(\w+) can only be assigned on: (.+)$/, (r, s) => `את ${r} אפשר להקצות רק על: ${s}`],
  [
    /^(.+) is not in this server's allowed source hosts \(EPI_SOURCE_HOSTS\)$/,
    (h) => `${h} אינו ברשימת המקורות המותרים בשרת הזה (EPI_SOURCE_HOSTS)`,
  ],
  [
    /^"(.+)" is not a Jira project key \(e\.g\. PAY\)$/,
    (p) => `"${p}" אינו מפתח פרויקט של Jira (לדוגמה PAY)`,
  ],
  [/^Group (.+) was not found in the directory\.$/, (g) => `הקבוצה ${g} לא נמצאה בספרייה.`],
  [
    /^Group (.+) is not mapped to a team; its (\d+) member\(s\) are not imported\.$/,
    (g, n) => `הקבוצה ${g} אינה ממופה לצוות; ${n} החברים בה אינם מיובאים.`,
  ],
  [
    /^In groups of (\d+) teams \((.+)\); add them to one team only\.$/,
    (n, t) => `חבר בקבוצות של ${n} צוותים (${t}); השאירו אותו בצוות אחד בלבד.`,
  ],
  [/^Several EPI people have the e-mail (.+)\.$/, (e) => `לכמה אנשים ב-EPI יש את הדוא״ל ${e}.`],
  [
    /^The EPI person with (.+) is linked to another directory account\.$/,
    (e) => `האדם ב-EPI עם ${e} מקושר לחשבון אחר בספרייה.`,
  ],
  [
    /^TLS: the directory's certificate is not trusted \((.*)\); check EPI_LDAP_CA_FILE$/,
    (d) => `TLS: אין אמון בתעודת הספרייה (${d}); בדקו את EPI_LDAP_CA_FILE`,
  ],
  [/^cannot reach the directory \((.*)\)$/, (d) => `אין גישה לספרייה (${d})`],
  [/^directory error: (.*)$/, (d) => `שגיאת ספרייה: ${d}`],
  [
    /^Jira (.+): token accepted, (\d+) statuses visible, (\d+) issues in the backfill window\.$/,
    (v, s, i) => `Jira ${v}: הטוקן התקבל, ${s} סטטוסים גלויים, ${i} פריטים בחלון המילוי.`,
  ],
  [
    /^GitLab (.+): token accepted, (\d+) project\(s\) readable\.$/,
    (v, p) => `GitLab ${v}: הטוקן התקבל, ${p} פרויקטים קריאים.`,
  ],
  [
    /^Secret (\w+) is not provided \(on the server: \.\/epi\.sh source-token (\w+)\)$/,
    (r, r2) => `הטוקן ${r} לא סופק (בשרת: ./epi.sh source-token ${r2})`,
  ],
  [
    /^Secret (\w+) is not provided \(set (\w+) to a root-only file\)$/,
    (r, f) => `הטוקן ${r} לא סופק (הגדירו את ${f} לקובץ שרק root יכול לקרוא)`,
  ],
  [/^Secret (\w+): (.+) is not readable$/, (r, w) => `הטוקן ${r}: אי אפשר לקרוא את ${w}`],
  [/^Secret (\w+): (.+) is empty$/, (r, w) => `הטוקן ${r}: ${w} ריק`],
  [/^(\S+): network error \((.+)\)$/, (u, k) => `${u}: שגיאת רשת (${k})`],
  [/^A sync for "(.+)" is already running$/, (n) => `סנכרון של "${n}" כבר רץ`],
  [/^No (Jira|GitLab) connection named "(.+)"$/, (s, n) => `אין חיבור ${s} בשם "${n}"`],
  [/^(Jira|GitLab) connection "(.+)" is disabled$/, (s, n) => `חיבור ה-${s} "${n}" כבוי`],
  // Field validation (class-validator); the field name is kept.
  [/^(\S+) should not be empty$/, (f) => `השדה ${f} לא יכול להיות ריק`],
  [/^(\S+) must be a string$/, (f) => `השדה ${f} חייב להיות טקסט`],
  [/^(\S+) must be a UUID$/, (f) => `השדה ${f} חייב להיות מזהה תקין`],
  [/^(\S+) must be an array$/, (f) => `השדה ${f} חייב להיות רשימה`],
  [/^(\S+) must be a boolean value$/, (f) => `השדה ${f} חייב להיות כן/לא`],
  [/^(\S+) must be an integer number$/, (f) => `השדה ${f} חייב להיות מספר שלם`],
  [/^(\S+) must be an email$/, (f) => `השדה ${f} חייב להיות כתובת דוא״ל`],
  [/^(\S+) must be a valid ISO 8601 date string$/, (f) => `השדה ${f} חייב להיות תאריך תקין`],
  [
    /^(\S+) must be one of the following values: (.*)$/,
    (f, v) => `השדה ${f} חייב להיות אחד מהערכים: ${v}`,
  ],
  [/^(\S+) must not be less than (\d+)$/, (f, n) => `השדה ${f} לא יכול להיות קטן מ-${n}`],
  [/^(\S+) must not be greater than (\d+)$/, (f, n) => `השדה ${f} לא יכול להיות גדול מ-${n}`],
  [
    /^(\S+) must be longer than or equal to (\d+) characters$/,
    (f, n) => `השדה ${f} חייב להכיל לפחות ${n} תווים`,
  ],
  [
    /^(\S+) must be shorter than or equal to (\d+) characters$/,
    (f, n) => `השדה ${f} יכול להכיל לכל היותר ${n} תווים`,
  ],
  [/^property (\S+) should not exist$/, (f) => `השדה ${f} אינו מוכר`],
];

/** The message in the requested language; unknown messages stay as they are (English). */
export function translateMessage(message: string, locale: Locale): string {
  if (locale !== 'he') return message;
  const exact = EXACT[message];
  if (exact) return exact;
  for (const [re, fn] of PATTERNS) {
    const m = re.exec(message);
    if (m) return fn(...m.slice(1));
  }
  return message;
}

export const translateMessages = <T extends string | string[]>(m: T, locale: Locale): T =>
  (Array.isArray(m) ? m.map((x) => translateMessage(x, locale)) : translateMessage(m, locale)) as T;
