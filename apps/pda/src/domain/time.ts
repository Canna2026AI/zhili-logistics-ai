export function isFutureInstant(value: unknown, now = Date.now()) {
  if (typeof value !== 'string') return false;
  const instant = Date.parse(value);
  return Number.isFinite(instant) && instant > now;
}
