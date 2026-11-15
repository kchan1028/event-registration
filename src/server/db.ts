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
  `
  -- Race-day check-in prototype.
  CREATE TABLE bib_settings (
    event_id TEXT PRIMARY KEY REFERENCES events(id),
    settings_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  -- Bib history: a changed bib is released with a reason, never deleted.
  CREATE TABLE bib_assignments (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL REFERENCES events(id),
    scope TEXT NOT NULL,
    order_id TEXT NOT NULL REFERENCES orders(id),
    bib INTEGER NOT NULL,
    assigned_at TEXT NOT NULL,
    released_at TEXT,
    release_reason TEXT
  );
  CREATE UNIQUE INDEX bib_active_number ON bib_assignments(event_id, scope, bib) WHERE released_at IS NULL;
  CREATE UNIQUE INDEX bib_active_rider ON bib_assignments(event_id, scope, order_id) WHERE released_at IS NULL;
  -- One check-in per rider (order) per race day; repeats return the first.
  CREATE TABLE check_ins (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL REFERENCES events(id),
    order_id TEXT NOT NULL REFERENCES orders(id),
    day_id TEXT NOT NULL,
    checked_in_at TEXT NOT NULL,
    UNIQUE (event_id, order_id, day_id)
  );
  `,
  `
  -- Timestamped start-list snapshots per race. Immutable once saved; later changes show as a diff.
  CREATE TABLE start_list_snapshots (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL REFERENCES events(id),
    race_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    published_version INTEGER NOT NULL,
    rows_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (event_id, race_id, version)
  );
  `,
  `
  -- Organizer-managed waitlists. An active offer reserves a place for 24 hours.
  CREATE TABLE waitlist_entries (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL REFERENCES events(id),
    category_id TEXT NOT NULL,
    rider_json TEXT NOT NULL,
    status TEXT NOT NULL,
    offer_token TEXT UNIQUE,
    offered_at TEXT,
    offer_expires_at TEXT,
    order_id TEXT REFERENCES orders(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX waitlist_by_category ON waitlist_entries(event_id, category_id, created_at);
  `,
  `
  -- Organizer transfers and withdrawals of paid entries. The price paid is never changed;
  -- differences are recorded here and settled outside the app while payments are simulated.
  ALTER TABLE order_entries ADD COLUMN original_category_id TEXT;
  ALTER TABLE order_entries ADD COLUMN withdrawn_at TEXT;
  CREATE TABLE entry_changes (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL REFERENCES events(id),
    order_id TEXT NOT NULL REFERENCES orders(id),
    entry_id TEXT NOT NULL REFERENCES order_entries(id),
    kind TEXT NOT NULL,
    from_category_id TEXT NOT NULL,
    to_category_id TEXT,
    amount_paid_cents INTEGER NOT NULL,
    new_price_cents INTEGER,
    difference_cents INTEGER,
    reason TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX entry_changes_by_order ON entry_changes(order_id, created_at);
  `,
  `
  -- Undone check-ins. The check_ins row is removed so the rider can be checked in again; this keeps the record.
  CREATE TABLE check_in_undos (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL REFERENCES events(id),
    order_id TEXT NOT NULL REFERENCES orders(id),
    day_id TEXT NOT NULL,
    checked_in_at TEXT NOT NULL,
    bib INTEGER,
    bib_released INTEGER NOT NULL,
    reason TEXT NOT NULL,
    undone_at TEXT NOT NULL
  );
  CREATE INDEX check_in_undos_by_order ON check_in_undos(order_id, day_id);
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
