/**
 * The address the server listens on. Defaults to 127.0.0.1 (this computer only); a platform
 * sets HOST=0.0.0.0. Every API route requires sign-in (ADR 0003) except health, the public
 * event list and event pages, and the Stripe webhook, which is trusted only after its signature
 * verifies. So a network address is allowed. Until MFA ships (Phase 3) the app holds fictional
 * data only; see SECURITY.md.
 */
export function listenHost(env: Record<string, string | undefined> = process.env): string {
  return env.HOST?.trim() || '127.0.0.1';
}
