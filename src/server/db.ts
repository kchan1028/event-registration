import { AsyncLocalStorage } from 'node:async_hooks';
import pg from 'pg';

/**
 * PostgreSQL access (ADR 0004). Every query goes through `all`, `get`, or `run`.
 * Inside `transaction`, those calls run on the transaction's connection
 * automatically, so helpers work the same inside and outside a transaction.
 *
 * Timestamps are timestamptz (migration 13). The driver hands them back as ISO 8601
 * UTC strings (`2027-03-01T18:00:00.000Z`), the form the domain code compares and the
 * API returns, and accepts the same strings as parameters. JSON columns are jsonb;
 * the driver returns parsed values.
 */

export type Param = string | number | boolean | null | readonly string[] | readonly number[];

export interface Db {
  all<T>(sql: string, params?: readonly Param[]): Promise<T[]>;
  get<T>(sql: string, params?: readonly Param[]): Promise<T | undefined>;
  /** Runs a statement and returns the number of rows it changed. */
  run(sql: string, params?: readonly Param[]): Promise<number>;
  /** Runs `fn` in one transaction. A nested call becomes a savepoint inside the outer transaction. */
  transaction<T>(fn: () => Promise<T>): Promise<T>;
  /**
   * Serializes writers on one key (for example `event:<id>`) until the current
   * transaction ends. Capacity, holds, payments, bibs, and the ledger take the
   * event's lock first, so two requests for the last place give exactly one entry.
   */
  lock(key: string): Promise<void>;
  /** Applies pending migrations once per process; safe when several instances start together. */
  migrate(): Promise<void>;
  close(): Promise<void>;
}

// seq columns keep insertion order for ties on a timestamp (SQLite used rowid).
export const MIGRATIONS: string[] = [
  `
  CREATE TABLE organizations (
    id text PRIMARY KEY,
    seq bigint GENERATED ALWAYS AS IDENTITY,
    name text NOT NULL,
    created_at text NOT NULL
  );
  CREATE TABLE events (
    id text PRIMARY KEY,
    seq bigint GENERATED ALWAYS AS IDENTITY,
    organization_id text NOT NULL REFERENCES organizations(id),
    draft_json jsonb NOT NULL,
    revision integer NOT NULL,
    published_version integer,
    published_revision integer,
    created_at text NOT NULL,
    updated_at text NOT NULL
  );
  CREATE INDEX events_by_org ON events(organization_id);
  -- Published configurations are immutable snapshots.
  CREATE TABLE event_versions (
    event_id text NOT NULL REFERENCES events(id),
    version integer NOT NULL,
    config_json jsonb NOT NULL,
    draft_revision integer NOT NULL,
    warnings_acknowledged integer NOT NULL,
    published_at text NOT NULL,
    PRIMARY KEY (event_id, version)
  );
  -- Simulated entries for exercising capacity rules. No payment and no rider data.
  CREATE TABLE test_entries (
    id text PRIMARY KEY,
    event_id text NOT NULL REFERENCES events(id),
    category_id text NOT NULL,
    rider_ref text NOT NULL,
    created_at text NOT NULL,
    UNIQUE (event_id, category_id, rider_ref)
  );
  CREATE INDEX test_entries_by_event ON test_entries(event_id);
  `,
  `
  -- Rider orders. Payment is simulated; no money moves.
  CREATE TABLE orders (
    id text PRIMARY KEY,
    seq bigint GENERATED ALWAYS AS IDENTITY,
    event_id text NOT NULL REFERENCES events(id),
    published_version integer NOT NULL,
    client_request_id text NOT NULL,
    status text NOT NULL,
    rider_json jsonb NOT NULL,
    waiver_json jsonb NOT NULL,
    quote_json jsonb NOT NULL,
    total_cents integer NOT NULL,
    hold_expires_at text NOT NULL,
    check_in_code text,
    created_at text NOT NULL,
    updated_at text NOT NULL,
    confirmed_at text,
    UNIQUE (event_id, client_request_id)
  );
  CREATE INDEX orders_by_event ON orders(event_id);
  CREATE TABLE order_entries (
    id text PRIMARY KEY,
    seq bigint GENERATED ALWAYS AS IDENTITY,
    order_id text NOT NULL REFERENCES orders(id),
    event_id text NOT NULL REFERENCES events(id),
    category_id text NOT NULL,
    rider_ref text NOT NULL,
    status text NOT NULL,
    license_reviewed boolean NOT NULL DEFAULT false,
    license_review_note text,
    license_reviewed_at text
  );
  CREATE INDEX order_entries_by_event ON order_entries(event_id);
  CREATE INDEX order_entries_by_order ON order_entries(order_id, seq);
  -- Each simulated payment notification is processed once.
  CREATE TABLE payment_attempts (
    id text PRIMARY KEY,
    order_id text NOT NULL REFERENCES orders(id),
    outcome text NOT NULL,
    result_status text NOT NULL,
    created_at text NOT NULL
  );
  `,
  `
  -- Race-day check-in.
  CREATE TABLE bib_settings (
    event_id text PRIMARY KEY REFERENCES events(id),
    settings_json jsonb NOT NULL,
    updated_at text NOT NULL
  );
  -- Bib history: a changed bib is released with a reason, never deleted.
  CREATE TABLE bib_assignments (
    id text PRIMARY KEY,
    seq bigint GENERATED ALWAYS AS IDENTITY,
    event_id text NOT NULL REFERENCES events(id),
    scope text NOT NULL,
    order_id text NOT NULL REFERENCES orders(id),
    bib integer NOT NULL,
    assigned_at text NOT NULL,
    released_at text,
    release_reason text
  );
  CREATE UNIQUE INDEX bib_active_number ON bib_assignments(event_id, scope, bib) WHERE released_at IS NULL;
  CREATE UNIQUE INDEX bib_active_rider ON bib_assignments(event_id, scope, order_id) WHERE released_at IS NULL;
  -- One check-in per rider (order) per race day; repeats return the first.
  CREATE TABLE check_ins (
    id text PRIMARY KEY,
    event_id text NOT NULL REFERENCES events(id),
    order_id text NOT NULL REFERENCES orders(id),
    day_id text NOT NULL,
    checked_in_at text NOT NULL,
    UNIQUE (event_id, order_id, day_id)
  );
  `,
  `
  -- Timestamped start-list snapshots per race. Immutable once saved; later changes show as a diff.
  CREATE TABLE start_list_snapshots (
    id text PRIMARY KEY,
    event_id text NOT NULL REFERENCES events(id),
    race_id text NOT NULL,
    version integer NOT NULL,
    published_version integer NOT NULL,
    rows_json jsonb NOT NULL,
    created_at text NOT NULL,
    UNIQUE (event_id, race_id, version)
  );
  `,
  `
  -- Organizer-managed waitlists. An active offer reserves a place for 24 hours.
  CREATE TABLE waitlist_entries (
    id text PRIMARY KEY,
    seq bigint GENERATED ALWAYS AS IDENTITY,
    event_id text NOT NULL REFERENCES events(id),
    category_id text NOT NULL,
    rider_json jsonb NOT NULL,
    status text NOT NULL,
    offer_token text UNIQUE,
    offered_at text,
    offer_expires_at text,
    order_id text REFERENCES orders(id),
    created_at text NOT NULL,
    updated_at text NOT NULL
  );
  CREATE INDEX waitlist_by_category ON waitlist_entries(event_id, category_id, created_at);
  `,
  `
  -- Organizer transfers and withdrawals of paid entries. The price paid is never changed;
  -- differences are recorded here and settled outside the app while payments are simulated.
  ALTER TABLE order_entries ADD COLUMN original_category_id text;
  ALTER TABLE order_entries ADD COLUMN withdrawn_at text;
  CREATE TABLE entry_changes (
    id text PRIMARY KEY,
    seq bigint GENERATED ALWAYS AS IDENTITY,
    event_id text NOT NULL REFERENCES events(id),
    order_id text NOT NULL REFERENCES orders(id),
    entry_id text NOT NULL REFERENCES order_entries(id),
    kind text NOT NULL,
    from_category_id text NOT NULL,
    to_category_id text,
    amount_paid_cents integer NOT NULL,
    new_price_cents integer,
    difference_cents integer,
    reason text NOT NULL,
    created_at text NOT NULL
  );
  CREATE INDEX entry_changes_by_order ON entry_changes(order_id, created_at);
  `,
  `
  -- Undone check-ins. The check_ins row is removed so the rider can be checked in again; this keeps the record.
  CREATE TABLE check_in_undos (
    id text PRIMARY KEY,
    seq bigint GENERATED ALWAYS AS IDENTITY,
    event_id text NOT NULL REFERENCES events(id),
    order_id text NOT NULL REFERENCES orders(id),
    day_id text NOT NULL,
    checked_in_at text NOT NULL,
    bib integer,
    bib_released boolean NOT NULL,
    reason text NOT NULL,
    undone_at text NOT NULL
  );
  CREATE INDEX check_in_undos_by_order ON check_in_undos(order_id, day_id);
  `,
  `
  -- Start-list locks. The organizer locks a race's list when sending it to the timer; it points at a snapshot.
  -- Changes after the lock are still allowed and are shown as revisions against the locked snapshot.
  CREATE TABLE start_list_locks (
    id text PRIMARY KEY,
    seq bigint GENERATED ALWAYS AS IDENTITY,
    event_id text NOT NULL REFERENCES events(id),
    race_id text NOT NULL,
    snapshot_version integer NOT NULL,
    locked_at text NOT NULL
  );
  CREATE INDEX start_list_locks_by_race ON start_list_locks(event_id, race_id, locked_at);
  `,
  `
  -- Measured check-in time: from the volunteer starting a search (or scan) to a successful check-in, in milliseconds.
  ALTER TABLE check_ins ADD COLUMN duration_ms integer;
  `,
  `
  -- Rider identity across orders. The organizer links orders that are the same rider; rider_key is the
  -- earliest order in the group. Unlinked orders have no row and are their own rider.
  CREATE TABLE rider_links (
    order_id text PRIMARY KEY REFERENCES orders(id),
    event_id text NOT NULL REFERENCES events(id),
    rider_key text NOT NULL REFERENCES orders(id),
    linked_at text NOT NULL
  );
  CREATE INDEX rider_links_by_key ON rider_links(event_id, rider_key);
  -- Suggested matches the organizer marked as different riders, so they are not suggested again.
  CREATE TABLE rider_link_dismissals (
    event_id text NOT NULL REFERENCES events(id),
    order_a text NOT NULL,
    order_b text NOT NULL,
    dismissed_at text NOT NULL,
    PRIMARY KEY (event_id, order_a, order_b)
  );
  `,
  `
  -- Answers to per-category questions and accepted category waiver addenda, per order.
  ALTER TABLE orders ADD COLUMN extras_json jsonb;
  `,
  `
  -- Resolution items for paid entries affected by a published change. One open item per entry at a time.
  CREATE TABLE entry_resolutions (
    id text PRIMARY KEY,
    seq bigint GENERATED ALWAYS AS IDENTITY,
    event_id text NOT NULL REFERENCES events(id),
    order_id text NOT NULL REFERENCES orders(id),
    entry_id text NOT NULL REFERENCES order_entries(id),
    published_version integer NOT NULL,
    details_json jsonb NOT NULL,
    status text NOT NULL,
    rider_notified boolean NOT NULL DEFAULT false,
    note text,
    created_at text NOT NULL,
    resolved_at text
  );
  CREATE INDEX entry_resolutions_by_event ON entry_resolutions(event_id, status);
  `,
  `
  -- Timestamps move from ISO 8601 text to timestamptz. Every stored value was written by the app
  -- as an ISO 8601 UTC string, so the cast is exact (millisecond precision is kept).
  ALTER TABLE organizations ALTER COLUMN created_at TYPE timestamptz USING created_at::timestamptz;
  ALTER TABLE events ALTER COLUMN created_at TYPE timestamptz USING created_at::timestamptz, ALTER COLUMN updated_at TYPE timestamptz USING updated_at::timestamptz;
  ALTER TABLE event_versions ALTER COLUMN published_at TYPE timestamptz USING published_at::timestamptz;
  ALTER TABLE test_entries ALTER COLUMN created_at TYPE timestamptz USING created_at::timestamptz;
  ALTER TABLE orders ALTER COLUMN hold_expires_at TYPE timestamptz USING hold_expires_at::timestamptz, ALTER COLUMN created_at TYPE timestamptz USING created_at::timestamptz, ALTER COLUMN updated_at TYPE timestamptz USING updated_at::timestamptz, ALTER COLUMN confirmed_at TYPE timestamptz USING confirmed_at::timestamptz;
  ALTER TABLE order_entries ALTER COLUMN license_reviewed_at TYPE timestamptz USING license_reviewed_at::timestamptz, ALTER COLUMN withdrawn_at TYPE timestamptz USING withdrawn_at::timestamptz;
  ALTER TABLE payment_attempts ALTER COLUMN created_at TYPE timestamptz USING created_at::timestamptz;
  ALTER TABLE bib_settings ALTER COLUMN updated_at TYPE timestamptz USING updated_at::timestamptz;
  ALTER TABLE bib_assignments ALTER COLUMN assigned_at TYPE timestamptz USING assigned_at::timestamptz, ALTER COLUMN released_at TYPE timestamptz USING released_at::timestamptz;
  ALTER TABLE check_ins ALTER COLUMN checked_in_at TYPE timestamptz USING checked_in_at::timestamptz;
  ALTER TABLE start_list_snapshots ALTER COLUMN created_at TYPE timestamptz USING created_at::timestamptz;
  ALTER TABLE waitlist_entries ALTER COLUMN offered_at TYPE timestamptz USING offered_at::timestamptz, ALTER COLUMN offer_expires_at TYPE timestamptz USING offer_expires_at::timestamptz, ALTER COLUMN created_at TYPE timestamptz USING created_at::timestamptz, ALTER COLUMN updated_at TYPE timestamptz USING updated_at::timestamptz;
  ALTER TABLE entry_changes ALTER COLUMN created_at TYPE timestamptz USING created_at::timestamptz;
  ALTER TABLE check_in_undos ALTER COLUMN checked_in_at TYPE timestamptz USING checked_in_at::timestamptz, ALTER COLUMN undone_at TYPE timestamptz USING undone_at::timestamptz;
  ALTER TABLE start_list_locks ALTER COLUMN locked_at TYPE timestamptz USING locked_at::timestamptz;
  ALTER TABLE rider_links ALTER COLUMN linked_at TYPE timestamptz USING linked_at::timestamptz;
  ALTER TABLE rider_link_dismissals ALTER COLUMN dismissed_at TYPE timestamptz USING dismissed_at::timestamptz;
  ALTER TABLE entry_resolutions ALTER COLUMN created_at TYPE timestamptz USING created_at::timestamptz, ALTER COLUMN resolved_at TYPE timestamptz USING resolved_at::timestamptz;
  `,  `
  -- Coupon codes per event (product.md: Promotions). Terms are copied into orders.quote_json at
  -- purchase, so editing or turning off a coupon never reprices an order. A redemption is the order
  -- itself: it counts while the order's hold is live and once it is paid; an expired, cancelled, or
  -- needs-attention order does not count. Counting and creating orders take the event lock.
  CREATE TABLE coupons (
    id text PRIMARY KEY,
    seq bigint GENERATED ALWAYS AS IDENTITY,
    event_id text NOT NULL REFERENCES events(id),
    code text NOT NULL,
    kind text NOT NULL CHECK (kind IN ('fixed', 'percent')),
    amount_cents integer CHECK (amount_cents > 0),
    percent integer CHECK (percent BETWEEN 1 AND 100),
    category_ids jsonb NOT NULL,
    valid_from text,
    valid_until text,
    max_redemptions integer CHECK (max_redemptions > 0),
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    UNIQUE (event_id, code),
    CHECK ((kind = 'fixed' AND amount_cents IS NOT NULL AND percent IS NULL) OR (kind = 'percent' AND percent IS NOT NULL AND amount_cents IS NULL))
  );
  ALTER TABLE orders ADD COLUMN coupon_id text REFERENCES coupons(id);
  CREATE INDEX orders_by_coupon ON orders(coupon_id) WHERE coupon_id IS NOT NULL;
  `,
  `
  -- Sign-in (ADR 0003, Phase 2 email sign-in). One account per person, keyed by the identity
  -- provider's user ID; the email is the provider's verified primary address.
  CREATE TABLE accounts (
    id text PRIMARY KEY,
    seq bigint GENERATED ALWAYS AS IDENTITY,
    provider_user_id text NOT NULL UNIQUE,
    email text NOT NULL,
    created_at timestamptz NOT NULL
  );
  CREATE UNIQUE INDEX accounts_by_email ON accounts(lower(email));
  -- Organizer roles. A person can hold several roles in one organization.
  CREATE TABLE organization_members (
    organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    account_id text NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    role text NOT NULL CHECK (role IN ('owner', 'registration_manager', 'check_in_volunteer', 'timer_export', 'finance')),
    granted_by text REFERENCES accounts(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL,
    PRIMARY KEY (organization_id, account_id, role)
  );
  CREATE INDEX organization_members_by_account ON organization_members(account_id);
  -- A role granted to an email that has no account yet. It becomes a membership the first
  -- time someone signs in with that verified email. Emails are stored lowercased.
  CREATE TABLE organization_invitations (
    organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email text NOT NULL,
    role text NOT NULL CHECK (role IN ('owner', 'registration_manager', 'check_in_volunteer', 'timer_export', 'finance')),
    invited_by text REFERENCES accounts(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL,
    PRIMARY KEY (organization_id, email, role)
  );
  CREATE INDEX organization_invitations_by_email ON organization_invitations(email);
  -- The signed-in account that placed an order or joined a waitlist. Null for rows made before
  -- sign-in existed and for simulated demo riders.
  ALTER TABLE orders ADD COLUMN account_id text REFERENCES accounts(id) ON DELETE SET NULL;
  CREATE INDEX orders_by_account ON orders(account_id);
  ALTER TABLE waitlist_entries ADD COLUMN account_id text REFERENCES accounts(id) ON DELETE SET NULL;
  `,
];

/** timestamptz values come back as ISO 8601 UTC strings instead of Date objects. */
const TIMESTAMPTZ_OID = 1184;
const parseTimestamptz = pg.types.getTypeParser(TIMESTAMPTZ_OID) as (value: string) => Date;
const types = {
  getTypeParser: ((oid: number, format?: 'text' | 'binary') =>
    oid === TIMESTAMPTZ_OID && format !== 'binary' ? (value: string) => parseTimestamptz(value).toISOString() : pg.types.getTypeParser(oid, format)) as typeof pg.types.getTypeParser,
};

/** Arbitrary constant for the session-level advisory lock held while migrating. */
const MIGRATION_LOCK = 4_241_017;

export const DEFAULT_DATABASE_URL = 'postgres://cyclereg:cyclereg@127.0.0.1:5432/cyclereg';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/**
 * Local development only: creates the database named in the URL when it does not exist
 * yet, so a separate demo or session database needs no manual `createdb`. Returns true
 * when it created one. A database on any other host is never created (returns false).
 */
export async function ensureLocalDatabase(connectionString: string): Promise<boolean> {
  const url = new URL(connectionString);
  if (!LOCAL_HOSTS.has(url.hostname)) return false;
  const name = decodeURIComponent(url.pathname.slice(1));
  if (!/^[a-z0-9_]+$/.test(name)) throw new Error(`Use a database name of lowercase letters, digits, and underscores (got "${name}").`);
  url.pathname = '/postgres';
  const admin = new pg.Client({ connectionString: url.toString(), connectionTimeoutMillis: 10_000 });
  await admin.connect();
  try {
    const existing = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (existing.rowCount) return false;
    await admin.query(`CREATE DATABASE "${name}"`);
    return true;
  } catch (err) {
    if ((err as { code?: string }).code === '42P04') return false; // created by another process just now
    throw err;
  } finally {
    await admin.end();
  }
}

async function applyMigrations(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK]);
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
    const { rows } = await client.query<{ v: number | null }>(`SELECT MAX(version) AS v FROM schema_migrations`);
    for (let v = rows[0]?.v ?? 0; v < MIGRATIONS.length; v++) {
      await client.query('BEGIN');
      try {
        await client.query(MIGRATIONS[v]);
        await client.query(`INSERT INTO schema_migrations (version) VALUES ($1)`, [v + 1]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK]).catch(() => undefined);
    client.release();
  }
}

export function openDb(connectionString: string, onPoolError?: (err: Error) => void): Db {
  // Fail fast instead of hanging when the database cannot be reached.
  const pool = new pg.Pool({ connectionString, connectionTimeoutMillis: 10_000, types });
  // An idle connection can drop (database restart, test teardown); the pool replaces it.
  pool.on('error', (err) => onPoolError?.(err));
  const tx = new AsyncLocalStorage<{ client: pg.PoolClient; depth: number }>();
  let migrated: Promise<void> | null = null;
  let closed: Promise<void> | null = null;

  async function query<T extends pg.QueryResultRow>(sql: string, params: readonly Param[] = []) {
    const current = tx.getStore();
    return (current ? current.client : pool).query<T>(sql, params as Param[]);
  }

  return {
    async all<T>(sql: string, params?: readonly Param[]) {
      return (await query(sql, params)).rows as T[];
    },
    async get<T>(sql: string, params?: readonly Param[]) {
      return (await query(sql, params)).rows[0] as T | undefined;
    },
    async run(sql: string, params?: readonly Param[]) {
      return (await query(sql, params)).rowCount ?? 0;
    },

    async transaction<T>(fn: () => Promise<T>): Promise<T> {
      const outer = tx.getStore();
      if (outer) {
        const name = `sp_${outer.depth + 1}`;
        await outer.client.query(`SAVEPOINT ${name}`);
        try {
          const result = await tx.run({ client: outer.client, depth: outer.depth + 1 }, fn);
          await outer.client.query(`RELEASE SAVEPOINT ${name}`);
          return result;
        } catch (err) {
          await outer.client.query(`ROLLBACK TO SAVEPOINT ${name}`);
          throw err;
        }
      }
      const client = await pool.connect();
      // A connection whose ROLLBACK failed is broken; destroy it instead of returning it to the pool.
      let broken = false;
      try {
        await client.query('BEGIN');
        const result = await tx.run({ client, depth: 0 }, fn);
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {
          broken = true;
        });
        throw err;
      } finally {
        client.release(broken);
      }
    },

    async lock(key: string) {
      if (!tx.getStore()) throw new Error('db.lock() must be called inside a transaction.');
      await query('SELECT pg_advisory_xact_lock(hashtext($1))', [key]);
    },

    migrate() {
      migrated ??= applyMigrations(pool).catch((err) => {
        migrated = null;
        throw err;
      });
      return migrated;
    },

    close() {
      closed ??= pool.end();
      return closed;
    },
  };
}
