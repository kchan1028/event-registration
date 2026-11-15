import { ClerkProvider, useAuth, useClerk, useUser } from '@clerk/react';
import { createContext, useContext, useState, type FormEvent, type ReactNode } from 'react';
import { setTokenGetter } from './api';
import { Field, Pending, ThemeToggle } from './ui';

/**
 * Sign-in in the browser (ADR 0003, Phase 2: passwordless email sign-in on Clerk).
 *
 * - With VITE_CLERK_PUBLISHABLE_KEY set, Clerk's sign-in window sends an emailed code or link.
 * - With VITE_AUTH_MODE=test (browser tests only), a plain form signs in as a fictional
 *   `.test` address; the server accepts it only when it runs with AUTH_MODE=test locally.
 * - With neither, the app says sign-in is not configured.
 *
 * Every API call carries the session token (api.ts). The server decides what each person may do.
 */

export interface Session {
  status: 'loading' | 'signed-out' | 'signed-in' | 'unconfigured';
  email: string | null;
  signIn: () => void;
  signOut: () => void;
  mode: 'clerk' | 'test' | 'none';
}

const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const s = useContext(SessionContext);
  if (!s) throw new Error('useSession must be used inside <AuthRoot>.');
  return s;
}

const env = import.meta.env as Record<string, string | undefined>;
const CLERK_KEY = env.VITE_CLERK_PUBLISHABLE_KEY?.trim();
const TEST_MODE = env.VITE_AUTH_MODE === 'test';

export function AuthRoot({ children }: { children: ReactNode }) {
  if (TEST_MODE) return <TestSession>{children}</TestSession>;
  if (CLERK_KEY)
    return (
      <ClerkProvider publishableKey={CLERK_KEY}>
        <ClerkSession>{children}</ClerkSession>
      </ClerkProvider>
    );
  const none: Session = { status: 'unconfigured', email: null, signIn: () => undefined, signOut: () => undefined, mode: 'none' };
  return <SessionContext.Provider value={none}>{children}</SessionContext.Provider>;
}

function ClerkSession({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, getToken, signOut } = useAuth();
  const { user } = useUser();
  const clerk = useClerk();
  // Set during render, before any child effect fetches, so the first request already carries the token.
  setTokenGetter(() => (isSignedIn ? getToken() : Promise.resolve(null)));
  const session: Session = {
    status: !isLoaded ? 'loading' : isSignedIn ? 'signed-in' : 'signed-out',
    email: user?.primaryEmailAddress?.emailAddress ?? null,
    signIn: () => clerk.openSignIn(),
    signOut: () => void signOut(),
    mode: 'clerk',
  };
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

const TEST_KEY = 'cyclereg.test-session';

function readTestEmail(): string | null {
  try {
    return sessionStorage.getItem(TEST_KEY);
  } catch {
    return null;
  }
}

function TestSession({ children }: { children: ReactNode }) {
  const [email, setEmail] = useState<string | null>(readTestEmail);
  const [asking, setAsking] = useState(false);
  setTokenGetter(async () => (email ? `test:${email}` : null));
  const session: Session = {
    status: email ? 'signed-in' : 'signed-out',
    email,
    signIn: () => setAsking(true),
    signOut: () => {
      try {
        sessionStorage.removeItem(TEST_KEY);
      } catch {
        /* storage blocked: the session simply ends with the tab */
      }
      setEmail(null);
    },
    mode: 'test',
  };
  const done = (value: string) => {
    try {
      sessionStorage.setItem(TEST_KEY, value);
    } catch {
      /* storage blocked: keep the session in memory */
    }
    setEmail(value);
    setAsking(false);
  };
  return (
    <SessionContext.Provider value={session}>
      {asking && !email ? <TestSignInPage onDone={done} onCancel={() => setAsking(false)} /> : children}
    </SessionContext.Provider>
  );
}

function TestSignInPage({ onDone, onCancel }: { onDone: (email: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState('');
  const valid = /^[a-z0-9._+-]+@[a-z0-9.-]+\.test$/.test(value.trim().toLowerCase());
  function submit(e: FormEvent) {
    e.preventDefault();
    if (valid) onDone(value.trim().toLowerCase());
  }
  return (
    <div className="signin">
      <header className="home__bar">
        <span className="brand">CycleReg</span>
        <ThemeToggle />
      </header>
      <main className="signin__main">
        <form className="panel-form signin__card" onSubmit={submit}>
          <h1>Sign in for testing</h1>
          <p>Browser-test sign-in. Use a fictional address ending in .test. Real sign-in sends an emailed code instead.</p>
          <Field label="Test email" hint="For example, organizer@example.test">
            {(id, describedBy) => <input id={id} className="input" type="email" autoComplete="off" value={value} onChange={(e) => setValue(e.target.value)} aria-describedby={describedBy} required />}
          </Field>
          <div className="form-actions">
            <button className="btn btn--primary" type="submit" disabled={!valid}>
              Sign in
            </button>
            <button className="btn btn--ghost" type="button" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}

/** Shown in place of a page or step that needs sign-in. */
export function SignInPrompt({ title, children }: { title: string; children: ReactNode }) {
  const session = useSession();
  if (session.status === 'loading') return <div className="skeleton" aria-label="Checking sign-in" />;
  return (
    <section className="signin-prompt" aria-labelledby="signin-prompt-title">
      <h2 id="signin-prompt-title">{title}</h2>
      <p>{children}</p>
      {session.status === 'unconfigured' ? (
        <p className="alert alert--warn" role="alert">
          Sign-in is not set up on this computer. Add VITE_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY to .env (see docs/runbooks/local-setup.md), then restart.
        </p>
      ) : (
        <button className="btn btn--primary" type="button" onClick={session.signIn}>
          Sign in with email
        </button>
      )}
      <p className="signin-prompt__note">
        <Pending>Emailed code or link only. Multi-factor authentication comes later, so use fictional details.</Pending>
      </p>
    </section>
  );
}

/** Full-page gate for organizer and order pages. */
export function RequireSignIn({ children }: { children: ReactNode }) {
  const session = useSession();
  if (session.status === 'signed-in') return <>{children}</>;
  if (session.status === 'loading')
    return (
      <div className="state-page">
        <div className="skeleton skeleton--page" aria-label="Checking sign-in" />
      </div>
    );
  return (
    <div className="signin">
      <header className="home__bar">
        <span className="brand">CycleReg</span>
        <span className="home__bar-note">Organizer workspace</span>
        <ThemeToggle />
      </header>
      <main className="signin__main">
        <SignInPrompt title="Sign in to CycleReg">
          Organizers, volunteers, and riders each sign in with their own email. We send a one-time code or link; there is no password. Your organization's owner
          decides what you can see and change.
        </SignInPrompt>
        <a className="signin__public" href="#/register">
          Browse open events without signing in
        </a>
      </main>
    </div>
  );
}

/** The signed-in email and a sign-out button, for page headers. */
export function AccountMenu() {
  const session = useSession();
  if (session.status !== 'signed-in') return null;
  return (
    <div className="account">
      <span className="account__email" title={session.email ?? undefined}>
        {session.email ?? 'Signed in'}
      </span>
      <button className="btn btn--ghost btn--small" type="button" onClick={session.signOut}>
        Sign out
      </button>
    </div>
  );
}
