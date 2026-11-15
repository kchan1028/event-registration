import { buildApp } from './app';
import { DEFAULT_DATABASE_URL, ensureLocalDatabase } from './db';
import { listenHost } from './listen';

const port = Number(process.env.PORT ?? process.env.API_PORT ?? 3001);
let host: string;
try {
  host = listenHost(); // 127.0.0.1 unless HOST says otherwise; a public address is refused until sign-in exists
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}
const databaseUrl = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;

try {
  if (await ensureLocalDatabase(databaseUrl)) console.log(`Created local database ${new URL(databaseUrl).pathname.slice(1)}.`);
} catch (err) {
  console.error(`Cannot reach PostgreSQL at ${new URL(databaseUrl).host}. See docs/runbooks/troubleshooting.md. ${(err as Error).message}`);
  process.exit(1);
}

const { app } = buildApp({ databaseUrl, serveWeb: process.env.NODE_ENV === 'production', logger: true });

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
