import pg from 'pg';
import { describe, expect, inject, it } from 'vitest';
import { ensureLocalDatabase, MIGRATIONS, openDb } from '../src/server/db';
import { testApp, testDatabaseUrl } from './support/db';

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const TEXT_TIMESTAMPS = `SELECT table_name, column_name FROM information_schema.columns
  WHERE table_schema = 'public' AND data_type = 'text' AND (column_name LIKE '%\\_at' OR column_name LIKE '%expires%')`;

describe('migration 13: timestamps become timestamptz', () => {
  it('converts text timestamps written before the change without altering them', async () => {
    const url = await testDatabaseUrl({ empty: true });
    // Build a schema-version-12 database holding text timestamps, as one would exist before this migration.
    const client = new pg.Client({ connectionString: url });
    await client.connect();
    try {
      await client.query(`CREATE TABLE schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
      for (let v = 0; v < 12; v++) {
        await client.query(MIGRATIONS[v]);
        await client.query(`INSERT INTO schema_migrations (version) VALUES ($1)`, [v + 1]);
      }
      await client.query(`INSERT INTO organizations (id, name, created_at) VALUES ('org_old', 'Old club', '2026-11-14T09:30:15.123Z')`);
    } finally {
      await client.end();
    }

    const db = openDb(url);
    try {
      await db.migrate();
      const row = await db.get<{ created_at: string; type: string }>(`SELECT created_at, pg_typeof(created_at)::text AS type FROM organizations WHERE id = 'org_old'`);
      expect(row).toEqual({ created_at: '2026-11-14T09:30:15.123Z', type: 'timestamp with time zone' });
      expect(await db.all(TEXT_TIMESTAMPS)).toEqual([]);
    } finally {
      await db.close();
    }
  });

  it('still returns timestamps through the API as ISO 8601 UTC strings', async () => {
    const { app } = await testApp({ now: () => new Date('2027-03-01T18:00:00Z'), holdMinutes: 10 });
    const { eventId } = (await app.inject({ method: 'POST', url: '/api/demo' })).json() as { eventId: string };
    const event = (await app.inject({ method: 'GET', url: `/api/events/${eventId}` })).json() as { updatedAt: string };
    expect(event.updatedAt).toMatch(ISO);
    await app.inject({ method: 'POST', url: `/api/events/${eventId}/publish`, payload: { acknowledgeWarnings: true } });
    const versions = (await app.inject({ method: 'GET', url: `/api/events/${eventId}` })).json() as { versions: { publishedAt: string }[] };
    expect(versions.versions[0].publishedAt).toMatch(ISO);
  });
});

describe('local database auto-create', () => {
  const { serverUrl, runId } = inject('testDb');
  const urlFor = (name: string) => {
    const url = new URL(serverUrl);
    url.pathname = `/${name}`;
    return url.toString();
  };

  it('creates a missing local database once, then leaves it alone', async () => {
    // The run prefix means global teardown drops it.
    const url = urlFor(`cyclereg_test_${runId}_ensure_${process.pid}`);
    expect(await ensureLocalDatabase(url)).toBe(true);
    expect(await ensureLocalDatabase(url)).toBe(false);
    const db = openDb(url);
    try {
      await db.migrate();
      expect(await db.get<{ ok: number }>('SELECT 1 AS ok')).toEqual({ ok: 1 });
    } finally {
      await db.close();
    }
  });

  it('never creates a database on another host', async () => {
    // Returns before any connection attempt, so no server is needed at this address.
    expect(await ensureLocalDatabase('postgres://user:pass@db.example.com:5432/cyclereg')).toBe(false);
  });

  it('refuses an unsafe database name', async () => {
    await expect(ensureLocalDatabase(urlFor('Bad-Name'))).rejects.toThrow(/lowercase letters/);
  });
});


describe('migration 26: server-recorded waiver evidence', () => {
  it('preserves an earlier acceptance without inventing signer, age or time evidence', async () => {
    const url = await testDatabaseUrl({ empty: true });
    const client = new pg.Client({ connectionString: url }); await client.connect();
    const waiver = { version: 'fictional-old-waiver', read: true, agreed: true, signatureName: 'Fictional Guardian', signerRole: 'guardian' };
    try {
      await client.query(`CREATE TABLE schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
      for (let v = 0; v < 25; v++) {
        await client.query(MIGRATIONS[v]);
        await client.query(`INSERT INTO schema_migrations(version) VALUES ($1)`, [v + 1]);
      }
      await client.query(`INSERT INTO organizations(id,name,created_at) VALUES ('old_org','Fictional migration club','2026-01-01Z')`);
      await client.query(`INSERT INTO events(id,organization_id,draft_json,revision,created_at,updated_at) VALUES ('old_event','old_org','{}',1,'2026-01-01Z','2026-01-01Z')`);
      await client.query(`INSERT INTO orders(id,event_id,published_version,client_request_id,status,rider_json,waiver_json,quote_json,total_cents,hold_expires_at,created_at,updated_at) VALUES ('old_order','old_event',1,'old_request','confirmed','{}',$1,'{}',1000,'2026-01-01Z','2026-01-01Z','2026-01-01Z')`, [JSON.stringify(waiver)]);
    } finally { await client.end(); }
    const db = openDb(url);
    try {
      await db.migrate(); await db.migrate();
      expect(await db.get(`SELECT waiver_json,waiver_evidence_json,status,total_cents FROM orders WHERE id = 'old_order'`)).toEqual({ waiver_json: waiver,waiver_evidence_json: null,status: 'confirmed',total_cents: 1000 });
    } finally { await db.close(); }
  });
});
