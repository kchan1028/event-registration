import { buildApp } from './app';

// Adds a demo organization and event to the local database: the fictional example weekend,
// or the Berkeley Omnium with `--omnium`.
const dbPath = process.env.DB_PATH ?? 'data/cyclereg.sqlite';
const { app } = buildApp({ dbPath });
const url = process.argv.includes('--omnium') ? '/api/demo/berkeley-omnium' : '/api/demo';
const res = await app.inject({ method: 'POST', url });
console.log(res.statusCode === 201 ? `Demonstration event created in ${dbPath}: ${res.body}` : `Failed: ${res.body}`);
await app.close();
