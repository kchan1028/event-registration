import type { AuthProvider } from '../../src/server/auth';
import { testAuth } from '../../src/server/auth';

/**
 * Fake sign-in for API tests. `as(email)` sends `Authorization: Bearer test:<email>` for a
 * fictional `.test` address. With `defaultEmail`, a request without that header is treated as
 * that person, so tests about other behavior need no sign-in plumbing. Authorization tests use
 * `fakeAuth()` with no default, so an unsigned request is refused.
 */
export function fakeAuth(opts: { defaultEmail?: string } = {}): AuthProvider {
  const inner = testAuth();
  return {
    async verify(req) {
      if (!req.headers.authorization && opts.defaultEmail) return { providerUserId: `test|${opts.defaultEmail}`, email: opts.defaultEmail };
      return inner.verify(req);
    },
    email: inner.email,
  };
}

export const DEFAULT_TEST_ORGANIZER = 'organizer@example.test';

export function as(email: string) {
  return { authorization: `Bearer test:${email}` };
}
