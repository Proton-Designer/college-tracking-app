import * as Linking from "expo-linking";

/**
 * The email-confirmation / password-reset redirect target. `Linking.createURL` resolves
 * to the right scheme for wherever this is actually running: `exp://.../--/auth/callback`
 * inside Expo Go during development, `collegeos://auth/callback` in a standalone/dev-client
 * build — the same code works in both without a build-time branch. app.json's `scheme`
 * is `collegeos` (see docs/SUPABASE_SETUP.md's Redirect URLs table).
 */
export function getAuthCallbackUrl(): string {
  return Linking.createURL("/auth/callback");
}

/** Password-reset links point straight at /reset-password (mirrors web's forgot-password
 *  page, which sets `redirectTo` to `${origin}/reset-password` directly) rather than
 *  through the shared signup-confirmation callback -- each screen exchanges its own code. */
export function getResetPasswordUrl(): string {
  return Linking.createURL("/reset-password");
}
