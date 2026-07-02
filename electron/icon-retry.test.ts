import { describe, expect, it } from 'vitest';
import { canRetryIcon, nextIconFailure } from './icon-retry.mjs';

describe('window icon retry schedule', () => {
  it('backs off failed requests and retries again when due', () => {
    const first = nextIconFailure(undefined, 10_000);
    expect(first).toEqual({ attempts: 1, delay: 1_000, nextRetryAt: 11_000 });
    expect(canRetryIcon(first, 10_999)).toBe(false);
    expect(canRetryIcon(first, 11_000)).toBe(true);

    const second = nextIconFailure(first, 11_000);
    const third = nextIconFailure(second, 14_000);
    const fourth = nextIconFailure(third, 24_000);
    const fifth = nextIconFailure(fourth, 54_000);
    expect([second.delay, third.delay, fourth.delay, fifth.delay]).toEqual([3_000, 10_000, 30_000, 30_000]);
  });
});
