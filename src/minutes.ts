/** Numeric-only editor drafts; empty/trailing decimal are allowed while typing. */
export function isMinutesDraft(raw: unknown): raw is string {
  return typeof raw === 'string' && raw.length <= 12 && /^(?:\d+(?:[.,]\d*)?)?$/.test(raw);
}
