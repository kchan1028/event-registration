import { existsSync } from 'node:fs';
import { buildApp } from './app';
import { regionalHistoricalDemos } from '../shared/regionalHistoricalEvents';
import { teamTimeTrialResearchDemos } from '../shared/teamTimeTrialResearch';
import { scriptAuth, seedOwner } from './auth';
import { DEFAULT_DATABASE_URL, ensureLocalDatabase } from './db';

// Local PostgreSQL (DATABASE_URL). Named demo seeds create published examples or explicitly unpublished research drafts.
// `--owner you@example.com` (or SEED_OWNER_EMAIL) makes that email an owner of the seeded
// organization, so it appears after you sign in with it.
if (existsSync('.env')) process.loadEnvFile('.env');
const owner = seedOwner(process.argv);
if (!owner) {
  console.error('Pass --owner <your sign-in email> (or set SEED_OWNER_EMAIL) so the seeded organization is yours.');
  process.exit(1);
}
const databaseUrl = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
await ensureLocalDatabase(databaseUrl);
const { app, access } = buildApp({ databaseUrl, auth: scriptAuth() });
const dbName = new URL(databaseUrl).pathname.slice(1);
const named = [...regionalHistoricalDemos, ...teamTimeTrialResearchDemos].find((demo) => process.argv.includes(`--${demo.key}`));
const url = named ? `/api/demo/${named.key}`
  : process.argv.includes('--red-kite-series') ? '/api/demo/red-kite-series'
  : process.argv.includes('--san-francisco-grand-prix') ? '/api/demo/san-francisco-grand-prix'
  : process.argv.includes('--burlingame') ? '/api/demo/burlingame'
  : process.argv.includes('--berkeley') ? '/api/demo/berkeley-events'
  : process.argv.includes('--omnium') ? '/api/demo/berkeley-omnium' : '/api/demo';
try {
  const res = await app.inject({ method: 'POST', url });
  if (res.statusCode === 201 || res.statusCode === 200) {
    await access.addMember((res.json() as { organizationId: string }).organizationId, owner, 'owner', null);
    console.log(`Owner: ${owner}.`);
    console.log(`Demonstration events ${res.statusCode === 201 ? 'created' : 'already exist'} in database ${dbName}: ${res.body}`);
  } else {
    console.error(`Seed failed (${res.statusCode}): ${res.body}`);
    process.exitCode = 1;
  }
} finally {
  await app.close();
}
