/**
 * Localization: all UI strings live in message catalogs. English ships first; a Hebrew catalog
 * (dir="rtl") can be added without code changes — layout uses CSS logical properties.
 */
const en = {
  appName: 'EPI',
  appTagline: 'Engineering Performance & Improvement',
  syntheticBanner: 'Demo mode — all people and data shown are synthetic.',
  navHome: 'My view',
  navOrganization: 'Organization',
  navReviews: 'Reviews',
  navCatalog: 'KPI catalog',
  navAdmin: 'Administration',
  signOut: 'Sign out',
  loading: 'Loading…',
  retry: 'Try again',
  errorTitle: 'Something went wrong',
  notFoundTitle: 'Not available',
  notFoundBody: 'This item does not exist or is outside your access.',
  sessionExpired: 'Your session has ended. Please sign in again.',
  loginTitle: 'Sign in to EPI',
  loginDemoHint: 'Choose a synthetic person to explore what each role can see.',
  loginNoMethod:
    'No sign-in method is configured. Ask your administrator to configure single sign-on.',
  loginSso: 'Sign in with your organization account',
  loginOr: 'or explore the demo',
  loginErrorNotProvisioned:
    'You signed in successfully, but you do not have an EPI account yet. Ask your EPI administrator to add you.',
  loginErrorInactive: 'Your EPI account is deactivated. Contact your EPI administrator.',
  loginErrorExpired: 'The sign-in attempt expired or was interrupted. Please try again.',
  loginErrorIdp: 'Sign-in was not completed by the identity provider. Please try again.',
  loginErrorUnavailable: 'Single sign-on is temporarily unavailable. Please try again later.',
  window: 'Window',
  howCalculated: 'How calculated?',
  sample: 'Sample',
  confidence: 'Confidence',
  dataAsOf: 'Data as of',
  noData: 'No data yet',
  na: 'N/A',
  suppressed: 'Hidden: group too small',
  suppressedHint:
    'Aggregates for fewer than the minimum number of people are hidden to protect privacy.',
  proxyLabel: 'Proxy measure',
  trendImproved: 'Improved',
  trendDeteriorated: 'Needs attention',
  trendStable: 'Stable',
  trendInsufficient: 'Not enough data for a trend',
  trendNoBaseline: 'No baseline',
  trendVsPrevious: 'vs previous window',
  members: 'Members',
  teams: 'Teams',
  grade: 'Grade',
  lead: 'Lead',
  kpis: 'Engineering KPIs',
  kpiDisclaimer:
    'KPIs describe how work flows. They are not individual performance scores and must be read with context.',
  assessments: 'Monthly assessments',
  noAssessments: 'No assessments yet.',
  newAssessment: 'Monthly assessment',
  independence: 'Independence',
  growth: 'Growth',
  evidence: 'Evidence',
  evidenceHint: 'Concrete examples from this month (at least 20 characters).',
  saveDraft: 'Save draft',
  submit: 'Submit',
  saved: 'Saved.',
  submitted: 'Submitted.',
  draft: 'Draft',
  submittedStatus: 'Submitted',
  myTeams: 'My teams',
  managedTeams: 'Teams you manage',
  myKpis: 'My flow KPIs',
  teamAggregate: 'Team aggregate',
  accessManaged: 'Managed',
  accessAggregate: 'Aggregate only',
  accessStructure: 'Structure only',
  evidenceItems: 'Items behind this value',
  excluded: 'Excluded',
  formula: 'Formula',
  population: 'Population',
  source: 'Source',
  exclusions: 'Exclusions',
  minimumSample: 'Minimum sample',
  caveats: 'Limitations',
  actions: 'Possible next actions',
  example: 'Worked example (computed by the engine)',
  version: 'Version',
  implementation: 'Implementation',
  close: 'Close',
  question: 'Question',
  structureOnly: 'As an administrator you can see structure, not metrics or reviews.',
  emptyOrg: 'Nothing in your scope yet.',
};

export type MessageKey = keyof typeof en;
const catalogs: Record<string, Record<MessageKey, string>> = { en };
let current: Record<MessageKey, string> = en;

export function setLocale(locale: string): void {
  current = catalogs[locale] ?? en;
}

export function t(key: MessageKey): string {
  return current[key];
}
