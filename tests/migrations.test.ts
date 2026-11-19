import pg from 'pg';
import { describe, expect, inject, it } from 'vitest';
import { ensureLocalDatabase, MIGRATIONS, openDb } from '../src/server/db';
import { testApp, testDatabaseUrl } from './support/db';

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const TEXT_TIMESTAMPS = `SELECT table_name, column_name FROM information_schema.columns
  WHERE table_schema = 'public' AND data_type = 'text' AND (column_name LIKE '%\\_at' OR column_name LIKE '%expires%')`;

it('adds protected export auditing on upgrade without backfilling requests', async () => {
  const url = await testDatabaseUrl({ empty: true });
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('CREATE TABLE schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    for (let version = 1; version <= 36; version++) {
      await client.query(MIGRATIONS[version - 1]);
      await client.query('INSERT INTO schema_migrations(version) VALUES ($1)', [version]);
    }
    await client.query("INSERT INTO organizations(id,name,created_at) VALUES ('org_audit_upgrade','Fictional club',now())");
  } finally {
    await client.end();
  }
  const db = openDb(url);
  try {
    await db.migrate();
    await db.migrate();
    expect(await db.get("SELECT name FROM organizations WHERE id='org_audit_upgrade'")).toEqual({ name: 'Fictional club' });
    expect(await db.get('SELECT version FROM schema_migrations WHERE version = 37')).toEqual({ version: 37 });
    expect(await db.all('SELECT id FROM protected_export_audit')).toEqual([]);
  } finally {
    await db.close();
  }
});

describe('migration 36: terminal cancellation request refusals', () => {
  it('enforces matching request identities and supported terminal refusal statuses', async () => {
    const databaseUrl = await testDatabaseUrl(); const { app } = await testApp({ databaseUrl });
    const db = openDb(databaseUrl);
    try {
      const { eventId } = (await app.inject({ method: 'POST', url: '/api/demo' })).json();
      const actor = (await app.inject({ method: 'GET', url: '/api/me' })).json().account.id;
      const insert = (requestId: string, status: number) => db.run(`INSERT INTO cancellation_request_refusals(event_id,command_kind,client_request_id,request_json,rejected_by,rejected_at,status_code,message,details_json) VALUES($1,'execution','migration-refusal-id',$2,$3,'2026-11-18T12:00Z',$4,'Fictional refusal','{}')`, [eventId, JSON.stringify({ clientRequestId: requestId }), actor, status]);
      await expect(insert('different-refusal-id', 409)).rejects.toMatchObject({ code: '23514', constraint: 'cancellation_request_refusals_check' });
      for (const status of [200, 401, 403, 500]) await expect(insert('migration-refusal-id', status)).rejects.toMatchObject({ code: '23514', constraint: 'cancellation_request_refusals_status_code_check' });
      expect(await db.get('SELECT count(*)::int AS n FROM cancellation_request_refusals')).toEqual({ n: 0 });
      await insert('migration-refusal-id', 409);
      expect(await db.get('SELECT count(*)::int AS n FROM cancellation_request_refusals')).toEqual({ n: 1 });
    } finally { await db.close(); }
  });
  it('preserves existing records without inventing historical refusal evidence', async () => {
    const url = await testDatabaseUrl({ empty: true }); const client = new pg.Client({ connectionString: url }); await client.connect();
    try {
      await client.query('CREATE TABLE schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
      for (let v = 0; v < 35; v++) { await client.query(MIGRATIONS[v]); await client.query('INSERT INTO schema_migrations(version) VALUES($1)', [v + 1]); }
      await client.query(`INSERT INTO organizations(id,name,created_at) VALUES('org_refusal_upgrade','Fictional refusal club','2026-11-18T12:00Z')`);
    } finally { await client.end(); }
    const db = openDb(url);
    try {
      const before = await db.get(`SELECT to_jsonb(o) AS value FROM organizations o WHERE id='org_refusal_upgrade'`);
      await db.migrate(); await db.migrate();
      expect(await db.get(`SELECT to_jsonb(o) AS value FROM organizations o WHERE id='org_refusal_upgrade'`)).toEqual(before);
      expect(await db.get('SELECT count(*)::int AS n FROM cancellation_request_refusals')).toEqual({ n: 0 });
      expect(await db.get('SELECT version FROM schema_migrations WHERE version = 36')).toEqual({ version: 36 });
    } finally { await db.close(); }
  });
});

describe('migration 35: simulated cancellation execution', () => {
  it('adds no inferred executions and retains existing event evidence on upgrade', async () => {
    const url = await testDatabaseUrl({ empty: true }); const client = new pg.Client({ connectionString: url }); await client.connect();
    try {
      await client.query('CREATE TABLE schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
      for (let v = 0; v < 34; v++) { await client.query(MIGRATIONS[v]); await client.query('INSERT INTO schema_migrations(version) VALUES($1)', [v + 1]); }
      await client.query(`INSERT INTO organizations(id,name,created_at) VALUES('org_execution_upgrade','Fictional upgrade club','2026-11-18T12:00Z')`);
    } finally { await client.end(); }
    const db = openDb(url);
    try {
      const before = await db.get(`SELECT to_jsonb(o) AS value FROM organizations o WHERE id='org_execution_upgrade'`);
      await db.migrate(); await db.migrate();
      expect(await db.get(`SELECT to_jsonb(o) AS value FROM organizations o WHERE id='org_execution_upgrade'`)).toEqual(before);
      expect(await db.get('SELECT count(*)::int AS n FROM cancellation_executions')).toEqual({ n: 0 });
      expect(await db.get("SELECT data_type FROM information_schema.columns WHERE table_name='order_entries' AND column_name='cancelled_at'")).toEqual({ data_type: 'timestamp with time zone' });
    } finally { await db.close(); }
  });
});

describe('migration 34: reviewed cancellation plan evidence', () => {
  it('adds no historical confirmations and preserves existing records on upgrade', async () => {
    const url = await testDatabaseUrl({ empty: true }); const client = new pg.Client({ connectionString: url }); await client.connect();
    try {
      await client.query('CREATE TABLE schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
      for (let v = 0; v < 33; v++) { await client.query(MIGRATIONS[v]); await client.query('INSERT INTO schema_migrations(version) VALUES($1)', [v + 1]); }
      await client.query(`INSERT INTO organizations(id,name,created_at) VALUES('org_confirmation_upgrade','Fictional upgrade club','2026-11-17T12:00Z')`);
    } finally { await client.end(); }
    const db = openDb(url);
    try {
      const before = await db.get(`SELECT to_jsonb(o) AS value FROM organizations o WHERE id='org_confirmation_upgrade'`);
      await db.migrate(); await db.migrate();
      expect(await db.get(`SELECT to_jsonb(o) AS value FROM organizations o WHERE id='org_confirmation_upgrade'`)).toEqual(before);
      expect(await db.get('SELECT count(*)::int AS n FROM cancellation_confirmations')).toEqual({ n: 0 });
      expect(await db.get('SELECT max(version) AS version FROM schema_migrations')).toEqual({ version: MIGRATIONS.length });
    } finally { await db.close(); }
  });
});

describe('migration 32: support-approved profile claims', () => {
  it('keeps existing guardian/viewer history without inferring DOB or claims and constrains new evidence', async () => {
    const url = await testDatabaseUrl({ empty: true });
    const client = new pg.Client({ connectionString: url }); await client.connect();
    try {
      await client.query(`CREATE TABLE schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
      for (let v = 0; v < 31; v++) { await client.query(MIGRATIONS[v]); await client.query(`INSERT INTO schema_migrations(version) VALUES ($1)`, [v + 1]); }
      await client.query(`INSERT INTO accounts(id,provider_user_id,email,created_at) VALUES ('acc_old_parent','test|old@claim.test','old@claim.test','2026-02-28T12:00Z'),('acc_old_rider','test|rider@claim.test','rider@claim.test','2026-02-28T12:00Z')`);
      await client.query(`INSERT INTO junior_profiles(id,created_by_account_id,name_key,first_name,last_name,viewer_email,created_at) VALUES ('jun_old','acc_old_parent','claim fictional','Claim','Fictional','viewer@claim.test','2026-02-28T12:00Z')`);
      await client.query(`INSERT INTO junior_guardians(id,junior_profile_id,account_id,granted_at) VALUES ('jgd_old','jun_old','acc_old_parent','2026-02-28T12:00Z')`);
    } finally { await client.end(); }
    const db = openDb(url);
    try {
      await db.migrate();
      expect(await db.all(`SELECT * FROM junior_profile_claims`)).toEqual([]);
      expect(await db.get(`SELECT viewer_email FROM junior_profiles WHERE id='jun_old'`)).toEqual({ viewer_email: 'viewer@claim.test' });
      expect(await db.get(`SELECT revoked_at FROM junior_guardians WHERE id='jgd_old'`)).toEqual({ revoked_at: null });
      const insert = `INSERT INTO junior_profile_claims(id,junior_profile_id,rider_account_id,approved_by,client_request_id,birth_date,time_zone,review_reference,minimum_age,approved_at) VALUES ($1,'jun_old','acc_old_rider',$2,$1,'2008-02-29','UTC','FICTIONAL-REFERENCE',$3,'2026-03-01T00:00Z')`;
      await expect(db.run(insert, ['clm_self','acc_old_rider',18])).rejects.toThrow();
      await expect(db.run(insert, ['clm_wrong_age','acc_old_parent',17])).rejects.toThrow();
      await db.run(insert, ['clm_valid','acc_old_parent',18]);
      await expect(db.run(insert, ['clm_duplicate','acc_old_parent',18])).rejects.toThrow();
      await expect(db.run(`DELETE FROM accounts WHERE id='acc_old_rider'`)).rejects.toThrow();
      await expect(db.run(`DELETE FROM junior_profiles WHERE id='jun_old'`)).rejects.toThrow();
    } finally { await db.close(); }
  });
});

describe('migration 33: stable post-claim registration names', () => {
  it('captures an enforcement baseline for old claims and supports an older writer without rewriting approval evidence', async () => {
    const url = await testDatabaseUrl({ empty: true });
    const client = new pg.Client({ connectionString: url }); await client.connect();
    let before: object;
    try {
      await client.query(`CREATE TABLE schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
      for (let v = 0; v < 32; v++) { await client.query(MIGRATIONS[v]); await client.query(`INSERT INTO schema_migrations(version) VALUES ($1)`, [v + 1]); }
      await client.query(`INSERT INTO accounts(id,provider_user_id,email,created_at) VALUES ('acc_name_support','test|support@name.test','support@name.test','2026-02-28T12:00Z'),('acc_name_rider','test|rider@name.test','rider@name.test','2026-02-28T12:00Z')`);
      await client.query(`INSERT INTO junior_profiles(id,created_by_account_id,name_key,first_name,last_name,created_at) VALUES ('jun_name_old','acc_name_support','before snapshot','Before','Snapshot','2026-02-28T12:00Z')`);
      await client.query(`INSERT INTO junior_profile_claims(id,junior_profile_id,rider_account_id,approved_by,client_request_id,birth_date,time_zone,review_reference,minimum_age,approved_at) VALUES ('clm_name_old','jun_name_old','acc_name_rider','acc_name_support','legacy-name-request','2008-02-29','UTC','FICTIONAL-CASE-33',18,'2026-03-01T00:00Z')`);
      before = (await client.query(`SELECT to_jsonb(c) AS value FROM junior_profile_claims c WHERE id='clm_name_old'`)).rows[0].value;
    } finally { await client.end(); }
    const db = openDb(url);
    try {
      await db.migrate();
      expect(await db.get(`SELECT registration_name_json FROM junior_profile_claims WHERE id='clm_name_old'`)).toEqual({ registration_name_json: { firstName: 'Before', lastName: 'Snapshot' } });
      expect(await db.get(`SELECT to_jsonb(c)-'registration_name_json' AS value FROM junior_profile_claims c WHERE id='clm_name_old'`)).toEqual({ value: before! });
      await db.run(`UPDATE junior_profiles SET first_name='Private',last_name='Correction' WHERE id='jun_name_old'`);
      expect(await db.get(`SELECT registration_name_json FROM junior_profile_claims WHERE id='clm_name_old'`)).toEqual({ registration_name_json: { firstName: 'Before', lastName: 'Snapshot' } });
      await db.run(`INSERT INTO junior_profiles(id,created_by_account_id,name_key,first_name,last_name,created_at) VALUES ('jun_name_new','acc_name_support','after capture','After','Capture','2026-02-28T12:00Z')`);
      // A schema-32 application does not send the new column; the trigger captures it atomically.
      await db.run(`INSERT INTO junior_profile_claims(id,junior_profile_id,rider_account_id,approved_by,client_request_id,birth_date,time_zone,review_reference,minimum_age,approved_at) VALUES ('clm_name_new','jun_name_new','acc_name_rider','acc_name_support','new-name-request','2008-02-29','UTC','FICTIONAL-NEW-33',18,'2026-03-01T00:00Z')`);
      expect(await db.get(`SELECT registration_name_json FROM junior_profile_claims WHERE id='clm_name_new'`)).toEqual({ registration_name_json: { firstName: 'After', lastName: 'Capture' } });
    } finally { await db.close(); }
  });
});

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
