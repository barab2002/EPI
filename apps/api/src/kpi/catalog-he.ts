/**
 * Hebrew texts of the KPI catalog (ADR-035 stage 3). Same structure and the same numbers as the
 * English definitions in catalog.ts. Formulas are math only (shown left-to-right; the population
 * text says which items count), because Hebrew words inside a left-to-right formula reorder; catalog-he.spec.ts fails when a KPI, a list item or a number
 * is missing. Titles match the web catalog (apps/web/src/i18n.ts kpi*).
 */
export interface KpiTexts {
  title: string;
  question: string;
  formula: string;
  population: string;
  source: string;
  exclusions: string[];
  minimumSample: string;
  caveats: string[];
  possibleActions: string[];
  exampleDescription: string;
}

export const KPI_TEXTS_HE: Record<string, KpiTexts> = {
  CYCLE_TIME: {
    title: 'זמן מחזור',
    question: 'כמה זמן לוקחת עבודה מרגע שהתחילה?',
    formula: 'median((done_at − started_at) / 86400 s)',
    population:
      'פריטי עבודה שהמעבר האחרון שלהם הוא ל-Done בתוך [תחילת החלון, סוף החלון). שיוך לצוות לפי חברות הצוות של האחראי בזמן ה-Done.',
    source:
      'היסטוריית הסטטוסים של Jira ממופה לקטגוריות סטטוס (סינתטית בהדגמה). התחלה: הכניסה הראשונה לסטטוס פעיל — In Progress, Blocked, Review או QA. סיום: הכניסה האחרונה ל-Done.',
    exclusions: [
      'פריטים שלא התחילו (Done בלי סטטוס פעיל) — מדווחים כמוחרגים',
      'מרווחים שליליים (שגיאות נתונים) — מדווחים כמוחרגים',
      'פריטים שנפתחו מחדש נספרים פעם אחת, עד ה-Done האחרון',
    ],
    minimumSample: '≥10 פריטים: ביטחון רגיל; 5–9: ביטחון נמוך; <5: לא זמין (בלי ערך ובלי מגמה)',
    caveats: [
      'נמוך יותר טוב רק כשהאיכות ותמהיל העבודה נשארים דומים.',
      'השוו בתוך אותו סוג עבודה ואותה רמת מורכבות; זה אינו ציון תפוקה.',
      'ימים קלנדריים, כולל סופי שבוע וחגים.',
    ],
    possibleActions: [
      'פתחו את הפריטים האיטיים ביותר ובדקו זמני חסימה או המתנה.',
      'דונו בתכנון בפיצול פריטים גדולים.',
    ],
    exampleDescription:
      '5 פריטים שהושלמו לקחו 2, 3, 4, 6 ו-9 ימים ← חציון 4 ימים (ביטחון נמוך: 5 פריטים).',
  },
  WORK_ITEM_AGING: {
    title: 'גיל פריטים פתוחים',
    question: 'איזו עבודה פתוחה תקועה?',
    formula: 'age_days = (snapshot_time − started_at) / 86400 s; median, P85, oldest',
    population:
      'פריטים שהתחילו עד רגע התמונה ואינם Done ברגע זה. שיוך לצוות לפי חברות הצוות של האחראי ברגע התמונה.',
    source: 'היסטוריית הסטטוסים של Jira ממופה לקטגוריות סטטוס (סינתטית בהדגמה).',
    exclusions: ['פריטי Backlog שלא התחילו', 'פריטים שהם Done ברגע התמונה'],
    minimumSample:
      '≥10 פריטים פתוחים: רגיל; 5–9: נמוך; <5: החציון לא זמין (הפריטים הוותיקים עדיין מוצגים למנהלים)',
    caveats: [
      'P85 מחושב באינטרפולציה לינארית בין הדירוגים הקרובים.',
      'החילו מדיניות אחידה של סוגי עבודה וסטטוסים בכל הצוותים.',
    ],
    possibleActions: ['עברו על הפריטים הוותיקים בישיבת הבוקר; בדקו חסימות או היקף לא ברור.'],
    exampleDescription:
      'פריטים פתוחים בני 2, 3, 5, 8 ו-20 ימים ← חציון 5 ימים, P85 12.8 ימים; הפריט בן 20 הימים מסומן.',
  },
  REVIEW_WAITING_TIME: {
    title: 'זמן המתנה לסקירה',
    question: 'כמה זמן ממתינה בקשת סקירה?',
    formula: 'median(first_response_at(requested_reviewer) − review_requested_at)',
    population:
      'בקשות סקירה מפורשות שנשלחו בתוך החלון על MR שנכתבו בידי חברי הישות (חברות בזמן יצירת ה-MR).',
    source: 'אירועי בקשת סוקר ודיונים ב-MR של GitLab (סינתטיים בהדגמה).',
    exclusions: [
      'הערות בוטים, הערות מערכת ותגובות של הכותב לעצמו',
      'בקשות שעדיין לא נענו (מוצגות בנפרד כמוחרגות)',
    ],
    minimumSample: '≥10 בקשות: רגיל; 5–9: נמוך; <5: לא זמין',
    caveats: [
      'אות לתהליך הצוות. לעולם אין לפרש אותו כתפוקה של כותב ה-MR.',
      'שעות קלנדריות, כולל לילות וסופי שבוע.',
      'אם המקור לא חושף אירועי בקשת סוקר, EPI מציג במקומו את המדד העקיף המסומן בנפרד MR_OPEN_TO_FIRST_REVIEW.',
    ],
    possibleActions: ['הסכימו על ציפייה צוותית לזמן תגובה לסקירה; אזנו את עומס הסוקרים.'],
    exampleDescription:
      'שלוש בקשות נענו אחרי 4, 8 ו-12 שעות ← חציון 8 שעות (בדוגמה סף מינימום 3 כדי שהמדגם הקטן יחושב).',
  },
  MR_OPEN_TO_FIRST_REVIEW: {
    title: 'זמן עד סקירה ראשונה (עקיף)',
    question: 'כמה זמן עד ש-MR מקבל סקירה אנושית ראשונה?',
    formula: 'median(first_human_non_author_note_at − mr_created_at)',
    population: 'MR שנפתחו בתוך החלון בידי חברי הישות.',
    source: 'דיונים ב-MR של GitLab (סינתטיים בהדגמה).',
    exclusions: ['הערות בוטים, הערות מערכת ותגובות של הכותב לעצמו', 'MR שעדיין לא נסקרו'],
    minimumSample: '≥10 MR: רגיל; 5–9: נמוך; <5: לא זמין',
    caveats: ['מדד עקיף: אינו מודד את הזמן מבקשה לסקירה. כולל זמן שלפני שהתבקש סוקר.'],
    possibleActions: ['בקשו סוקרים כבר בפתיחת ה-MR; הפעילו אירועי בקשת סוקר אם אפשר.'],
    exampleDescription: 'שלושה MR נסקרו לראשונה 4, 8 ו-12 שעות אחרי הפתיחה ← חציון 8 שעות.',
  },
};
