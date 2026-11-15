import { buildApp } from './app';
import { DEFAULT_DATABASE_URL } from './db';

const port = Number(process.env.PORT ?? process.env.API_PORT ?? 3001);
// Bind to localhost only: the app has no sign-in yet and must not be exposed.
const host = '127.0.0.1';
const databaseUrl = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;

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
