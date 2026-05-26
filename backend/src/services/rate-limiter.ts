export type LimitKind = 'single' | 'deep';

export interface ConsumeResult {
  allowed: boolean;
  remaining: number;
  retryAfter: number; // seconds until midnight UTC
}

const CAPS: Record<LimitKind, { perDevice: number; perIp: number }> = {
  single: { perDevice: 20, perIp: 20 },
  deep:   { perDevice: 3,  perIp: 6 }
};

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function secondsUntilMidnightUtc(): number {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return Math.ceil((next.getTime() - now.getTime()) / 1000);
}

interface CounterKey { bucket: string; kind: LimitKind; day: string; }

function keyString(k: CounterKey): string {
  return `${k.bucket}|${k.kind}|${k.day}`;
}

export interface RateLimiter {
  consume(deviceId: string, ip: string, kind: LimitKind): ConsumeResult;
}

export function createRateLimiter(): RateLimiter {
  const counts = new Map<string, number>();

  function bump(bucket: string, kind: LimitKind, day: string): number {
    const k = keyString({ bucket, kind, day });
    const next = (counts.get(k) ?? 0) + 1;
    counts.set(k, next);
    return next;
  }

  return {
    consume(deviceId, ip, kind) {
      const { perDevice, perIp } = CAPS[kind];
      const day = todayUtc();
      const deviceCount = bump(`device:${deviceId}`, kind, day);
      const ipCount = bump(`ip:${ip}`, kind, day);
      const allowed = deviceCount <= perDevice && ipCount <= perIp;
      const remaining = Math.max(0, Math.min(perDevice - deviceCount, perIp - ipCount));
      return {
        allowed,
        remaining,
        retryAfter: allowed ? 0 : secondsUntilMidnightUtc()
      };
    }
  };
}
