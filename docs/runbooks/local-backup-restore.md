# Local fictional-data backup and restore

Status: Implemented technical rehearsal procedure. This checks a local logical archive and the recovered application records. It does not configure scheduled/off-site backups, hosted recovery, point-in-time recovery or a live failover. No real rider data, provider calls, cloud resources or deployment are authorized. Phase 3 gates remain in the [roadmap](../../roadmap.md#phase-3--make-race-day-operable); requirements remain in [product.md](../../product.md#quality-requirements).

## Boundaries and prerequisites

The technical lead runs this in an isolated checkout/worktree, one rehearsal at a time, using the existing [local PostgreSQL container](local-setup.md#what-you-need). Use dependencies installed with `npm ci` under the [local setup](local-setup.md#steps). A worktree can resolve dependencies from its parent checkout: if intentionally reusing them, confirm the lockfiles match and record the parent path in the evidence. That is a reused-dependency rehearsal, not verification of a clean install. The examples use `/usr/local/bin/docker`, the existing container `cyclereg-postgres`, and the documented local-only `cyclereg` test credentials at `127.0.0.1:5432`. Confirm these describe your local setup before running anything. Do not substitute a shared working database or a remote URL.

Use matching PostgreSQL 17 server/dump/restore tools in that container. The dump uses custom format; the restore uses one transaction and stops on errors. It deliberately omits ownership and access-control restoration: application membership tables are checked, but PostgreSQL cluster roles, grants and tablespaces are not established by this procedure. Do not use `--create` or `--clean`: restore goes into a separately created empty database, never back into the source.

The helper explicitly selects simulated payment, recorded-only email and local test authentication for two fictional organizer accounts. It loads no `.env` file and starts no network listener. The fixed application clock and demonstration riders are fictional. A source database must be empty before seeding.

## 1. Create new databases

Run all blocks in the same terminal from the repository root. `set -e` stops at the first unexpected failure. A database-name collision is a stop condition: choose a new run ID; do not delete an existing database to make room.

```bash
set -e
umask 077
export RESTORE_RUN_ID=$(date -u +%Y%m%d%H%M%S)
export RESTORE_SOURCE_DB=cyclereg_restore_source_${RESTORE_RUN_ID}
export RESTORE_TARGET_DB=cyclereg_restore_target_${RESTORE_RUN_ID}
export RESTORE_REJECT_DB=cyclereg_restore_reject_${RESTORE_RUN_ID}
mkdir -p data/restore-rehearsal
chmod 700 data/restore-rehearsal
git rev-parse HEAD
/usr/local/bin/docker exec cyclereg-postgres pg_dump --version
/usr/local/bin/docker exec cyclereg-postgres pg_restore --version
/usr/local/bin/docker exec cyclereg-postgres psql -U cyclereg -d postgres -Atc 'SHOW server_version'
/usr/local/bin/docker exec cyclereg-postgres createdb -U cyclereg "$RESTORE_SOURCE_DB"
printf 'Created source: %s\n' "$RESTORE_SOURCE_DB"
/usr/local/bin/docker exec cyclereg-postgres createdb -U cyclereg "$RESTORE_TARGET_DB"
printf 'Created target: %s\n' "$RESTORE_TARGET_DB"
```

`data/` is ignored. The archive and fixture metadata contain fictional rider records and must remain local, outside commits and public attachments. The manifest contains table counts/hashes rather than raw table records. This is not an encryption or real-data retention policy.

## 2. Write the rehearsal helper and seed

The helper creates an example weekend with paid/unpaid entries, a paid-but-blocked rider, one issued bib/check-in, a locked start list, attributed protected CSVs and a recorded ownership handoff. It records every public table's row count and hash, plus columns, constraints, indexes and sequence metadata. The source application closes before dumping, so this is a quiescent snapshot exercise, not evidence of backup consistency under concurrent writers.

```bash
cat > data/restore-rehearsal/rehearse.ts <<'TS'
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import pg from 'pg';
import { buildApp } from '../../src/server/app';
import { testAuth } from '../../src/server/auth';
import { localEmail } from '../../src/server/email';
import { paymentsFromEnv } from '../../src/server/payments';

const mode = process.argv[2];
assert(mode === 'seed' || mode === 'verify');
const source = process.env.RESTORE_SOURCE_DB ?? '';
const target = process.env.RESTORE_TARGET_DB ?? '';
assert(/^cyclereg_restore_source_[0-9]+$/.test(source));
assert(/^cyclereg_restore_target_[0-9]+$/.test(target));
const url = (name: string) => `postgres://cyclereg:cyclereg@127.0.0.1:5432/${name}`;
const directory = 'data/restore-rehearsal';

// Only hashes/counts go in the manifest; the archive still contains fictional data.
async function manifest(name: string) {
  const client = new pg.Client({ connectionString: url(name) });
  await client.connect();
  try {
    assert.equal((await client.query('SELECT current_database() AS name')).rows[0].name, name);
    const tables = (await client.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename")).rows;
    const data = [];
    for (const { tablename } of tables) {
      const identifier = '"' + tablename.replaceAll('"', '""') + '"';
      const rows = (await client.query(`SELECT to_jsonb(t)::text AS value FROM public.${identifier} t ORDER BY 1`)).rows;
      data.push({ table: tablename, count: rows.length, sha256: createHash('sha256').update(JSON.stringify(rows)).digest('hex') });
    }
    const columns = (await client.query("SELECT table_name, column_name, ordinal_position, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position")).rows;
    const constraints = (await client.query("SELECT c.relname, k.conname, pg_get_constraintdef(k.oid) AS definition FROM pg_constraint k JOIN pg_class c ON c.oid = k.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' ORDER BY c.relname, k.conname")).rows;
    const indexes = (await client.query("SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' ORDER BY tablename, indexname")).rows;
    const sequences = (await client.query("SELECT sequencename, last_value, increment_by, min_value, max_value, cache_size, cycle FROM pg_sequences WHERE schemaname = 'public' ORDER BY sequencename")).rows;
    return { data, columns, constraints, indexes, sequences };
  } finally { await client.end(); }
}

async function exportAudit(name: string, eventId: string) {
  const client = new pg.Client({ connectionString: url(name) });
  await client.connect();
  try {
    return (await client.query(`
      SELECT id, actor_account_id, export_kind, race_id, snapshot_version, generated_at
      FROM protected_export_audit WHERE event_id = $1 ORDER BY id
    `, [eventId])).rows;
  } finally { await client.end(); }
}

if (mode === 'seed') assert.equal((await manifest(source)).data.length, 0, 'Source must be a new empty rehearsal database.');
const database = mode === 'seed' ? source : target;
if (mode === 'verify') {
  assert.deepEqual(await manifest(target), JSON.parse(readFileSync(`${directory}/manifest.json`, 'utf8')));
  console.log('Restored table hashes/counts, columns, constraints, indexes and sequences match.');
}
const formerOwner = 'restore.owner@example.test';
const successor = 'restore.successor@example.test';
const { app } = buildApp({ databaseUrl: url(database), auth: testAuth(), email: localEmail(), payments: paymentsFromEnv({}), now: () => new Date('2027-03-01T18:00:00Z') });
const headersFor = (email: string) => ({ authorization: `Bearer test:${email}` });
let actor = formerOwner;
async function request(method: 'GET' | 'POST' | 'PUT', path: string, status: number, payload?: object, email = actor) {
  const response = await app.inject({ method, url: path, payload, headers: headersFor(email) });
  assert.equal(response.statusCode, status, `${method} ${path}: ${response.body}`);
  return response.json();
}
async function download(path: string) {
  const response = await app.inject({ method: 'GET', url: path, headers: headersFor(actor) });
  assert.equal(response.statusCode, 200, 'Protected CSV must return 200.');
  assert.match(String(response.headers['content-disposition']), /^attachment;/);
  assert.match(String(response.headers['content-type']), /^text\/csv/);
}

try {
  if (mode === 'seed') {
    const { eventId, organizationId } = await request('POST', '/api/demo', 201);
    await request('POST', `/api/events/${eventId}/publish`, 200, { acknowledgeWarnings: true });
    await request('POST', `/api/events/${eventId}/check-in-demo-riders`, 201);
    await request('PUT', `/api/events/${eventId}/bib-settings`, 200, { scope: 'weekend', ranges: [{ scope: 'weekend', first: 100, last: 199 }] });
    const list = await request('GET', `/api/events/${eventId}/check-in`, 200);
    const ready = list.riders.find((r: any) => r.result.ready);
    const blocked = list.riders.find((r: any) => r.payment === 'confirmed' && !r.result.ready);
    assert(ready && blocked);
    const checked = await request('POST', `/api/events/${eventId}/check-in/${ready.orderId}`, 200, { dayId: list.dayId, bib: null });
    assert.equal(checked.bib, 100);
    await request('POST', `/api/events/${eventId}/check-in/${blocked.orderId}`, 409, { dayId: list.dayId, bib: null });
    const lists = await request('GET', `/api/events/${eventId}/start-lists`, 200);
    const raceId = lists.races[0].raceId;
    await request('POST', `/api/events/${eventId}/start-lists/${raceId}/lock`, 201);
    const { account } = await request('GET', '/api/me', 200);
    await download(`/api/events/${eventId}/exports/ledger.csv`);
    await download(`/api/events/${eventId}/start-lists/${raceId}/csv?snapshot=1`);
    const audit = await exportAudit(source, eventId);
    assert.equal(audit.length, 2);
    const generation = { actor_account_id: account.id, generated_at: new Date('2027-03-01T18:00:00Z') };
    assert.deepEqual(audit.map(({ id, ...row }) => row).sort((a, b) => a.export_kind.localeCompare(b.export_kind)), [
      { ...generation, export_kind: 'ledger', race_id: null, snapshot_version: null },
      { ...generation, export_kind: 'start_list', race_id: raceId, snapshot_version: 1 },
    ]);
    const organization = `/api/organizations/${organizationId}`;
    const { account: incoming } = await request('GET', '/api/me', 200, undefined, successor);
    await request('POST', `${organization}/members`, 200, { email: successor, role: 'check_in_volunteer' });
    await request('POST', `${organization}/members`, 200, { email: formerOwner, role: 'finance' });
    await request('POST', `${organization}/ownership-transfer`, 200, { email: successor });
    await request('GET', `${organization}/members`, 403);
    actor = successor;
    const team = await request('GET', `${organization}/members`, 200);
    assert.deepEqual(team.members, [
      { accountId: account.id, email: formerOwner, role: 'finance' },
      { accountId: incoming.id, email: successor, role: 'check_in_volunteer' },
      { accountId: incoming.id, email: successor, role: 'owner' },
    ]);
    assert.deepEqual(team.history.filter((entry: { action: string }) => entry.action === 'ownership_transferred'), [
      { action: 'ownership_transferred', email: successor, role: 'owner', by: formerOwner, at: '2027-03-01T18:00:00.000Z' },
    ]);
    writeFileSync(`${directory}/fixture.json`, JSON.stringify({
      eventId, organization, successorId: incoming.id, team, dayId: list.dayId, readyId: ready.orderId,
      blockedId: blocked.orderId, raceId, lists: await request('GET', `/api/events/${eventId}/start-lists`, 200),
    }));
  } else {
    const fixture = JSON.parse(readFileSync(`${directory}/fixture.json`, 'utf8'));
    await request('GET', '/api/health', 200);
    await request('GET', `${fixture.organization}/members`, 403);
    actor = successor;
    assert.deepEqual(await request('GET', `${fixture.organization}/members`, 200), fixture.team);
    console.log('Restored ownership handoff, retained roles and actor-attributed history passed.');
    const list = await request('GET', `/api/events/${fixture.eventId}/check-in`, 200);
    const ready = list.riders.find((r: any) => r.orderId === fixture.readyId);
    const blocked = list.riders.find((r: any) => r.orderId === fixture.blockedId);
    assert(ready.checkedInAt && ready.bib === 100 && ready.result.ready);
    assert(blocked.payment === 'confirmed' && !blocked.result.ready && blocked.bib === null);
    assert.deepEqual(await request('GET', `/api/events/${fixture.eventId}/start-lists`, 200), fixture.lists);
    const before = await manifest(target);
    const repeated = await request('POST', `/api/events/${fixture.eventId}/check-in/${fixture.readyId}`, 200, { dayId: fixture.dayId, bib: null });
    assert.equal(repeated.bib, 100);
    await request('POST', `/api/events/${fixture.eventId}/check-in/${fixture.blockedId}`, 409, { dayId: fixture.dayId, bib: null });
    assert.deepEqual(await manifest(target), before);
    console.log('Health, paid-but-blocked readiness, existing bib/check-in, repeat safety and locked start list passed.');
    const restoredAudit = await exportAudit(target, fixture.eventId);
    assert.equal(restoredAudit.length, 2);
    await download(`/api/events/${fixture.eventId}/exports/ledger.csv`);
    const allAudit = await exportAudit(target, fixture.eventId);
    assert.equal(allAudit.length, 3);
    assert.deepEqual(allAudit.filter((row) => restoredAudit.some((old) => old.id === row.id)), restoredAudit);
    const [appended] = allAudit.filter((row) => !restoredAudit.some((old) => old.id === row.id));
    assert.deepEqual({ ...appended, id: null }, {
      id: null, actor_account_id: fixture.successorId, export_kind: 'ledger', race_id: null,
      snapshot_version: null, generated_at: new Date('2027-03-01T18:00:00Z'),
    });
    const after = await manifest(target);
    assert.deepEqual({ ...after, data: after.data.filter((row) => row.table !== 'protected_export_audit') },
      { ...before, data: before.data.filter((row) => row.table !== 'protected_export_audit') });
    console.log('Restored audit rows and new attributed ledger generation passed.');
  }
} finally { await app.close(); }
if (mode === 'seed') {
  const result = await manifest(source);
  for (const table of ['orders', 'order_entries', 'payment_attempts', 'bib_assignments', 'check_ins', 'start_list_snapshots', 'start_list_locks', 'organization_members', 'protected_export_audit']) {
    assert(result.data.some((row) => row.table === table && row.count > 0), `${table} must be populated`);
  }
  writeFileSync(`${directory}/manifest.json`, JSON.stringify(result));
  console.log(JSON.stringify({ tables: result.data.length, populated: result.data.filter((row) => row.count > 0).map((row) => ({ table: row.table, count: row.count })) }));
}
TS
npx tsx data/restore-rehearsal/rehearse.ts seed
```

Expected: JSON with a nonzero table count and the populated fixture tables. Any assertion or API failure stops the run. Inspect and fix the rehearsal setup using a fresh source/target pair; do not relax readiness or payment rules to obtain a pass.

## 3. Archive, restore and compare

```bash
/usr/local/bin/docker exec cyclereg-postgres pg_dump -U cyclereg --format=custom "$RESTORE_SOURCE_DB" > data/restore-rehearsal/local.dump
test -s data/restore-rehearsal/local.dump
wc -c data/restore-rehearsal/local.dump
shasum -a 256 data/restore-rehearsal/local.dump > data/restore-rehearsal/local.dump.sha256
shasum -a 256 -c data/restore-rehearsal/local.dump.sha256
cat data/restore-rehearsal/local.dump.sha256
/usr/local/bin/docker exec -i cyclereg-postgres pg_restore -U cyclereg --dbname="$RESTORE_TARGET_DB" --no-owner --no-acl --single-transaction --exit-on-error < data/restore-rehearsal/local.dump
npx tsx data/restore-rehearsal/rehearse.ts verify
```

Do not start the application or run migrations against the empty target before restoring. Verification first compares the recovered public tables and selected schema metadata, then opens the application and checks health, the existing checked-in bib, paid-but-blocked readiness and the locked start list. Verify the former owner has lost team administration, retains the Finance role, and the successor can read the original handoff history. It retries the existing check-in and the blocked check-in, and verifies neither changes the table manifest. A new protected ledger download by the successor must append one attributed row while the two restored audit rows and all other persisted state remain unchanged. This checks the current sample's records; it does not prove all schema objects, every financial recovery path or real provider reconciliation.

Expected: `Restored table hashes/counts, columns, constraints, indexes and sequences match.` The recovered check-in/start-list assertions pass, followed by `Restored audit rows and new attributed ledger generation passed.` A mismatch is a failed recovery. Keep the archive/source for investigation and do not substitute the target for a working service. Do not import missing records or replay payments merely to make totals match.

## 4. Rehearse refusal and rollback

First confirm seeding refuses the populated rehearsal source. Then use a third new database with one deliberately conflicting marker table; the restore must fail and roll back its imported objects, preserving only that marker. This is a controlled schema-conflict test, not a test of every corrupt archive, disk failure or recovery interruption.

```bash
if npx tsx data/restore-rehearsal/rehearse.ts seed > data/restore-rehearsal/nonempty-source.log 2>&1; then
  echo 'Unexpected seed success'; exit 1
fi
grep -m 1 'Source must be a new empty rehearsal database' data/restore-rehearsal/nonempty-source.log
/usr/local/bin/docker exec cyclereg-postgres createdb -U cyclereg "$RESTORE_REJECT_DB"
printf 'Created rejection target: %s\n' "$RESTORE_REJECT_DB"
/usr/local/bin/docker exec cyclereg-postgres psql -U cyclereg -d "$RESTORE_REJECT_DB" -v ON_ERROR_STOP=1 -c "CREATE TABLE orders (marker text PRIMARY KEY); INSERT INTO orders VALUES ('preserved');"
if /usr/local/bin/docker exec -i cyclereg-postgres pg_restore -U cyclereg --dbname="$RESTORE_REJECT_DB" --no-owner --no-acl --single-transaction --exit-on-error < data/restore-rehearsal/local.dump > data/restore-rehearsal/rejected-restore.log 2>&1; then
  echo 'Unexpected restore success'; exit 1
fi
grep -m 1 'already exists' data/restore-rehearsal/rejected-restore.log
test "$(/usr/local/bin/docker exec cyclereg-postgres psql -U cyclereg -d "$RESTORE_REJECT_DB" -Atc "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")" = orders
test "$(/usr/local/bin/docker exec cyclereg-postgres psql -U cyclereg -d "$RESTORE_REJECT_DB" -Atc 'SELECT marker FROM orders')" = preserved
```

A restore error is not permission to continue with partial data. The intended target must remain isolated and unserved until checks pass and an accountable operator accepts it. This procedure authorizes no service cutover.

## 5. Record evidence and clean up

Keep execution evidence in the PR or a dated rehearsal record under the [test plan](../testing/test-plan.md#5-manual-checks): author/verifier, full source commit, tool/server versions, created database names, archive byte size and checksum, compared table count, populated fixture coverage, successful and failed commands, recovered workflow results and remaining gaps. Do not attach the archive or raw fixture/record dumps. A second operator repeats the procedure with a fresh run ID and records their own result.

After preserving the public-safe evidence and confirming these databases were created by this rehearsal, drop only those exact three names. If creation failed because a name already existed, do not run cleanup against that database. Check the variables against the creation log first.

For a partial failure, do not run the three-database cleanup block wholesale. Drop only names with a successful **Created source/target/rejection target** message from this run: for example, a stop before rejection-target creation leaves only source/target to remove. Skip databases that were never created, and never delete a database named in a collision error. Preserve diagnostics before removing the listed local files. `rm -f` tolerates artifacts that were never written; `rmdir` leaves any unlisted files in place rather than removing a directory recursively.

```bash
case "$RESTORE_SOURCE_DB:$RESTORE_TARGET_DB:$RESTORE_REJECT_DB" in
  "cyclereg_restore_source_${RESTORE_RUN_ID}:cyclereg_restore_target_${RESTORE_RUN_ID}:cyclereg_restore_reject_${RESTORE_RUN_ID}") ;;
  *) echo 'Unexpected rehearsal names'; exit 1 ;;
esac
/usr/local/bin/docker exec cyclereg-postgres dropdb -U cyclereg "$RESTORE_SOURCE_DB"
/usr/local/bin/docker exec cyclereg-postgres dropdb -U cyclereg "$RESTORE_TARGET_DB"
/usr/local/bin/docker exec cyclereg-postgres dropdb -U cyclereg "$RESTORE_REJECT_DB"
rm -f data/restore-rehearsal/local.dump data/restore-rehearsal/local.dump.sha256 data/restore-rehearsal/manifest.json data/restore-rehearsal/fixture.json data/restore-rehearsal/nonempty-source.log data/restore-rehearsal/rejected-restore.log data/restore-rehearsal/rehearse.ts
rmdir data/restore-rehearsal
```

## Remaining operating gates

The [operations open questions](../operations.md#open-questions) still own acceptable data-loss/recovery-time targets, support/deputy ownership, monitoring and retention. Before hosted recovery or real rider data, agree those targets and access rules, demonstrate scheduled/off-site backups and restoration in the selected hosted environment, reconcile provider payments/refunds after the recovery point, and obtain operator acceptance. This local exercise measures none of those launch criteria and does not establish a recovery SLA. Logical archives alone do not provide point-in-time recovery.

The primary references below were accessed November 16, 2026 through Context7 using PostgreSQL 17 documentation. [pg_dump](https://www.postgresql.org/docs/17/app-pgdump.html) documents custom archives and single-database scope; [pg_restore](https://www.postgresql.org/docs/17/app-pgrestore.html) documents single-transaction restore, error handling, ownership/access-control options and the database-name behavior of `--create`. Database cluster roles/tablespaces need separate treatment under [pg_dumpall](https://www.postgresql.org/docs/17/app-pg-dumpall.html); no cluster dump is performed here.
