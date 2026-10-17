import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';

// IPv4 CIDR blocks to refuse.
const IPV4_BLOCKS: Array<[number, number]> = [
  [ipToInt('0.0.0.0'),    8],
  [ipToInt('10.0.0.0'),   8],
  [ipToInt('100.64.0.0'), 10],   // CGNAT
  [ipToInt('127.0.0.0'),  8],
  [ipToInt('169.254.0.0'),16],   // link-local + AWS metadata
  [ipToInt('172.16.0.0'), 12],
  [ipToInt('192.0.0.0'),  24],
  [ipToInt('192.168.0.0'),16],
  [ipToInt('198.18.0.0'), 15],
  [ipToInt('224.0.0.0'),  4],    // multicast
  [ipToInt('240.0.0.0'),  4]     // reserved
];

function ipToInt(ip: string): number {
  return ip.split('.').reduce((acc, oct) => (acc * 256 + Number(oct)) >>> 0, 0);
}

function inCidr(ipInt: number, baseInt: number, prefix: number): boolean {
  if (prefix === 0) return true;
  const mask = (0xffffffff << (32 - prefix)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

function isBlockedIpv4(ip: string): boolean {
  const n = ipToInt(ip);
  return IPV4_BLOCKS.some(([base, prefix]) => inCidr(n, base, prefix));
}

function isBlockedIpv6(ip: string): boolean {
  const lc = ip.toLowerCase();
  if (lc === '::1' || lc === '::') return true;
  if (lc.startsWith('fe80:') || lc.startsWith('fe9') || lc.startsWith('fea') || lc.startsWith('feb')) return true;
  if (lc.startsWith('fc') || lc.startsWith('fd')) return true;
  if (lc.startsWith('::ffff:')) {
    const v4 = lc.slice('::ffff:'.length);
    if (isIP(v4) === 4) return isBlockedIpv4(v4);
  }
  return false;
}

export function isBlockedIp(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return isBlockedIpv4(ip);
  if (kind === 6) return isBlockedIpv6(ip);
  return true; // unknown format → fail closed
}

const STATIC_BLOCKED_HOSTS = new Set(['localhost', 'localhost.localdomain', 'ip6-localhost']);

/** Resolves a hostname to all of its addresses. Injectable so tests don't hit real DNS. */
export type HostResolver = (hostname: string) => Promise<Array<{ address: string }>>;

const defaultResolver: HostResolver = (hostname) => dnsLookup(hostname, { all: true });

export async function isBlockedHostname(
  hostname: string,
  resolve: HostResolver = defaultResolver
): Promise<boolean> {
  const lc = hostname.toLowerCase();
  if (STATIC_BLOCKED_HOSTS.has(lc)) return true;
  if (lc.endsWith('.local') || lc.endsWith('.internal') || lc.endsWith('.localhost')) return true;
  if (isIP(lc)) return isBlockedIp(lc);
  try {
    const addresses = await resolve(lc);
    for (const { address } of addresses) {
      if (isBlockedIp(address)) return true;
    }
    return false;
  } catch {
    return true;
  }
}

export async function assertUrlNotBlocked(
  url: string,
  resolve: HostResolver = defaultResolver
): Promise<{ ok: true } | { ok: false; reason: string }> {
  let parsed: URL;
  try { parsed = new URL(url); } catch { return { ok: false, reason: 'Invalid URL' }; }
  if (await isBlockedHostname(parsed.hostname, resolve)) {
    return { ok: false, reason: `Refusing to fetch ${parsed.hostname}: blocked address space.` };
  }
  return { ok: true };
}
