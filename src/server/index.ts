import { existsSync } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app';
import { DEFAULT_DATABASE_URL, ensureLocalDatabase } from './db';
import { listenHost } from './listen';

// Local keys (CLERK_SECRET_KEY and others) live in a gitignored .env; real environment variables win.
if (existsSync('.env')) process.loadEnvFile('.env');

const port = Number(process.env.PORT ?? process.env.API_PORT ?? 3001);
const host = listenHost(); // 127.0.0.1 unless HOST says otherwise
const databaseUrl = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
// The built web app is served in production, and by the browser tests (SERVE_WEB=1).
const serveWeb = process.env.NODE_ENV === 'production' || process.env.SERVE_WEB === '1';

// buildApp reads sign-in (Clerk, or the local test provider) and payments (Stripe test mode when
// STRIPE_SECRET_KEY is set, otherwise simulated) from the environment, and throws when a setting is
// missing or refused. It does not connect to the database until the server starts listening.
let app: FastifyInstance;
try {
  ({ app } = buildApp({ databaseUrl, serveWeb, logger: true }));
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}

try {
  if (await ensureLocalDatabase(databaseUrl)) console.log(`Created local database ${new URL(databaseUrl).pathname.slice(1)}.`);
} catch (err) {
  console.error(`Cannot reach PostgreSQL at ${new URL(databaseUrl).host}. See docs/runbooks/troubleshooting.md. ${(err as Error).message}`);
  process.exit(1);
}

app.listen({ port, host }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});

// On SIGTERM (a platform redeploy or scale-down) or Ctrl+C: stop taking new requests, let
// requests in progress finish, close the database pool, then exit.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    app.log.info(`${signal} received; shutting down.`);
    app.close().then(
      () => process.exit(0),
      (err) => {
        app.log.error(err);
        process.exit(1);
      },
    );
  });
}
