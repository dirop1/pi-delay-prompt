// Pure helpers for pi-delay-prompt. No Pi imports here so tests stay dependency-free.

export const MAX_DELAY_MS = 180 * 60 * 1000;

/** Parse a delay argument into milliseconds. Plain numbers are minutes. */
export function parseDelay(raw) {
  if (raw === undefined || raw === null) return { ok: false, reason: 'empty' };
  const text = String(raw).trim().toLowerCase();
  if (!text) return { ok: false, reason: 'empty' };
  if (text === 'off' || text === 'cancel' || text === 'clear') return { ok: true, cancel: true };
  const match = text.match(/^(\d+(?:[.,]\d+)?)\s*(s|sec|secs|second|seconds|m|min|mins|minute|minutes)?$/);
  if (!match) return { ok: false, reason: 'unparseable' };
  const value = Number(match[1].replace(',', '.'));
  if (!Number.isFinite(value) || value <= 0) return { ok: false, reason: 'non-positive' };
  const unit = match[2] ?? 'm';
  const ms = value * (unit.startsWith('s') ? 1000 : 60 * 1000);
  if (ms < 1000) return { ok: false, reason: 'too-short' };
  if (ms > MAX_DELAY_MS) return { ok: false, reason: 'too-long' };
  return { ok: true, ms: Math.round(ms) };
}

/** Format a remaining duration as H:MM:SS or M:SS. */
export function formatRemaining(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const mm = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes);
  return `${hours > 0 ? hours + ':' : ''}${mm}:${String(seconds).padStart(2, '0')}`;
}

/** Short single-line preview of the delayed prompt. */
export function preview(text, max = 80) {
  const single = String(text).split('\n')[0] ?? '';
  if (single.length <= max) return single;
  return single.slice(0, max - 1) + '…';
}
