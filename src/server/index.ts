import { buildApp } from './app';

const port = Number(process.env.PORT ?? process.env.API_PORT ?? 3001);
// Bind to localhost only: this prototype has no sign-in and must not be exposed.
const host = '127.0.0.1';
const dbPath = process.env.DB_PATH ?? 'data/cyclereg.sqlite';

const { app } = buildApp({ dbPath, serveWeb: process.env.NODE_ENV === 'production', logger: true });

app.listen({ port, host }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
