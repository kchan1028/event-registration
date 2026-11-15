/**
 * The address the server listens on. Defaults to 127.0.0.1 (this computer only); a platform
 * sets HOST=0.0.0.0. Every API route except health and the public event pages requires
 * sign-in (ADR 0003), so a network address is allowed. Until MFA ships (Phase 3) the app holds
 * fictional data only; see SECURITY.md.
 */
export function listenHost(env: Record<string, string | undefined> = process.env): string {
  return env.HOST?.trim() || '127.0.0.1';
}
