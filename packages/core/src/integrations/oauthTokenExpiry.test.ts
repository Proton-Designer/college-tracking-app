import { describe, expect, it } from 'vitest';
import { isTokenExpiringSoon } from './oauthTokenExpiry';

const NOW = '2026-08-19T12:00:00.000Z';

describe('isTokenExpiringSoon', () => {
  it('is false for a token that expires well in the future', () => {
    expect(isTokenExpiringSoon('2026-08-19T14:00:00.000Z', NOW)).toBe(false);
  });

  it('is true for a token that already expired', () => {
    expect(isTokenExpiringSoon('2026-08-19T11:00:00.000Z', NOW)).toBe(true);
  });

  it('is true when inside the default 5-minute refresh window', () => {
    expect(isTokenExpiringSoon('2026-08-19T12:04:00.000Z', NOW)).toBe(true);
  });

  it('is false just outside the default 5-minute window', () => {
    expect(isTokenExpiringSoon('2026-08-19T12:06:00.000Z', NOW)).toBe(false);
  });

  it('respects a custom threshold', () => {
    expect(isTokenExpiringSoon('2026-08-19T12:20:00.000Z', NOW, 30)).toBe(true);
    expect(isTokenExpiringSoon('2026-08-19T12:40:00.000Z', NOW, 30)).toBe(false);
  });

  it('never forces a refresh for a token with no known expiry, rather than guessing', () => {
    expect(isTokenExpiringSoon(null, NOW)).toBe(false);
  });
});
