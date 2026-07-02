export const ICON_RETRY_DELAYS_MS = Object.freeze([1_000, 3_000, 10_000, 30_000]);

export function nextIconFailure(previous, now = Date.now()) {
  const attempts = (previous?.attempts ?? 0) + 1;
  const delay = ICON_RETRY_DELAYS_MS[Math.min(attempts - 1, ICON_RETRY_DELAYS_MS.length - 1)];
  return { attempts, delay, nextRetryAt: now + delay };
}

export function canRetryIcon(failure, now = Date.now()) {
  return !failure || now >= failure.nextRetryAt;
}
