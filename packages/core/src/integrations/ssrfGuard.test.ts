import { describe, expect, it } from 'vitest';
import { checkUrlSchemeAndHostname, isPrivateOrReservedIp } from './ssrfGuard';

describe('isPrivateOrReservedIp', () => {
  it('flags every RFC1918 private range', () => {
    expect(isPrivateOrReservedIp('10.0.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('172.16.5.5')).toBe(true);
    expect(isPrivateOrReservedIp('172.31.255.255')).toBe(true);
    expect(isPrivateOrReservedIp('192.168.1.1')).toBe(true);
  });

  it('flags loopback', () => {
    expect(isPrivateOrReservedIp('127.0.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('127.255.255.255')).toBe(true);
  });

  it('flags the cloud metadata address specifically -- 169.254.169.254', () => {
    expect(isPrivateOrReservedIp('169.254.169.254')).toBe(true);
  });

  it('flags IPv6 loopback and link-local/unique-local', () => {
    expect(isPrivateOrReservedIp('::1')).toBe(true);
    expect(isPrivateOrReservedIp('fe80::1')).toBe(true);
    expect(isPrivateOrReservedIp('fc00::1')).toBe(true);
    expect(isPrivateOrReservedIp('fd12:3456::1')).toBe(true);
  });

  it('flags an IPv4-mapped IPv6 address by its embedded IPv4 range', () => {
    expect(isPrivateOrReservedIp('::ffff:127.0.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('::ffff:8.8.8.8')).toBe(false);
  });

  it('does not flag real public IPs', () => {
    expect(isPrivateOrReservedIp('8.8.8.8')).toBe(false);
    expect(isPrivateOrReservedIp('1.1.1.1')).toBe(false);
    expect(isPrivateOrReservedIp('93.184.216.34')).toBe(false);
  });

  it('does not false-positive on a public IP that merely starts similarly to a private range', () => {
    // 172.32.x.x is outside the 172.16.0.0/12 range (which ends at 172.31.255.255).
    expect(isPrivateOrReservedIp('172.32.0.1')).toBe(false);
    // 11.x.x.x is outside 10.0.0.0/8.
    expect(isPrivateOrReservedIp('11.0.0.1')).toBe(false);
  });
});

describe('checkUrlSchemeAndHostname', () => {
  it('accepts a real https URL', () => {
    expect(checkUrlSchemeAndHostname('https://purdue.brightspace.com/d2l/le/calendar/feed/abc123.ics')).toEqual({ ok: true, reason: null });
  });

  it('rejects a non-https scheme', () => {
    expect(checkUrlSchemeAndHostname('http://purdue.brightspace.com/feed.ics').ok).toBe(false);
    expect(checkUrlSchemeAndHostname('file:///etc/passwd').ok).toBe(false);
    expect(checkUrlSchemeAndHostname('ftp://example.com/feed.ics').ok).toBe(false);
  });

  it('rejects an unparseable URL rather than throwing', () => {
    expect(checkUrlSchemeAndHostname('not a url at all').ok).toBe(false);
  });

  it('rejects the internal hostnames a server-side fetch could otherwise reach', () => {
    expect(checkUrlSchemeAndHostname('https://localhost/feed.ics').ok).toBe(false);
    expect(checkUrlSchemeAndHostname('https://host.docker.internal/feed.ics').ok).toBe(false);
  });
});
