import { isBlockedHostname, isBlockedIp } from '../../src/services/ssrf-guard.js';

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

describe('isBlockedHostname', () => {
  it('blocks localhost', async () => {
    expect(await isBlockedHostname('localhost')).toBe(true);
  });
  it('does not block a public domain', async () => {
    // Hits real DNS. If test env has no DNS, this is a known limitation.
    expect(await isBlockedHostname('example.com')).toBe(false);
  });
});
