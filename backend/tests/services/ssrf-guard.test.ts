import {
  assertUrlNotBlocked,
  isBlockedHostname,
  isBlockedIp,
  type HostResolver
} from '../../src/services/ssrf-guard.js';

describe('isBlockedIp', () => {
  it('blocks RFC1918 private ranges', () => {
    expect(isBlockedIp('10.0.0.1')).toBe(true);
    expect(isBlockedIp('172.16.0.1')).toBe(true);
    expect(isBlockedIp('172.31.255.255')).toBe(true);
    expect(isBlockedIp('192.168.1.1')).toBe(true);
  });
  it('blocks loopback', () => {
    expect(isBlockedIp('127.0.0.1')).toBe(true);
    expect(isBlockedIp('127.99.99.99')).toBe(true);
  });
  it('blocks link-local + AWS metadata', () => {
    expect(isBlockedIp('169.254.169.254')).toBe(true);
    expect(isBlockedIp('169.254.0.1')).toBe(true);
  });
  it('blocks 0.0.0.0/8', () => {
    expect(isBlockedIp('0.0.0.0')).toBe(true);
  });
  it('blocks IPv6 loopback + link-local', () => {
    expect(isBlockedIp('::1')).toBe(true);
    expect(isBlockedIp('fe80::1')).toBe(true);
  });
  it('blocks IPv6 ULA fc00::/7', () => {
    expect(isBlockedIp('fc00::1')).toBe(true);
    expect(isBlockedIp('fd00::1')).toBe(true);
  });
  it('does NOT block public IPv4', () => {
    expect(isBlockedIp('1.1.1.1')).toBe(false);
    expect(isBlockedIp('8.8.8.8')).toBe(false);
    expect(isBlockedIp('151.101.1.81')).toBe(false);
  });
  it('returns true for malformed input (fail closed)', () => {
    expect(isBlockedIp('not-an-ip')).toBe(true);
    expect(isBlockedIp('')).toBe(true);
  });
});

// Fake resolvers so these tests never touch real DNS.
const resolvesTo = (...ips: string[]): HostResolver => async () => ips.map((address) => ({ address }));
const failingResolver: HostResolver = async () => { throw new Error('ENOTFOUND'); };
const unusedResolver: HostResolver = async () => { throw new Error('resolver should not be called'); };

describe('isBlockedHostname', () => {
  it('blocks localhost without resolving', async () => {
    expect(await isBlockedHostname('localhost', unusedResolver)).toBe(true);
  });
  it('blocks .local / .internal suffixes without resolving', async () => {
    expect(await isBlockedHostname('printer.local', unusedResolver)).toBe(true);
    expect(await isBlockedHostname('db.internal', unusedResolver)).toBe(true);
  });
  it('does not block a domain that resolves to a public IP', async () => {
    expect(await isBlockedHostname('example.com', resolvesTo('93.184.216.34'))).toBe(false);
  });
  it('blocks a public-looking domain that resolves to a private IP', async () => {
    expect(await isBlockedHostname('evil.example', resolvesTo('10.0.0.5'))).toBe(true);
    expect(await isBlockedHostname('evil.example', resolvesTo('169.254.169.254'))).toBe(true);
  });
  it('blocks if ANY resolved address is private', async () => {
    expect(await isBlockedHostname('mixed.example', resolvesTo('93.184.216.34', '127.0.0.1'))).toBe(true);
  });
  it('fails closed when DNS lookup fails', async () => {
    expect(await isBlockedHostname('nxdomain.example', failingResolver)).toBe(true);
  });
});

describe('assertUrlNotBlocked', () => {
  it('rejects an unparseable URL', async () => {
    expect(await assertUrlNotBlocked('not a url', unusedResolver)).toEqual({ ok: false, reason: 'Invalid URL' });
  });
  it('allows a URL whose host resolves publicly', async () => {
    expect(await assertUrlNotBlocked('https://example.com/a', resolvesTo('93.184.216.34'))).toEqual({ ok: true });
  });
  it('rejects a URL whose host resolves privately', async () => {
    const result = await assertUrlNotBlocked('https://evil.example/a', resolvesTo('192.168.1.10'));
    expect(result.ok).toBe(false);
  });
});
