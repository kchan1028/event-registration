import { buildApp } from './app';

// Adds the labeled demonstration organization and event to the local database.
const dbPath = process.env.DB_PATH ?? 'data/cyclereg.sqlite';
const { app } = buildApp({ dbPath });
const res = await app.inject({ method: 'POST', url: '/api/demo' });
console.log(res.statusCode === 201 ? `Demonstration event created in ${dbPath}: ${res.body}` : `Failed: ${res.body}`);
await app.close();
