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
