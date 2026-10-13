/** Authored inline icons (DESIGN.md §5): currentColor, 1.75 stroke, decorative unless labelled. */
type Props = { className?: string };
const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
};

export function CloseIcon({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function ChevronIcon({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

/** EPI mark: three flow lines of decreasing length (work moving to done). */
export function MarkIcon({ className }: Props) {
  return (
    <svg {...base} strokeWidth={2.25} className={className}>
      <path d="M5 7h14M5 12h10M5 17h6" />
    </svg>
  );
}
