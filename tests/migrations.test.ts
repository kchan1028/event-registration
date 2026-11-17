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


describe('migration 27: recoverable refund creation', () => {
  it('preserves historical money without inventing a client request', async () => {
    const url = await testDatabaseUrl({ empty: true });
    const client = new pg.Client({ connectionString: url }); await client.connect();
    try {
      await client.query(`CREATE TABLE schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
      for (let v = 0; v < 26; v++) {
        await client.query(MIGRATIONS[v]);
        await client.query(`INSERT INTO schema_migrations(version) VALUES ($1)`, [v + 1]);
      }
      await client.query(`INSERT INTO organizations(id,name,created_at) VALUES ('old_org','Fictional migration club','2026-01-01Z')`);
      await client.query(`INSERT INTO events(id,organization_id,draft_json,revision,created_at,updated_at) VALUES ('old_event','old_org','{}',1,'2026-01-01Z','2026-01-01Z')`);
      await client.query(`INSERT INTO orders(id,event_id,published_version,client_request_id,status,rider_json,waiver_json,quote_json,total_cents,hold_expires_at,created_at,updated_at) VALUES ('old_order','old_event',1,'old_request','confirmed','{}','{}','{}',1000,'2026-01-01Z','2026-01-01Z','2026-01-01Z')`);
      await client.query(`INSERT INTO refunds(id,order_id,provider,amount_cents,reason,status,created_at,updated_at) VALUES ('old_refund','old_order','simulated',100,'Fictional old refund','succeeded','2026-01-01Z','2026-01-01Z')`);
    } finally { await client.end(); }
    const db = openDb(url);
    try {
      await db.migrate(); await db.migrate();
      expect(await db.get(`SELECT amount_cents, status, request_json FROM refunds WHERE id = 'old_refund'`)).toEqual({ amount_cents: 100, status: 'succeeded', request_json: null });
    } finally { await db.close(); }
  });
});


describe('migration 28: explicit guardian grant foundation', () => {
  it('mirrors existing ownership once without inventing an accepting actor or changing order evidence', async () => {
    const url = await testDatabaseUrl({ empty: true });
    const client = new pg.Client({ connectionString: url }); await client.connect();
    const evidence = { signerAccountId: 'old_parent', riderRacingAge: 16, acceptedAt: '2026-01-02T00:00:00.000Z' };
    try {
      await client.query(`CREATE TABLE schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
      for (let v = 0; v < 27; v++) {
        await client.query(MIGRATIONS[v]);
        await client.query(`INSERT INTO schema_migrations(version) VALUES ($1)`, [v + 1]);
      }
      await client.query(`INSERT INTO accounts(id,provider_user_id,email,created_at) VALUES ('old_parent','fictional-parent','parent@migration.test','2026-01-01Z')`);
      await client.query(`INSERT INTO junior_profiles(id,guardian_account_id,name_key,first_name,last_name,viewer_email,created_at) VALUES ('old_junior','old_parent',E'sam\\texample','Sam','Example','junior@migration.test','2026-01-02Z')`);
      await client.query(`INSERT INTO organizations(id,name,created_at) VALUES ('old_org','Fictional migration club','2026-01-01Z')`);
      await client.query(`INSERT INTO events(id,organization_id,draft_json,revision,created_at,updated_at) VALUES ('old_event','old_org','{}',1,'2026-01-01Z','2026-01-01Z')`);
      await client.query(`INSERT INTO orders(id,event_id,published_version,client_request_id,status,rider_json,waiver_json,waiver_evidence_json,quote_json,total_cents,account_id,junior_profile_id,hold_expires_at,created_at,updated_at) VALUES ('old_order','old_event',1,'old_request','confirmed','{}','{}',$1,'{}',3000,'old_parent','old_junior','2026-01-01Z','2026-01-01Z','2026-01-01Z')`, [JSON.stringify(evidence)]);
    } finally { await client.end(); }
    const db = openDb(url);
    try {
      await db.migrate(); await db.migrate();
      const grant = await db.get(`SELECT junior_profile_id,account_id,granted_by,granted_at,revoked_by,revoked_at FROM junior_guardians`);
      expect(grant).toEqual({ junior_profile_id: 'old_junior', account_id: 'old_parent', granted_by: null, granted_at: '2026-01-02T00:00:00.000Z', revoked_by: null, revoked_at: null });
      expect(await db.all(`SELECT id FROM junior_guardians`)).toHaveLength(1);
      expect(await db.all(`SELECT id FROM junior_guardian_invitations`)).toEqual([]);
      expect(await db.get(`SELECT account_id,junior_profile_id,status,total_cents,waiver_evidence_json FROM orders WHERE id='old_order'`)).toEqual({ account_id: 'old_parent', junior_profile_id: 'old_junior', status: 'confirmed', total_cents: 3000, waiver_evidence_json: evidence });
      expect(await db.get(`SELECT viewer_email FROM junior_profiles WHERE id='old_junior'`)).toEqual({ viewer_email: 'junior@migration.test' });
      await expect(db.run(`INSERT INTO junior_guardians(id,junior_profile_id,account_id,granted_at) VALUES ('duplicate','old_junior','old_parent',now())`)).rejects.toMatchObject({ code: '23505' });
      await expect(db.run(`INSERT INTO junior_guardians(id,junior_profile_id,account_id,granted_at) VALUES ('missing','old_junior','missing_parent',now())`)).rejects.toMatchObject({ code: '23503' });
    } finally { await db.close(); }
  });
});


describe('migration 30: explicit guardian acceptance', () => {
  it('preserves the existing guardian, pending invitation and purchase evidence without inventing acceptance', async () => {
    const url = await testDatabaseUrl({ empty: true });
    const client = new pg.Client({ connectionString: url }); await client.connect();
    const evidence = { signerAccountId: 'parent', riderRacingAge: 16, acceptedAt: '2026-01-01T00:00:00.000Z' };
    try {
      await client.query(`CREATE TABLE schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
      for (let v = 0; v < 29; v++) { await client.query(MIGRATIONS[v]); await client.query(`INSERT INTO schema_migrations(version) VALUES ($1)`, [v + 1]); }
      await client.query(`INSERT INTO accounts(id,provider_user_id,email,created_at) VALUES ('parent','fictional-parent','parent@migration.test','2026-01-01Z'),('recipient','fictional-recipient','recipient@migration.test','2026-01-01Z')`);
      await client.query(`INSERT INTO junior_profiles(id,guardian_account_id,name_key,first_name,last_name,viewer_email,created_at) VALUES ('junior','parent',E'sam\\texample','Sam','Example','viewer@migration.test','2026-01-01Z')`);
      await client.query(`INSERT INTO junior_guardians(id,junior_profile_id,account_id,granted_by,granted_at) VALUES ('original_grant','junior','parent','parent','2026-01-01Z')`);
      await client.query(`INSERT INTO junior_guardian_invitations(id,junior_profile_id,email,invited_by,created_at,expires_at) VALUES ('old_invite','junior','recipient@migration.test','parent','2026-01-01Z','2026-01-15Z')`);
      await client.query(`INSERT INTO organizations(id,name,created_at) VALUES ('org','Fictional club','2026-01-01Z')`);
      await client.query(`INSERT INTO events(id,organization_id,draft_json,revision,created_at,updated_at) VALUES ('event','org','{}',1,'2026-01-01Z','2026-01-01Z')`);
      await client.query(`INSERT INTO orders(id,event_id,published_version,client_request_id,status,rider_json,waiver_json,waiver_evidence_json,quote_json,total_cents,account_id,junior_profile_id,hold_expires_at,created_at,updated_at) VALUES ('order','event',1,'fictional-request','confirmed','{}','{}',$1,'{}',3000,'parent','junior','2026-01-01Z','2026-01-01Z','2026-01-01Z')`, [JSON.stringify(evidence)]);
    } finally { await client.end(); }
    const db = openDb(url);
    try {
      await db.migrate(); await db.migrate();
      expect(await db.get(`SELECT created_by_account_id,viewer_email,merged_into_id,merged_at,merged_by FROM junior_profiles WHERE id='junior'`)).toEqual({ created_by_account_id: 'parent', viewer_email: 'viewer@migration.test', merged_into_id: null, merged_at: null, merged_by: null });
      expect(await db.get(`SELECT accepted_at,accepted_by,cancelled_at,invited_by,expires_at FROM junior_guardian_invitations WHERE id='old_invite'`)).toEqual({ accepted_at: null, accepted_by: null, cancelled_at: null, invited_by: 'parent', expires_at: '2026-01-15T00:00:00.000Z' });
      expect(await db.all(`SELECT id,account_id FROM junior_guardians`)).toEqual([{ id: 'original_grant', account_id: 'parent' }]);
      expect(await db.get(`SELECT account_id,junior_profile_id,status,total_cents,waiver_evidence_json FROM orders WHERE id='order'`)).toEqual({ account_id: 'parent', junior_profile_id: 'junior', status: 'confirmed', total_cents: 3000, waiver_evidence_json: evidence });
      await expect(db.run(`INSERT INTO junior_guardian_invitations(id,junior_profile_id,email,invited_by,created_at,expires_at) VALUES ('duplicate','junior','new@migration.test','parent',now(),now())`)).rejects.toMatchObject({ code: '23505' });
      await expect(db.run(`UPDATE junior_guardian_invitations SET accepted_by='recipient' WHERE id='old_invite'`)).rejects.toMatchObject({ code: '23514' });
      await expect(db.run(`UPDATE junior_guardian_invitations SET cancelled_at=now() WHERE id='old_invite'`)).rejects.toMatchObject({ code: '23514' });
      await expect(db.run(`DELETE FROM junior_profiles WHERE id='junior'`)).rejects.toMatchObject({ code: '23503' });
    } finally { await db.close(); }
  });
});


describe('migration 31: guardian removal evidence', () => {
  it('keeps historical revocations unknown and requires complete explicit removal evidence', async () => {
    const url = await testDatabaseUrl({ empty: true });
    const client = new pg.Client({ connectionString: url }); await client.connect();
    try {
      await client.query(`CREATE TABLE schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
      for (let v = 0; v < 30; v++) { await client.query(MIGRATIONS[v]); await client.query(`INSERT INTO schema_migrations(version) VALUES ($1)`, [v + 1]); }
      await client.query(`INSERT INTO accounts(id,provider_user_id,email,created_at) VALUES ('parent','parent','parent@migration.test',now()),('other','other','other@migration.test',now())`);
      await client.query(`INSERT INTO junior_profiles(id,created_by_account_id,name_key,first_name,last_name,created_at) VALUES ('junior','parent','sam','Sam','Example',now())`);
      await client.query(`INSERT INTO junior_guardians(id,junior_profile_id,account_id,granted_at,revoked_by,revoked_at) VALUES ('old','junior','parent','2026-01-01Z','other','2026-01-02Z')`);
    } finally { await client.end(); }
    const db = openDb(url);
    try {
      await db.migrate(); await db.migrate();
      expect(await db.get(`SELECT revoked_by,revoked_at,removal_reason,removal_acknowledged_at FROM junior_guardians WHERE id='old'`)).toEqual({ revoked_by: 'other', revoked_at: '2026-01-02T00:00:00.000Z', removal_reason: null, removal_acknowledged_at: null });
      await expect(db.run(`UPDATE junior_guardians SET removal_reason='Fictional reason' WHERE id='old'`)).rejects.toMatchObject({ code: '23514' });
      await expect(db.run(`UPDATE junior_guardians SET removal_reason='  ',removal_acknowledged_at=revoked_at WHERE id='old'`)).rejects.toMatchObject({ code: '23514' });
      await expect(db.run(`UPDATE junior_guardians SET removal_reason='Fictional reason',removal_acknowledged_at=now() WHERE id='old'`)).rejects.toMatchObject({ code: '23514' });
      await db.run(`UPDATE junior_guardians SET removal_reason='Fictional reason',removal_acknowledged_at=revoked_at WHERE id='old'`);
      await expect(db.run(`UPDATE junior_guardians SET revoked_by=account_id WHERE id='old'`)).rejects.toMatchObject({ code: '23514' });
    } finally { await db.close(); }
  });
});
