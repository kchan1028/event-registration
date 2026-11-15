import { buildApp } from './app';
import { DEFAULT_DATABASE_URL } from './db';

// Local PostgreSQL (DATABASE_URL). Berkeley standalone events are published for the rider demo.
const databaseUrl = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
const { app } = buildApp({ databaseUrl });
const dbName = new URL(databaseUrl).pathname.slice(1);
const url = process.argv.includes('--berkeley') ? '/api/demo/berkeley-events'
  : process.argv.includes('--omnium') ? '/api/demo/berkeley-omnium' : '/api/demo';
try {
  const res = await app.inject({ method: 'POST', url });
  if (res.statusCode === 201 || res.statusCode === 200) {
    console.log(`Demonstration events ${res.statusCode === 201 ? 'created' : 'already exist'} in database ${dbName}: ${res.body}`);
  } else {
    console.error(`Seed failed (${res.statusCode}): ${res.body}`);
    process.exitCode = 1;
  }
} finally {
  await app.close();
}
