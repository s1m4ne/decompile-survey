interface BibtexTextProps {
  value?: string | null;
  className?: string;
}

const BRACE_REGEX = /[{}]/g;

export function normalizeBibtexText(value?: string | null): string {
  if (!value) return '';
  return value.replace(BRACE_REGEX, '');
}

export function BibtexText({ value, className }: BibtexTextProps) {
  const normalized = normalizeBibtexText(value);
  if (!normalized) return null;
  return <span className={className}>{normalized}</span>;
}
