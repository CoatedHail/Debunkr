import { createRateLimiter } from '../../src/services/rate-limiter.js';

describe('RateLimiter', () => {
  it('allows up to 20 single checks per device per day', () => {
    const rl = createRateLimiter();
    for (let i = 0; i < 20; i++) {
      const r = rl.consume('dev-1', '1.2.3.4', 'single');
      expect(r.allowed).toBe(true);
    }
    const overflow = rl.consume('dev-1', '1.2.3.4', 'single');
    expect(overflow.allowed).toBe(false);
    expect(overflow.retryAfter).toBeGreaterThan(0);
  });

  it('allows up to 3 deep analyses per device per day', () => {
    const rl = createRateLimiter();
    for (let i = 0; i < 3; i++) {
      const r = rl.consume('dev-1', '1.2.3.4', 'deep');
      expect(r.allowed).toBe(true);
    }
    expect(rl.consume('dev-1', '1.2.3.4', 'deep').allowed).toBe(false);
  });

  it('separate counters for single vs deep', () => {
    const rl = createRateLimiter();
    for (let i = 0; i < 20; i++) rl.consume('dev-2', '1.2.3.4', 'single');
    expect(rl.consume('dev-2', '1.2.3.4', 'deep').allowed).toBe(true);
  });

  it('IP composite blocks reinstall bypass', () => {
    const rl = createRateLimiter();
    for (let i = 0; i < 20; i++) {
      expect(rl.consume(`dev-${i}`, '1.2.3.4', 'single').allowed).toBe(true);
    }
    expect(rl.consume('dev-21', '1.2.3.4', 'single').allowed).toBe(false);
  });
});
