import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type Db = Database.Database;

const MIGRATIONS: string[] = [
  `
  CREATE TABLE organizations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE events (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id),
    draft_json TEXT NOT NULL,
    revision INTEGER NOT NULL,
    published_version INTEGER,
    published_revision INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX events_by_org ON events(organization_id);
  -- Published configurations are immutable snapshots.
  CREATE TABLE event_versions (
    event_id TEXT NOT NULL REFERENCES events(id),
    version INTEGER NOT NULL,
    config_json TEXT NOT NULL,
    draft_revision INTEGER NOT NULL,
    warnings_acknowledged INTEGER NOT NULL,
    published_at TEXT NOT NULL,
    PRIMARY KEY (event_id, version)
  );
  -- Simulated entries for exercising capacity rules. No payment and no rider data.
  CREATE TABLE test_entries (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL REFERENCES events(id),
    category_id TEXT NOT NULL,
    rider_ref TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (event_id, category_id, rider_ref)
  );
  CREATE INDEX test_entries_by_event ON test_entries(event_id);
  `,
  `
  -- Rider orders in the checkout prototype. Payment is simulated; no money moves.
  CREATE TABLE orders (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL REFERENCES events(id),
    published_version INTEGER NOT NULL,
    client_request_id TEXT NOT NULL,
    status TEXT NOT NULL,
    rider_json TEXT NOT NULL,
    waiver_json TEXT NOT NULL,
    quote_json TEXT NOT NULL,
    total_cents INTEGER NOT NULL,
    hold_expires_at TEXT NOT NULL,
    check_in_code TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    confirmed_at TEXT,
    UNIQUE (event_id, client_request_id)
  );
  CREATE INDEX orders_by_event ON orders(event_id);
  CREATE TABLE order_entries (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL REFERENCES orders(id),
    event_id TEXT NOT NULL REFERENCES events(id),
    category_id TEXT NOT NULL,
    rider_ref TEXT NOT NULL,
    status TEXT NOT NULL,
    license_reviewed INTEGER NOT NULL DEFAULT 0,
    license_review_note TEXT,
    license_reviewed_at TEXT
  );
  CREATE INDEX order_entries_by_event ON order_entries(event_id);
  -- Each simulated payment notification is processed once.
  CREATE TABLE payment_attempts (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL REFERENCES orders(id),
    outcome TEXT NOT NULL,
    result_status TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  `,
];

export function openDb(path: string): Db {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  migrate(db);
  return db;
}

function migrate(db: Db): void {
  const current = db.pragma('user_version', { simple: true }) as number;
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[v]);
      db.pragma(`user_version = ${v + 1}`);
    })();
  }
}
