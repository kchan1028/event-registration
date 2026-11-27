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

type Param =string | number | boolean | null | readonly string[] | readonly number[];

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
  /**
   * A shared lock on the same key for read-only transactions: readers do not wait for each other,
   * but still wait for, and hold off, a writer's `lock`. Never take `lock` on the same key later
   * in a transaction that took this one; two such transactions would deadlock.
   */
  lockShared(key: string): Promise<void>;
  /** Applies pending migrations once per process; safe when several instances start together. */
  migrate(): Promise<void>;
  close(): Promise<void>;
}

// seq columns keep insertion order for ties on a timestamp.
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
  -- Organizer corrections to a rider's details, append-only (product.md 4: corrections need a reason and an
  -- audit trail). Each row lists the fields changed with before and after values. A corrected license number
  -- clears earlier license reviews on the order; the cleared reviews are kept here. Prices never change.
  CREATE TABLE rider_corrections (
    id text PRIMARY KEY,
    seq bigint GENERATED ALWAYS AS IDENTITY,
    event_id text NOT NULL REFERENCES events(id),
    order_id text NOT NULL REFERENCES orders(id),
    changes_json jsonb NOT NULL,
    cleared_reviews_json jsonb,
    reason text NOT NULL,
    created_at timestamptz NOT NULL
  );
  CREATE INDEX rider_corrections_by_order ON rider_corrections(order_id, created_at);
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
  `
  -- Stripe hosted Checkout in test mode (ADR 0002, Phase 2). One row per Checkout Session.
  -- At most one session per order is open at a time, so a rider cannot pay twice by accident.
  CREATE TABLE payment_sessions (
    id text PRIMARY KEY,
    order_id text NOT NULL REFERENCES orders(id),
    provider text NOT NULL,
    url text NOT NULL,
    amount_cents integer NOT NULL,
    status text NOT NULL CHECK (status IN ('open', 'completed', 'expired')),
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL
  );
  CREATE INDEX payment_sessions_by_order ON payment_sessions(order_id, created_at);
  -- Every verified provider notification, processed once by its event ID, with what it did.
  CREATE TABLE provider_events (
    id text PRIMARY KEY,
    provider text NOT NULL,
    type text NOT NULL,
    session_id text,
    order_id text REFERENCES orders(id),
    outcome text NOT NULL,
    result text NOT NULL,
    received_at timestamptz NOT NULL
  );
  CREATE INDEX provider_events_by_order ON provider_events(order_id, received_at);
  -- Where a payment attempt came from. Simulated attempts keep provider 'simulated'.
  ALTER TABLE payment_attempts ADD COLUMN provider text NOT NULL DEFAULT 'simulated';
  ALTER TABLE payment_attempts ADD COLUMN provider_ref text;
  ALTER TABLE payment_attempts ADD COLUMN amount_cents integer;
  `,
  `
  -- Refunds (ADR 0002, Phase 2). Each refund returns money from one payment, optionally for one
  -- entry. A row is written before Stripe is called, so its amount is reserved against the cap and
  -- a retry reuses the same idempotency key (the refund ID). Entry and payment states are separate:
  -- a refund never withdraws an entry, and a withdrawal never refunds.
  CREATE TABLE refunds (
    id text PRIMARY KEY,
    order_id text NOT NULL REFERENCES orders(id),
    entry_id text REFERENCES order_entries(id),
    provider text NOT NULL,
    payment_ref text,
    amount_cents integer NOT NULL CHECK (amount_cents > 0),
    reason text NOT NULL,
    status text NOT NULL CHECK (status IN ('requested', 'pending', 'succeeded', 'failed', 'canceled')),
    provider_refund_id text UNIQUE,
    failure_reason text,
    requested_by text REFERENCES accounts(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL
  );
  CREATE INDEX refunds_by_order ON refunds(order_id, created_at);
  -- The payment a notification was about, so a duplicate charge can be found and refunded.
  ALTER TABLE provider_events ADD COLUMN payment_ref text;
  ALTER TABLE provider_events ADD COLUMN amount_cents integer;
  `,
  `
  -- Actor history (Phase 2 identity lifecycle). Who corrected a rider's details; null for
  -- corrections made before this column existed.
  ALTER TABLE rider_corrections ADD COLUMN corrected_by text REFERENCES accounts(id) ON DELETE SET NULL;
  -- Append-only history of role and invitation changes in an organization. The actor is the
  -- signed-in account that made the change: null for seed scripts, and for an accepted invitation
  -- it is the person who signed in. The email is the person whose role changed.
  CREATE TABLE membership_changes (
    id text PRIMARY KEY,
    seq bigint GENERATED ALWAYS AS IDENTITY,
    organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    action text NOT NULL CHECK (action IN ('granted', 'invited', 'invitation_accepted', 'removed', 'invitation_cancelled', 'ownership_transferred')),
    email text NOT NULL,
    role text NOT NULL CHECK (role IN ('owner', 'registration_manager', 'check_in_volunteer', 'timer_export', 'finance')),
    actor_id text REFERENCES accounts(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL
  );
  CREATE INDEX membership_changes_by_org ON membership_changes(organization_id, created_at);
  `,
  `
  -- Invitations expire. Existing ones get the 14-day lifetime (INVITATION_DAYS when this ran) from
  -- when they were sent. Adding the same invitation again renews it; an expired one is dropped,
  -- and recorded, when that person signs in.
  ALTER TABLE organization_invitations ADD COLUMN expires_at timestamptz;
  UPDATE organization_invitations SET expires_at = created_at + interval '14 days';
  ALTER TABLE organization_invitations ALTER COLUMN expires_at SET NOT NULL;
  ALTER TABLE membership_changes DROP CONSTRAINT membership_changes_action_check;
  ALTER TABLE membership_changes ADD CONSTRAINT membership_changes_action_check
    CHECK (action IN ('granted', 'invited', 'invitation_renewed', 'invitation_accepted', 'invitation_expired', 'removed', 'invitation_cancelled', 'ownership_transferred'));
  `,
  `
  -- One active opt-in post-close job per event; completed/cancelled jobs retain who configured them.
  CREATE TABLE automatic_bib_jobs (
    id text PRIMARY KEY,
    event_id text NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    sort text NOT NULL CHECK (sort IN ('name', 'registration', 'start')),
    configured_by text NOT NULL REFERENCES accounts(id),
    created_at timestamptz NOT NULL,
    completed_at timestamptz,
    cancelled_at timestamptz,
    cancelled_by text REFERENCES accounts(id),
    last_attempt_at timestamptz,
    message text,
    assigned integer CHECK (assigned >= 0),
    CHECK (completed_at IS NULL OR cancelled_at IS NULL)
  );
  ALTER TABLE bib_assignments ADD COLUMN automatic_job_id text REFERENCES automatic_bib_jobs(id);
  CREATE UNIQUE INDEX automatic_bib_pending ON automatic_bib_jobs(event_id)
    WHERE completed_at IS NULL AND cancelled_at IS NULL;
  `,
  `
  -- How many times one rider may use a coupon. Null: no per-rider limit. A rider is matched across
  -- orders by the same rule as same-rider suggestions (same license number, or same name and email).
  ALTER TABLE coupons ADD COLUMN max_per_rider integer CHECK (max_per_rider > 0);
  `,
  `
  -- Outgoing email (ADR 0006). Written before any send; status records what happened. "recorded":
  -- the local build kept it and sent nothing. ref ties a message to what it is about; for an
  -- organizer invitation it is organization_id:email:role.
  CREATE TABLE email_messages (
    id text PRIMARY KEY,
    seq bigint GENERATED ALWAYS AS IDENTITY,
    organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    kind text NOT NULL CHECK (kind IN ('organizer_invitation')),
    ref text NOT NULL,
    to_email text NOT NULL,
    subject text NOT NULL,
    body_text text NOT NULL,
    status text NOT NULL CHECK (status IN ('recorded', 'sent', 'failed')),
    provider_message_id text,
    error text,
    created_at timestamptz NOT NULL,
    sent_at timestamptz
  );
  CREATE INDEX email_messages_by_org_ref ON email_messages(organization_id, ref, created_at);
  `,
  `
  CREATE TABLE bib_reassignments (
    id text PRIMARY KEY,
    event_id text NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    day_id text NOT NULL,
    scope text NOT NULL,
    published_version integer NOT NULL,
    requested_by text NOT NULL REFERENCES accounts(id),
    reason text NOT NULL,
    assignments_json jsonb NOT NULL,
    created_at timestamptz NOT NULL,
    FOREIGN KEY (event_id, published_version) REFERENCES event_versions(event_id, version)
  );
  ALTER TABLE bib_assignments ADD COLUMN reassignment_id text REFERENCES bib_reassignments(id);
  ALTER TABLE start_list_snapshots ADD COLUMN reassignment_id text REFERENCES bib_reassignments(id);
  `,
  `
  -- Guardian access to juniors (owner decision 2026-11-15). One profile per guardian account and
  -- junior name, created the first time that guardian registers the junior; one guardian per junior.
  -- viewer_email: the junior's own login, which may view the junior's registrations read-only.
  CREATE TABLE junior_profiles (
    id text PRIMARY KEY,
    seq bigint GENERATED ALWAYS AS IDENTITY,
    guardian_account_id text NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    name_key text NOT NULL,
    first_name text NOT NULL,
    last_name text NOT NULL,
    viewer_email text,
    created_at timestamptz NOT NULL,
    UNIQUE (guardian_account_id, name_key)
  );
  CREATE INDEX junior_profiles_by_viewer ON junior_profiles(viewer_email) WHERE viewer_email IS NOT NULL;
  ALTER TABLE orders ADD COLUMN junior_profile_id text REFERENCES junior_profiles(id) ON DELETE SET NULL;
  CREATE INDEX orders_by_junior ON orders(junior_profile_id) WHERE junior_profile_id IS NOT NULL;
  `,
  `
  -- Server-recorded acceptance evidence; historical rows stay unknown rather than reconstructed.
  ALTER TABLE orders ADD COLUMN waiver_evidence_json jsonb;
  `,
  // 27: stable creation request evidence, with no inferred historical identity.
  `ALTER TABLE refunds ADD COLUMN request_json jsonb;
   CREATE UNIQUE INDEX refunds_request ON refunds(order_id, (request_json->>'clientRequestId')) WHERE request_json IS NOT NULL;`,
  // 28: mirror existing single-guardian ownership before the separate access-lifecycle increment.
  `CREATE TABLE junior_guardians (
    id text PRIMARY KEY,
    junior_profile_id text NOT NULL REFERENCES junior_profiles(id) ON DELETE CASCADE,
    account_id text NOT NULL REFERENCES accounts(id),
    granted_by text REFERENCES accounts(id),
    granted_at timestamptz NOT NULL,
    revoked_by text REFERENCES accounts(id),
    revoked_at timestamptz,
    CHECK (revoked_by IS NULL OR revoked_at IS NOT NULL)
  );
  CREATE UNIQUE INDEX junior_guardians_active ON junior_guardians(junior_profile_id, account_id) WHERE revoked_at IS NULL;
  CREATE INDEX junior_guardians_by_account ON junior_guardians(account_id) WHERE revoked_at IS NULL;
  INSERT INTO junior_guardians(id,junior_profile_id,account_id,granted_at)
    SELECT 'jgd_migrated_' || id,id,guardian_account_id,created_at FROM junior_profiles;`,
  // 29: private guardian invitation records, without granting access or sending mail.
  `CREATE TABLE junior_guardian_invitations (
    id text PRIMARY KEY,
    junior_profile_id text NOT NULL REFERENCES junior_profiles(id) ON DELETE CASCADE,
    email text NOT NULL,
    invited_by text NOT NULL REFERENCES accounts(id),
    created_at timestamptz NOT NULL,
    expires_at timestamptz NOT NULL,
    cancelled_by text REFERENCES accounts(id),
    cancelled_at timestamptz,
    cancellation_reason text CHECK (cancellation_reason IN ('replaced','cancelled','profile_merged')),
    CHECK ((cancelled_at IS NULL AND cancelled_by IS NULL AND cancellation_reason IS NULL)
      OR (cancelled_at IS NOT NULL AND cancelled_by IS NOT NULL AND cancellation_reason IS NOT NULL))
  );
  CREATE UNIQUE INDEX junior_guardian_invitation_pending ON junior_guardian_invitations(junior_profile_id) WHERE cancelled_at IS NULL;`,
  // 30: accepted invitations and explicit guardian authority, preserving merged profile evidence.
  `ALTER TABLE junior_guardian_invitations ADD COLUMN accepted_by text REFERENCES accounts(id);
  ALTER TABLE junior_guardian_invitations ADD COLUMN accepted_at timestamptz;
  ALTER TABLE junior_guardian_invitations ADD CONSTRAINT guardian_acceptance_complete CHECK
    ((accepted_by IS NULL AND accepted_at IS NULL) OR (accepted_by IS NOT NULL AND accepted_at IS NOT NULL AND cancelled_at IS NULL));
  DROP INDEX junior_guardian_invitation_pending;
  CREATE UNIQUE INDEX junior_guardian_invitation_pending ON junior_guardian_invitations(junior_profile_id) WHERE cancelled_at IS NULL AND accepted_at IS NULL;
  CREATE INDEX junior_guardian_invitations_by_email ON junior_guardian_invitations(email) WHERE cancelled_at IS NULL AND accepted_at IS NULL;
  ALTER TABLE junior_profiles DROP CONSTRAINT junior_profiles_guardian_account_id_name_key_key;
  ALTER TABLE junior_profiles DROP CONSTRAINT junior_profiles_guardian_account_id_fkey;
  ALTER TABLE junior_profiles RENAME COLUMN guardian_account_id TO created_by_account_id;
  ALTER TABLE junior_profiles ALTER COLUMN created_by_account_id DROP NOT NULL;
  ALTER TABLE junior_profiles ADD FOREIGN KEY (created_by_account_id) REFERENCES accounts(id) ON DELETE SET NULL;
  ALTER TABLE junior_profiles ADD COLUMN merged_into_id text REFERENCES junior_profiles(id);
  ALTER TABLE junior_profiles ADD COLUMN merged_by text REFERENCES accounts(id);
  ALTER TABLE junior_profiles ADD COLUMN merged_at timestamptz;
  ALTER TABLE junior_profiles ADD CONSTRAINT junior_merge_complete CHECK
    ((merged_into_id IS NULL AND merged_by IS NULL AND merged_at IS NULL) OR (merged_into_id IS NOT NULL AND merged_by IS NOT NULL AND merged_at IS NOT NULL AND merged_into_id <> id));
  ALTER TABLE orders DROP CONSTRAINT orders_junior_profile_id_fkey;
  ALTER TABLE orders ADD FOREIGN KEY (junior_profile_id) REFERENCES junior_profiles(id) ON DELETE RESTRICT;`,
  // 31: explicit guardian removal evidence; historical and merge revocations stay unknown.
  `ALTER TABLE junior_guardians ADD COLUMN removal_reason text;
  ALTER TABLE junior_guardians ADD COLUMN removal_acknowledged_at timestamptz;
  ALTER TABLE junior_guardians ADD CONSTRAINT guardian_removal_complete CHECK (
    (removal_reason IS NULL AND removal_acknowledged_at IS NULL) OR
    (removal_reason IS NOT NULL AND char_length(btrim(removal_reason)) BETWEEN 3 AND 300
      AND removal_acknowledged_at IS NOT NULL AND revoked_by IS NOT NULL AND revoked_at IS NOT NULL
      AND revoked_by <> account_id AND removal_acknowledged_at = revoked_at)
  );`,
  // 32: audited support-approved claims; no historical DOB, zone or claim is inferred.
  `CREATE TABLE junior_profile_claims (
    id text PRIMARY KEY,
    junior_profile_id text NOT NULL UNIQUE REFERENCES junior_profiles(id) ON DELETE RESTRICT,
    rider_account_id text NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
    approved_by text NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
    client_request_id text NOT NULL UNIQUE,
    birth_date date NOT NULL,
    time_zone text NOT NULL CHECK (char_length(time_zone) BETWEEN 1 AND 64),
    review_reference text NOT NULL CHECK (char_length(btrim(review_reference)) BETWEEN 3 AND 300),
    minimum_age integer NOT NULL CHECK (minimum_age = 18),
    approved_at timestamptz NOT NULL,
    CHECK (rider_account_id <> approved_by)
  );
  ALTER TABLE junior_guardian_invitations DROP CONSTRAINT junior_guardian_invitations_cancellation_reason_check;
  ALTER TABLE junior_guardian_invitations ADD CONSTRAINT junior_guardian_invitations_cancellation_reason_check
    CHECK (cancellation_reason IN ('replaced','cancelled','profile_merged','profile_claimed'));`,
  // 33: stable registration-block names, captured now for prior claims and at insertion thereafter.
  `ALTER TABLE junior_profile_claims ADD COLUMN registration_name_json jsonb;
  UPDATE junior_profile_claims c SET registration_name_json = jsonb_build_object('firstName',p.first_name,'lastName',p.last_name)
    FROM junior_profiles p WHERE p.id = c.junior_profile_id;
  CREATE FUNCTION capture_claim_registration_name() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    SELECT jsonb_build_object('firstName',p.first_name,'lastName',p.last_name) INTO NEW.registration_name_json
      FROM junior_profiles p WHERE p.id = NEW.junior_profile_id;
    RETURN NEW;
  END $$;
  CREATE TRIGGER capture_claim_registration_name BEFORE INSERT ON junior_profile_claims
    FOR EACH ROW EXECUTE FUNCTION capture_claim_registration_name();
  ALTER TABLE junior_profile_claims ALTER COLUMN registration_name_json SET NOT NULL;
  ALTER TABLE junior_profile_claims ADD CONSTRAINT claim_registration_name_complete CHECK (
    jsonb_typeof(registration_name_json) = 'object' AND registration_name_json ? 'firstName' AND registration_name_json ? 'lastName'
    AND jsonb_typeof(registration_name_json->'firstName') = 'string' AND jsonb_typeof(registration_name_json->'lastName') = 'string'
  );
  CREATE INDEX junior_guardians_history_by_account ON junior_guardians(account_id,junior_profile_id);`,
  // 34: reviewed cancellation plan evidence only; there is no execution queue or state change.
  `CREATE TABLE cancellation_confirmations (
    id text PRIMARY KEY,
    event_id text NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
    client_request_id text NOT NULL CHECK (char_length(client_request_id) BETWEEN 8 AND 128),
    confirmed_by text NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
    confirmed_at timestamptz NOT NULL,
    reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 3 AND 300),
    selection_json jsonb NOT NULL CHECK (jsonb_typeof(selection_json)='object' AND selection_json ? 'scope' AND jsonb_typeof(selection_json->'scope')='string' AND selection_json->>'scope' IN ('event','race','day')),
    preview_fingerprint text NOT NULL CHECK (preview_fingerprint ~ '^[a-f0-9]{64}$'),
    preview_json jsonb NOT NULL CHECK (jsonb_typeof(preview_json)='object' AND preview_json ? 'eventId' AND jsonb_typeof(preview_json->'eventId')='string' AND preview_json->>'eventId'=event_id AND preview_json ? 'selection' AND preview_json->'selection'=selection_json),
    acknowledged_plan_only boolean NOT NULL CHECK (acknowledged_plan_only),
    UNIQUE(event_id,client_request_id)
  );`,
  `ALTER TABLE order_entries ADD COLUMN cancelled_at timestamptz;
  ALTER TABLE order_entries ADD CONSTRAINT entry_cancellation_time CHECK((status='cancelled')=(cancelled_at IS NOT NULL));
  ALTER TABLE cancellation_confirmations ADD CONSTRAINT cancellation_confirmation_event_id UNIQUE(event_id,id);
  CREATE TABLE cancellation_executions (
    id text PRIMARY KEY,
    event_id text NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
    confirmation_id text NOT NULL UNIQUE,
    client_request_id text NOT NULL CHECK(char_length(client_request_id) BETWEEN 8 AND 128),
    request_json jsonb NOT NULL,
    executed_by text NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
    executed_at timestamptz NOT NULL,
    selection_json jsonb NOT NULL CHECK(jsonb_typeof(selection_json)='object' AND selection_json ? 'scope' AND jsonb_typeof(selection_json->'scope')='string' AND selection_json->>'scope' IN ('event','day','race')),
    race_ids jsonb NOT NULL CHECK(jsonb_typeof(race_ids)='array'),
    category_ids jsonb NOT NULL CHECK(jsonb_typeof(category_ids)='array'),
    result_json jsonb NOT NULL CHECK(jsonb_typeof(result_json)='object' AND result_json ?& ARRAY['id','eventId','confirmationId','executedBy'] AND jsonb_typeof(result_json->'id')='string' AND jsonb_typeof(result_json->'eventId')='string' AND jsonb_typeof(result_json->'confirmationId')='string' AND jsonb_typeof(result_json->'executedBy')='string' AND result_json->>'id'=id AND result_json->>'eventId'=event_id AND result_json->>'confirmationId'=confirmation_id AND result_json->>'executedBy'=executed_by),
    FOREIGN KEY(event_id,confirmation_id) REFERENCES cancellation_confirmations(event_id,id) ON DELETE RESTRICT,
    UNIQUE(event_id,client_request_id)
  );`,
  `CREATE TABLE cancellation_request_refusals (
    event_id text NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
    command_kind text NOT NULL CHECK(command_kind IN ('plan','execution')),
    client_request_id text NOT NULL CHECK(char_length(client_request_id) BETWEEN 8 AND 128),
    request_json jsonb NOT NULL CHECK(jsonb_typeof(request_json)='object' AND request_json ? 'clientRequestId' AND jsonb_typeof(request_json->'clientRequestId')='string' AND request_json->>'clientRequestId'=client_request_id),
    rejected_by text NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
    rejected_at timestamptz NOT NULL,
    status_code integer NOT NULL CHECK(status_code IN (400,404,409,422)),
    message text NOT NULL CHECK(char_length(message) BETWEEN 1 AND 1000),
    details_json jsonb NOT NULL CHECK(jsonb_typeof(details_json)='object'),
    PRIMARY KEY(event_id,command_kind,client_request_id)
  );`,
  `CREATE TABLE protected_export_audit (
    id text PRIMARY KEY,
    actor_account_id text NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
    event_id text NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
    export_kind text NOT NULL CHECK (export_kind IN ('entries', 'ledger', 'reconciliation', 'start_list')),
    race_id text,
    snapshot_version integer CHECK (snapshot_version > 0),
    generated_at timestamptz NOT NULL,
    CHECK (
      (export_kind = 'start_list' AND race_id IS NOT NULL AND (race_id <> 'all' OR snapshot_version IS NULL))
      OR (export_kind <> 'start_list' AND race_id IS NULL AND snapshot_version IS NULL)
    )
  );
  CREATE INDEX protected_export_audit_event_idx ON protected_export_audit(event_id, generated_at, id);`,
  `ALTER TABLE order_entries
    ADD COLUMN walk_up_marked_at timestamptz,
    ADD COLUMN walk_up_marked_by text REFERENCES accounts(id) ON DELETE RESTRICT,
    ADD CONSTRAINT walk_up_marker_complete CHECK ((walk_up_marked_at IS NULL) = (walk_up_marked_by IS NULL));`,
  `CREATE TABLE emergency_contact_views (
    id text PRIMARY KEY,
    actor_account_id text NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
    event_id text NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
    order_id text NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
    viewed_at timestamptz NOT NULL
  );
  CREATE INDEX emergency_contact_views_event_idx ON emergency_contact_views(event_id, viewed_at, id);`,
  `
  -- A lost provider response is not a confirmed refusal. An attempt is leased while it sends, and a retry repeats its saved sender.
  ALTER TABLE email_messages DROP CONSTRAINT email_messages_status_check;
  ALTER TABLE email_messages ADD CONSTRAINT email_messages_status_check
    CHECK (status IN ('recorded', 'sent', 'failed', 'uncertain'));
  ALTER TABLE email_messages
    ADD COLUMN started_at timestamptz,
    ADD COLUMN sending_until timestamptz,
    ADD COLUMN from_email text,
    ADD COLUMN keyed boolean NOT NULL DEFAULT false;
  ALTER TABLE organization_invitations
    ADD COLUMN email_attempt_id text REFERENCES email_messages(id) ON DELETE SET NULL,
    ADD COLUMN earlier_email boolean NOT NULL DEFAULT false;
  -- Emails from before this migration had no idempotency key and cannot be tied to one invitation.
  -- None becomes an attempt. An invitation whose address and role has one is never offered a resend.
  UPDATE organization_invitations i SET earlier_email = true
  WHERE EXISTS (
    SELECT 1 FROM email_messages e
    WHERE e.organization_id = i.organization_id AND e.ref = i.organization_id || ':' || i.email || ':' || i.role
  );
  -- The outgoing server keeps running during a deploy and can still save an email without a key.
  CREATE FUNCTION flag_unkeyed_invitation_email() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    UPDATE organization_invitations i SET earlier_email = true
    WHERE i.organization_id = NEW.organization_id AND NEW.ref = i.organization_id || ':' || i.email || ':' || i.role;
    RETURN NEW;
  END $$;
  CREATE TRIGGER email_messages_flag_unkeyed AFTER INSERT ON email_messages
    FOR EACH ROW WHEN (NOT NEW.keyed) EXECUTE FUNCTION flag_unkeyed_invitation_email();
  `,
  `
  -- Changes whenever an invitation is replaced or renewed, so Resend can name exactly the one it was shown.
  ALTER TABLE organization_invitations ADD COLUMN revision text NOT NULL DEFAULT gen_random_uuid()::text;
  -- In the database, so a renewal by an outgoing server during a deploy changes it too.
  CREATE FUNCTION revise_invitation() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    NEW.revision := gen_random_uuid()::text;
    RETURN NEW;
  END $$;
  CREATE TRIGGER organization_invitations_revise BEFORE UPDATE OF expires_at ON organization_invitations
    FOR EACH ROW EXECUTE FUNCTION revise_invitation();
  `,
  `
  -- Identifies one grant, so Remove cannot take a role that was granted after the screen loaded.
  ALTER TABLE organization_members ADD COLUMN revision text NOT NULL DEFAULT gen_random_uuid()::text;
  `,
  `
  -- Who published each version, and why when it changed the waiver. Earlier versions and seed scripts have neither.
  ALTER TABLE event_versions ADD COLUMN published_by text REFERENCES accounts(id) ON DELETE RESTRICT;
  ALTER TABLE event_versions ADD COLUMN waiver_change_reason text CHECK (btrim(waiver_change_reason) <> '');
  `,
  `
  -- Staff release of an unpaid hold, and whether a provider checkout may exist. Earlier orders are untracked, so never released.
  ALTER TABLE orders
    ADD COLUMN staff_released_at timestamptz,
    ADD COLUMN staff_released_by text REFERENCES accounts(id) ON DELETE RESTRICT,
    ADD COLUMN staff_release_reason text,
    ADD COLUMN stripe_checkout_started_at timestamptz,
    ADD COLUMN stripe_checkout_tracked boolean NOT NULL DEFAULT false,
    ADD CONSTRAINT staff_release_evidence_complete CHECK (
      (staff_released_at IS NULL AND staff_released_by IS NULL AND staff_release_reason IS NULL)
      OR (staff_released_at IS NOT NULL AND staff_released_by IS NOT NULL AND staff_release_reason IS NOT NULL
        AND char_length(btrim(staff_release_reason)) BETWEEN 3 AND 280)
    );`,
  `
  -- Delivery outcome from a verified Resend webhook. Separate from send status. No bounce text, subject, or addresses.
  ALTER TABLE email_messages
    ADD COLUMN delivery_status text,
    ADD COLUMN delivery_at timestamptz,
    ADD CONSTRAINT email_messages_delivery_status_check
      CHECK (delivery_status IS NULL OR delivery_status IN ('delivered', 'bounced', 'complained'));
  CREATE INDEX email_messages_provider_message_id ON email_messages (provider_message_id) WHERE provider_message_id IS NOT NULL;
  CREATE TABLE email_delivery_events (
    id text PRIMARY KEY,
    email_id text NOT NULL REFERENCES email_messages(id) ON DELETE CASCADE,
    kind text NOT NULL CHECK (kind IN ('delivered', 'bounced', 'complained')),
    occurred_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX email_delivery_events_email_occurred ON email_delivery_events (email_id, occurred_at);
  `,
  `
  -- One active stop per organization and address. A bounce and a complaint block the same way until an owner allows a send.
  -- The row keeps the normalized address so later sends can be refused. Delivery events stay free of addresses.
  CREATE TABLE email_suppressions (
    id text PRIMARY KEY,
    organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email text NOT NULL,
    reason text NOT NULL CHECK (reason IN ('bounced', 'complained')),
    email_id text NOT NULL REFERENCES email_messages(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL,
    cleared_at timestamptz,
    cleared_by text REFERENCES accounts(id) ON DELETE RESTRICT,
    cleared_email_id text REFERENCES email_messages(id) ON DELETE CASCADE,
    CHECK (
      (cleared_at IS NULL AND cleared_by IS NULL AND cleared_email_id IS NULL)
      OR (cleared_at IS NOT NULL AND cleared_by IS NOT NULL AND cleared_email_id IS NOT NULL)
    )
  );
  CREATE UNIQUE INDEX email_suppressions_active ON email_suppressions (organization_id, email) WHERE cleared_at IS NULL;
  `,
  `
  ALTER TABLE email_messages ADD COLUMN allowed_stop_id text REFERENCES email_suppressions(id) ON DELETE SET NULL;
  `,
  `ALTER TABLE protected_export_audit DROP CONSTRAINT protected_export_audit_export_kind_check;
  ALTER TABLE protected_export_audit ADD CONSTRAINT protected_export_audit_export_kind_check
    CHECK (export_kind IN ('entries', 'ledger', 'reconciliation', 'start_list', 'finance_summary'));`,
  `ALTER TABLE orders ADD COLUMN self_registration_account_id text REFERENCES accounts(id) ON DELETE SET NULL;`,
  `ALTER TABLE email_messages DROP CONSTRAINT email_messages_kind_check;
  ALTER TABLE email_messages ADD COLUMN order_id text UNIQUE REFERENCES orders(id) ON DELETE CASCADE;
  ALTER TABLE email_messages ADD CONSTRAINT email_messages_kind_check CHECK (
    (kind = 'organizer_invitation' AND order_id IS NULL)
    OR (kind = 'registration_confirmation' AND order_id IS NOT NULL AND ref = order_id)
  );`,
  `ALTER TABLE orders ADD COLUMN adult_history_claim_id text REFERENCES junior_profile_claims(id) ON DELETE RESTRICT;`,
  `CREATE TABLE confirmation_retry_requests (
    id text PRIMARY KEY,
    email_id text NOT NULL REFERENCES email_messages(id) ON DELETE CASCADE,
    actor_account_id text REFERENCES accounts(id) ON DELETE SET NULL,
    requested_at timestamptz NOT NULL
  );
  CREATE INDEX confirmation_retry_requests_by_email ON confirmation_retry_requests(email_id);`,
  `ALTER TABLE email_messages DROP CONSTRAINT email_messages_kind_check;
  ALTER TABLE email_messages ADD COLUMN waitlist_entry_id text UNIQUE REFERENCES waitlist_entries(id) ON DELETE CASCADE;
  ALTER TABLE email_messages ADD CONSTRAINT email_messages_kind_check CHECK (
    (kind = 'organizer_invitation' AND order_id IS NULL AND waitlist_entry_id IS NULL)
    OR (kind = 'registration_confirmation' AND order_id IS NOT NULL AND ref = order_id AND waitlist_entry_id IS NULL)
    OR (kind = 'waitlist_offer' AND waitlist_entry_id IS NOT NULL AND ref = waitlist_entry_id AND order_id IS NULL)
  );`,
  `ALTER TABLE confirmation_retry_requests RENAME TO rider_email_retry_requests;
  ALTER INDEX confirmation_retry_requests_by_email RENAME TO rider_email_retry_requests_by_email;`,
  `ALTER TABLE email_messages ADD COLUMN waitlist_expiry_entry_id text UNIQUE REFERENCES waitlist_entries(id) ON DELETE CASCADE;
  ALTER TABLE email_messages DROP CONSTRAINT email_messages_kind_check;
  ALTER TABLE email_messages ADD CONSTRAINT email_messages_kind_check CHECK (
    (kind = 'organizer_invitation' AND order_id IS NULL AND waitlist_entry_id IS NULL AND waitlist_expiry_entry_id IS NULL)
    OR (kind = 'registration_confirmation' AND order_id IS NOT NULL AND ref = order_id AND waitlist_entry_id IS NULL AND waitlist_expiry_entry_id IS NULL)
    OR (kind = 'waitlist_offer' AND waitlist_entry_id IS NOT NULL AND ref = waitlist_entry_id AND order_id IS NULL AND waitlist_expiry_entry_id IS NULL)
    OR (kind = 'waitlist_expired' AND waitlist_expiry_entry_id IS NOT NULL AND ref = waitlist_expiry_entry_id AND order_id IS NULL AND waitlist_entry_id IS NULL)
  );`,
  `ALTER TABLE email_messages DROP CONSTRAINT email_messages_order_id_key;
  CREATE UNIQUE INDEX email_messages_order_kind ON email_messages (order_id, kind);
  ALTER TABLE email_messages DROP CONSTRAINT email_messages_kind_check;
  ALTER TABLE email_messages ADD CONSTRAINT email_messages_kind_check CHECK (
    (kind = 'organizer_invitation' AND order_id IS NULL AND waitlist_entry_id IS NULL AND waitlist_expiry_entry_id IS NULL)
    OR (kind = 'registration_confirmation' AND order_id IS NOT NULL AND ref = order_id AND waitlist_entry_id IS NULL AND waitlist_expiry_entry_id IS NULL)
    OR (kind = 'registration_receipt' AND order_id IS NOT NULL AND ref = order_id AND waitlist_entry_id IS NULL AND waitlist_expiry_entry_id IS NULL)
    OR (kind = 'waitlist_offer' AND waitlist_entry_id IS NOT NULL AND ref = waitlist_entry_id AND order_id IS NULL AND waitlist_expiry_entry_id IS NULL)
    OR (kind = 'waitlist_expired' AND waitlist_expiry_entry_id IS NOT NULL AND ref = waitlist_expiry_entry_id AND order_id IS NULL AND waitlist_entry_id IS NULL)
  );`,
  `ALTER TABLE email_messages ADD COLUMN refund_id text UNIQUE REFERENCES refunds(id) ON DELETE CASCADE;
  ALTER TABLE email_messages DROP CONSTRAINT email_messages_kind_check;
  ALTER TABLE email_messages ADD CONSTRAINT email_messages_kind_check CHECK (
    (kind = 'organizer_invitation' AND order_id IS NULL AND waitlist_entry_id IS NULL AND waitlist_expiry_entry_id IS NULL AND refund_id IS NULL)
    OR (kind = 'registration_confirmation' AND order_id IS NOT NULL AND ref = order_id AND waitlist_entry_id IS NULL AND waitlist_expiry_entry_id IS NULL AND refund_id IS NULL)
    OR (kind = 'registration_receipt' AND order_id IS NOT NULL AND ref = order_id AND waitlist_entry_id IS NULL AND waitlist_expiry_entry_id IS NULL AND refund_id IS NULL)
    OR (kind = 'waitlist_offer' AND waitlist_entry_id IS NOT NULL AND ref = waitlist_entry_id AND order_id IS NULL AND waitlist_expiry_entry_id IS NULL AND refund_id IS NULL)
    OR (kind = 'waitlist_expired' AND waitlist_expiry_entry_id IS NOT NULL AND ref = waitlist_expiry_entry_id AND order_id IS NULL AND waitlist_entry_id IS NULL AND refund_id IS NULL)
    OR (kind = 'refund_notice' AND refund_id IS NOT NULL AND ref = refund_id AND order_id IS NULL AND waitlist_entry_id IS NULL AND waitlist_expiry_entry_id IS NULL)
  );`,
  `ALTER TABLE email_messages ADD COLUMN entry_change_id text UNIQUE REFERENCES entry_changes(id) ON DELETE CASCADE;
  ALTER TABLE email_messages DROP CONSTRAINT email_messages_kind_check;
  ALTER TABLE email_messages ADD CONSTRAINT email_messages_kind_check CHECK (
    (kind = 'organizer_invitation' AND order_id IS NULL AND waitlist_entry_id IS NULL AND waitlist_expiry_entry_id IS NULL AND refund_id IS NULL AND entry_change_id IS NULL)
    OR (kind = 'registration_confirmation' AND order_id IS NOT NULL AND ref = order_id AND waitlist_entry_id IS NULL AND waitlist_expiry_entry_id IS NULL AND refund_id IS NULL AND entry_change_id IS NULL)
    OR (kind = 'registration_receipt' AND order_id IS NOT NULL AND ref = order_id AND waitlist_entry_id IS NULL AND waitlist_expiry_entry_id IS NULL AND refund_id IS NULL AND entry_change_id IS NULL)
    OR (kind = 'waitlist_offer' AND waitlist_entry_id IS NOT NULL AND ref = waitlist_entry_id AND order_id IS NULL AND waitlist_expiry_entry_id IS NULL AND refund_id IS NULL AND entry_change_id IS NULL)
    OR (kind = 'waitlist_expired' AND waitlist_expiry_entry_id IS NOT NULL AND ref = waitlist_expiry_entry_id AND order_id IS NULL AND waitlist_entry_id IS NULL AND refund_id IS NULL AND entry_change_id IS NULL)
    OR (kind = 'refund_notice' AND refund_id IS NOT NULL AND ref = refund_id AND order_id IS NULL AND waitlist_entry_id IS NULL AND waitlist_expiry_entry_id IS NULL AND entry_change_id IS NULL)
    OR (kind = 'entry_change_notice' AND entry_change_id IS NOT NULL AND ref = entry_change_id AND order_id IS NULL AND waitlist_entry_id IS NULL AND waitlist_expiry_entry_id IS NULL AND refund_id IS NULL)
  );`,
  // 59: one recorded guardian invitation email, with no organization. Sending stays a later step.
  `ALTER TABLE email_messages ADD COLUMN guardian_invitation_id text UNIQUE REFERENCES junior_guardian_invitations(id) ON DELETE CASCADE;
  ALTER TABLE email_messages ALTER COLUMN organization_id DROP NOT NULL;
  ALTER TABLE email_messages DROP CONSTRAINT email_messages_kind_check;
  ALTER TABLE email_messages ADD CONSTRAINT email_messages_kind_check CHECK (
    (kind = 'organizer_invitation' AND organization_id IS NOT NULL AND guardian_invitation_id IS NULL AND order_id IS NULL AND waitlist_entry_id IS NULL AND waitlist_expiry_entry_id IS NULL AND refund_id IS NULL AND entry_change_id IS NULL)
    OR (kind = 'registration_confirmation' AND organization_id IS NOT NULL AND guardian_invitation_id IS NULL AND order_id IS NOT NULL AND ref = order_id AND waitlist_entry_id IS NULL AND waitlist_expiry_entry_id IS NULL AND refund_id IS NULL AND entry_change_id IS NULL)
    OR (kind = 'registration_receipt' AND organization_id IS NOT NULL AND guardian_invitation_id IS NULL AND order_id IS NOT NULL AND ref = order_id AND waitlist_entry_id IS NULL AND waitlist_expiry_entry_id IS NULL AND refund_id IS NULL AND entry_change_id IS NULL)
    OR (kind = 'waitlist_offer' AND organization_id IS NOT NULL AND guardian_invitation_id IS NULL AND waitlist_entry_id IS NOT NULL AND ref = waitlist_entry_id AND order_id IS NULL AND waitlist_expiry_entry_id IS NULL AND refund_id IS NULL AND entry_change_id IS NULL)
    OR (kind = 'waitlist_expired' AND organization_id IS NOT NULL AND guardian_invitation_id IS NULL AND waitlist_expiry_entry_id IS NOT NULL AND ref = waitlist_expiry_entry_id AND order_id IS NULL AND waitlist_entry_id IS NULL AND refund_id IS NULL AND entry_change_id IS NULL)
    OR (kind = 'refund_notice' AND organization_id IS NOT NULL AND guardian_invitation_id IS NULL AND refund_id IS NOT NULL AND ref = refund_id AND order_id IS NULL AND waitlist_entry_id IS NULL AND waitlist_expiry_entry_id IS NULL AND entry_change_id IS NULL)
    OR (kind = 'entry_change_notice' AND organization_id IS NOT NULL AND guardian_invitation_id IS NULL AND entry_change_id IS NOT NULL AND ref = entry_change_id AND order_id IS NULL AND waitlist_entry_id IS NULL AND waitlist_expiry_entry_id IS NULL AND refund_id IS NULL)
    OR (kind = 'guardian_invitation' AND organization_id IS NULL AND guardian_invitation_id IS NOT NULL AND ref = guardian_invitation_id AND order_id IS NULL AND waitlist_entry_id IS NULL AND waitlist_expiry_entry_id IS NULL AND refund_id IS NULL AND entry_change_id IS NULL)
  );`,
  // 60: a recipient hid an expired-invitation notice. The audit row stays; a later expiry is a new notice.
  `CREATE TABLE expired_invitation_dismissals (
    account_id text NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    membership_change_id text NOT NULL REFERENCES membership_changes(id) ON DELETE CASCADE,
    dismissed_at timestamptz NOT NULL,
    PRIMARY KEY (account_id, membership_change_id)
  );`,
  // 61: a rider asks to withdraw one paid entry; an organizer approves (the existing withdrawal runs) or declines.
  `CREATE TABLE withdrawal_requests (
    id text PRIMARY KEY,
    seq bigint GENERATED ALWAYS AS IDENTITY,
    event_id text NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    order_id text NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    entry_id text NOT NULL REFERENCES order_entries(id) ON DELETE CASCADE,
    requested_by text REFERENCES accounts(id) ON DELETE SET NULL,
    client_request_id text NOT NULL,
    reason text NOT NULL,
    policy_json jsonb NOT NULL,
    status text NOT NULL CHECK (status IN ('open', 'approved', 'declined')),
    decided_by text REFERENCES accounts(id) ON DELETE SET NULL,
    decision_reason text,
    entry_change_id text REFERENCES entry_changes(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL,
    decided_at timestamptz,
    UNIQUE (entry_id, client_request_id),
    CHECK ((status = 'open') = (decided_at IS NULL)),
    CHECK (status <> 'declined' OR decision_reason IS NOT NULL)
  );
  CREATE UNIQUE INDEX withdrawal_requests_one_open ON withdrawal_requests(entry_id) WHERE status = 'open';
  CREATE INDEX withdrawal_requests_by_event ON withdrawal_requests(event_id, status, created_at);`,
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
  // Any connection can drop (database restart, test teardown), and an unheard error ends the process. The pool
  // listens only to idle clients, so each client gets a listener for its whole life, including the handoff from
  // idle to checked out. The pool discards a client that lost its connection when it is released.
  pool.on('connect', (client) => {
    let lost = false;
    client.on('error', (err) => {
      // One loss can emit twice (the server's reason, then the closed socket): report the first.
      if (!lost) onPoolError?.(err);
      lost = true;
    });
  });
  // An idle client's error also reaches the pool. The listener above has already reported it.
  pool.on('error', () => {});
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

    async lockShared(key: string) {
      if (!tx.getStore()) throw new Error('db.lockShared() must be called inside a transaction.');
      await query('SELECT pg_advisory_xact_lock_shared(hashtext($1))', [key]);
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
