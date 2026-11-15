/**
 * The address the server listens on. Defaults to 127.0.0.1 (this computer only).
 *
 * Sign-in (ADR 0003) is not built, so the app must not be reachable
 * from a network (AGENTS.md boundaries, SECURITY.md). Until it is, any non-loopback
 * HOST is refused, so a deploy made too early fails at start-up instead of exposing
 * the app. Remove this guard in the change that ships sign-in.
 */
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1']);

export function listenHost(env: Record<string, string | undefined> = process.env): string {
  const host = env.HOST?.trim() || '127.0.0.1';
  if (!LOOPBACK.has(host)) {
    throw new Error(
      `Refusing to listen on ${host}: sign-in (ADR 0003) is not built yet, so the app must stay on 127.0.0.1. See SECURITY.md and docs/runbooks/deploy-render.md.`,
    );
  }
  return host;
}
