import pg from 'pg';

/**
 * Drops and recreates the database named in DATABASE_URL so a run starts empty.
 * Used by the end-to-end test. Refuses any database whose name does not end in
 * "_e2e" or "_test", so it cannot wipe working data by mistake.
 */
const url = process.env.DATABASE_URL;
if (!url) throw new Error('Set DATABASE_URL to the throwaway database to reset.');
const target = new URL(url);
const name = decodeURIComponent(target.pathname.slice(1));
if (!/^[a-z0-9_]+_(e2e|test)$/.test(name)) throw new Error(`Refusing to reset "${name}": only databases ending in _e2e or _test can be reset.`);
target.pathname = '/postgres';
const admin = new pg.Client({ connectionString: target.toString() });
await admin.connect();
try {
  await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await admin.query(`CREATE DATABASE "${name}"`);
  console.log(`Reset database ${name}.`);
} finally {
  await admin.end();
}
