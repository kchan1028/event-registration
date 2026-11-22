import pg from 'pg';
import { expect, it } from 'vitest';
import { as } from './support/auth';
import { testApp, testDatabaseUrl } from './support/db';
import type { EventConfig } from '../src/shared/schema';
import { publishReviewed } from './support/publish';

const generatedAt = '2027-03-01T18:00:00.000Z';

async function setup() {
  const databaseUrl = await testDatabaseUrl();
  const { app } = await testApp({ databaseUrl, now: () => new Date(generatedAt) });
  const { eventId, organizationId } = (await app.inject({ method: 'POST', url: '/api/demo' })).json();
  const eventUrl = `/api/events/${eventId}`;
  expect((await publishReviewed(app, eventUrl, { acknowledgeWarnings: true })).statusCode).toBe(200);
  const { config } = (await app.inject({ method: 'GET', url: eventUrl })).json() as { config: EventConfig };
  const raceId = config.races[0].id;
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  return { app, client, eventId, eventUrl, organizationId, raceId };
}

it('records authenticated actors and file scope for protected CSV responses', async () => {
  const { app, client, eventId, eventUrl, organizationId, raceId } = await setup();
  try {
    const owner = (await app.inject({ url: '/api/me' })).json().account.id;
    const finance = as('finance@export-audit.test');
    const timer = as('timer@export-audit.test');
    const financeId = (await app.inject({ url: '/api/me', headers: finance })).json().account.id;
    const timerId = (await app.inject({ url: '/api/me', headers: timer })).json().account.id;
    for (const [role, email] of [['finance', 'finance@export-audit.test'], ['timer_export', 'timer@export-audit.test']]) {
      expect((await app.inject({ method: 'POST', url: `/api/organizations/${organizationId}/members`, payload: { role, email } })).statusCode).toBe(200);
    }
    expect((await app.inject({ method: 'POST', url: `${eventUrl}/start-lists/${raceId}/snapshots` })).statusCode).toBe(201);
    const downloads = [
      { path: 'exports/entries.csv', kind: 'entries', actor: owner, headers: {} },
      { path: 'exports/ledger.csv', kind: 'ledger', actor: financeId, headers: finance },
      { path: 'exports/reconciliation.csv', kind: 'reconciliation', actor: financeId, headers: finance },
      { path: 'start-lists/all/csv', kind: 'start_list', actor: timerId, headers: timer, raceId: 'all' },
      { path: `start-lists/${raceId}/csv`, kind: 'start_list', actor: timerId, headers: timer, raceId },
      { path: `start-lists/${raceId}/csv?snapshot=1`, kind: 'start_list', actor: timerId, headers: timer, raceId, snapshot: 1 },
    ];
    for (const sample of downloads) {
      const response = await app.inject({ url: `${eventUrl}/${sample.path}`, headers: sample.headers });
      expect(response.statusCode, response.body).toBe(200);
      expect(response.headers['content-disposition']).toContain('attachment;');
      expect(response.headers['cache-control']).toBe('no-store');
    }
    const rows = await client.query(`SELECT actor_account_id,event_id,export_kind,race_id,snapshot_version,generated_at FROM protected_export_audit`);
    expect(rows.rowCount).toBe(downloads.length);
    expect(rows.rows).toEqual(expect.arrayContaining(downloads.map((sample) => ({
      actor_account_id: sample.actor, event_id: eventId, export_kind: sample.kind,
      race_id: sample.raceId ?? null, snapshot_version: sample.snapshot ?? null, generated_at: new Date(generatedAt),
    }))));
  } finally {
    await client.end();
  }
});

it('does not record HEAD, denied or invalid requests, and withholds CSV when recording fails', async () => {
  const { app, client, eventUrl, organizationId, raceId } = await setup();
  const entries = `${eventUrl}/exports/entries.csv`;
  const startList = `${eventUrl}/start-lists/${raceId}/csv`;
  try {
    const outsider = as('outsider@export-audit.test');
    const manager = as('manager@export-audit.test');
    await app.inject({ url: '/api/me', headers: manager });
    expect((await app.inject({ method: 'POST', url: `/api/organizations/${organizationId}/members`, payload: { role: 'registration_manager', email: 'manager@export-audit.test' } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'HEAD', url: entries })).statusCode).toBe(200);
    expect((await app.inject({ method: 'HEAD', url: startList })).statusCode).toBe(200);
    const checks = [
      { url: entries, headers: { authorization: 'Bearer invalid' }, status: 401 },
      { url: entries, headers: outsider, status: 404 },
      { url: `${eventUrl}/exports/ledger.csv`, headers: manager, status: 403 },
      { url: `${startList}?snapshot=999`, headers: {}, status: 404 },
      { url: `${startList}?snapshot=0`, headers: {}, status: 400 },
    ];
    for (const { url, headers, status } of checks) {
      const response = await app.inject({ url, headers });
      expect(response.statusCode).toBe(status);
      expect(response.headers['content-disposition']).toBeUndefined();
    }
    expect((await client.query('SELECT id FROM protected_export_audit')).rows).toEqual([]);

    await client.query('ALTER TABLE protected_export_audit ADD CONSTRAINT reject_test_audit CHECK (false)');
    for (const url of [entries, startList]) {
      const response = await app.inject({ url });
      expect(response.statusCode).toBe(500);
      expect(response.headers['content-disposition']).toBeUndefined();
      expect(response.headers['content-type']).not.toContain('text/csv');
    }
    expect((await client.query('SELECT id FROM protected_export_audit')).rows).toEqual([]);
    await client.query('ALTER TABLE protected_export_audit DROP CONSTRAINT reject_test_audit');
    expect((await app.inject({ url: entries })).statusCode).toBe(200);
    expect((await client.query('SELECT id FROM protected_export_audit')).rowCount).toBe(1);
  } finally {
    await client.end();
  }
});
