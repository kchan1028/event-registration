import { buildApp } from './app';

// Local SQLite only. Berkeley standalone events are published for the rider demo.
const dbPath = process.env.DB_PATH ?? 'data/cyclereg.sqlite';
const { app } = buildApp({ dbPath });
const url = process.argv.includes('--berkeley') ? '/api/demo/berkeley-events'
  : process.argv.includes('--omnium') ? '/api/demo/berkeley-omnium' : '/api/demo';
try {
  const res = await app.inject({ method: 'POST', url });
  if (res.statusCode === 201 || res.statusCode === 200) {
    console.log(`Demonstration events ${res.statusCode === 201 ? 'created' : 'already exist'} in ${dbPath}: ${res.body}`);
  } else {
    console.error(`Seed failed (${res.statusCode}): ${res.body}`);
    process.exitCode = 1;
  }
} finally {
  await app.close();
}
