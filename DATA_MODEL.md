# Data model

This describes the database the local build uses today. It covers tables, relationships, important fields, constraints, and what happens when data is removed. The intended product data model, including entities that are not built yet, is in [product.md](product.md#data-model) and [product.md](product.md#data-storage).

**Status:** Implemented (local build). Describes schema version 34 on PostgreSQL as of November 18, 2026. The database moved from SQLite to PostgreSQL under [ADR 0004](docs/decisions/0004-hosted-stack-and-database.md); local SQLite data is not carried over (reseed instead).

**Source of truth:** the migrations in [src/server/db.ts](src/server/db.ts) and the event configuration schema in [src/shared/schema.ts](src/shared/schema.ts). If this file disagrees with them, the code wins; fix this file in the same change.

## Storage and migrations

- One PostgreSQL database, set by `DATABASE_URL` (default `postgres://cyclereg:cyclereg@127.0.0.1:5432/cyclereg`, a local container described in [local setup](docs/runbooks/local-setup.md)). The server talks to it through the `pg` driver with a connection pool.
- Migrations are an ordered list of SQL strings in `MIGRATIONS` in [src/server/db.ts](src/server/db.ts). The `schema_migrations` table records each applied version. Before the server accepts requests it takes a PostgreSQL advisory lock, runs each pending migration in its own transaction, and records it, so two app instances starting together migrate once. There are no down migrations; to start over, drop and recreate the database.
- New migrations are appended to the end of the list. Never edit one that has already shipped, because existing databases will not rerun it.
- The first twelve migrations were translated from the SQLite versions on November 15, 2026 rather than added as new ones, because no PostgreSQL database existed yet.

| Migration | Adds |
|---|---|
| 1 | `organizations`, `events`, `event_versions`, `test_entries` |
| 2 | `orders`, `order_entries`, `payment_attempts` (checkout, simulated payment) |
| 3 | `bib_settings`, `bib_assignments`, `check_ins` (race-day check-in) |
| 4 | `start_list_snapshots` |
| 5 | `waitlist_entries` |
| 6 | `order_entries.original_category_id` and `withdrawn_at`; `entry_changes` (transfers and withdrawals) |
| 7 | `check_in_undos` |
| 8 | `start_list_locks` |
| 9 | `check_ins.duration_ms` |
| 10 | `rider_links`, `rider_link_dismissals` |
| 11 | `orders.extras_json` |
| 12 | `entry_resolutions` |
| 13 | Every timestamp column changes from ISO 8601 text to `timestamptz` (existing values are cast exactly) |
| 14 | `coupons`; `orders.coupon_id` (basic coupon codes) |
| 15 | `rider_corrections` (organizer corrections to rider details) |
| 16 | `accounts`, `organization_members`, `organization_invitations`; `orders.account_id` and `waitlist_entries.account_id` (email sign-in and organizer roles, [ADR 0003](docs/decisions/0003-sign-in-and-mfa.md)) |
| 17 | `payment_sessions`, `provider_events`; `payment_attempts.provider`, `provider_ref`, `amount_cents` (Stripe hosted Checkout in test mode, [ADR 0002](docs/decisions/0002-stripe-payments.md)) |
| 18 | `refunds`; `provider_events.payment_ref` and `amount_cents` (entry and order refunds for simulated and Stripe test-mode payments) |
| 19 | `membership_changes`; `rider_corrections.corrected_by` (who changed roles and who corrected rider details) |
| 20 | `organization_invitations.expires_at`; `membership_changes.action` gains `invitation_renewed` and `invitation_expired` (invitations expire after 14 days) |
| 21 | `automatic_bib_jobs`; `bib_assignments.automatic_job_id` (opt-in post-close allocation and actor/job linkage) |
| 22 | `coupons.max_per_rider` (how many times one rider may use a code) |
| 23 | `email_messages` (outgoing email, recorded before any send, [ADR 0006](docs/decisions/0006-transactional-email-amazon-ses.md)) |
| 24 | `bib_reassignments`; `bib_assignments.reassignment_id` and `start_list_snapshots.reassignment_id` (approved historical bib changes and linked revisions) |
| 25 | `junior_profiles`; `orders.junior_profile_id` (guardian access to juniors, one guardian per junior) |
| 26 | `orders.waiver_evidence_json`: server-recorded acceptance account, declared racing age and timestamp; no historical backfill |
| 27 | `refunds.request_json`: normalized accepted refund request with unique per-order client request identity; historical evidence remains null |
| 28 | `junior_guardians`: explicit mirror of existing single-guardian ownership; authorization remains unchanged |
| 29 | `junior_guardian_invitations`: private pending/cancelled invitation records; no email, acceptance or access grant |
| 30 | Explicit guardian acceptance; profile creator provenance and soft merges; linked order access uses active grants |
| 31 | Explicit guardian removal reason and acknowledgement evidence |
| 32 | `junior_profile_claims`: support-reviewed DOB/zone/reference, approval identity/time and claimed rider authority; invitation `profile_claimed` cancellation reason |
| 33 | Stable `junior_profile_claims.registration_name_json` snapshot/insert trigger and full guardian account/profile history index for the post-claim checkout guard |
| 34 | `cancellation_confirmations`: reviewed-plan snapshot, actor/reason/acknowledgement and per-event retry identity; no cancellation execution |
| 35 | `cancellation_executions`, entry `cancelled_at`: simulation-only atomic execution, scope closure, immutable result and retry evidence |

IDs are text generated by the application. Timestamps (columns ending in `_at`, plus `orders.hold_expires_at` and `waitlist_entries.offer_expires_at`) are `timestamptz` since migration 13. The app writes them as ISO 8601 UTC strings, and the driver returns them in the same form (for example `2027-03-01T18:00:00.000Z`, millisecond precision), so the API and the domain code still see strings. Comparisons and ordering in SQL are now true time comparisons. Money is stored in integer cents. Columns ending in `_json` are `jsonb`. Yes/no flags (`order_entries.license_reviewed`, `check_in_undos.bib_released`, `entry_resolutions.rider_notified`) are `boolean`. `event_versions.warnings_acknowledged` stays an integer: it holds the number of warnings acknowledged.

Tables whose rows are listed in time order (`organizations`, `accounts`, `membership_changes`, `events`, `coupons`, `orders`, `order_entries`, `entry_changes`, `rider_corrections`, `waitlist_entries`, `bib_assignments`, `check_in_undos`, `start_list_locks`, `entry_resolutions`) have a `seq` identity column. It breaks ties between equal timestamps in insertion order, as SQLite's `rowid` did, and is not shown in the tables below.

## Relationships

```mermaid
erDiagram
    organizations ||--o{ events : owns
    organizations ||--o{ organization_members : "team roles"
    accounts ||--o{ organization_members : "holds roles"
    organizations ||--o{ organization_invitations : "roles waiting for sign-in"
    organizations ||--o{ membership_changes : "role history"
    accounts |o--o{ membership_changes : "made the change"
    accounts |o--o{ rider_corrections : "corrected by"
    accounts |o--o{ orders : "placed"
    accounts |o--o{ waitlist_entries : "joined"
    events ||--o{ cancellation_confirmations : "reviewed plans"
    accounts ||--o{ cancellation_confirmations : "confirmed by"
    events ||--o{ event_versions : "published as"
    events ||--o{ test_entries : "simulated entries"
    events ||--o{ orders : "registered through"
    orders ||--|{ order_entries : contains
    orders ||--o{ payment_attempts : "payment results"
    orders ||--o{ payment_sessions : "Stripe Checkout Sessions"
    orders |o--o{ provider_events : "Stripe notifications"
    orders ||--o{ refunds : "money returned"
    order_entries |o--o{ refunds : "refund for one entry"
    events ||--o| bib_settings : "bib ranges"
    orders ||--o{ bib_assignments : "bib history"
    events ||--o{ automatic_bib_jobs : "post-close jobs"
    accounts ||--o{ automatic_bib_jobs : "configured by"
    automatic_bib_jobs |o--o{ bib_assignments : "automatic assignments"
    events ||--o{ bib_reassignments : "approved bib changes"
    accounts ||--o{ bib_reassignments : "requested by"
    bib_reassignments |o--o{ bib_assignments : "replacement numbers"
    bib_reassignments |o--o{ start_list_snapshots : "revisions"
    orders ||--o{ check_ins : "checked in"
    orders ||--o{ check_in_undos : "undone check-ins"
    orders ||--o| rider_links : "linked as one rider"
    events ||--o{ start_list_snapshots : "start lists"
    events ||--o{ start_list_locks : "locked start lists"
    events ||--o{ waitlist_entries : "waitlists"
    orders |o--o| waitlist_entries : "redeems offer"
    order_entries ||--o{ entry_changes : "transfers and withdrawals"
    events ||--o{ coupons : "coupon codes"
    coupons |o--o{ orders : "redeemed by"
    orders ||--o{ rider_corrections : "corrected details"
```

An account is one person who signed in. Organization members tie an account to an organization with one or more roles; invitations hold a role for an email that has not signed in yet. An organization owns events. Each event has one editable draft and any number of immutable published versions. Riders register through orders against one published version; each order holds one entry per category bought. Bibs, check-ins, and start-list snapshots belong to the event, and bibs and check-ins also point at the order (one order is one rider). `order_entries`, `bib_assignments`, and `check_ins` also carry `event_id` directly so they can be queried per event.

Races, race days, categories, start groups, display groups, and capacity pools are **not tables**. They live inside the event configuration JSON (see [Event configuration](#event-configuration-json)). Columns such as `category_id`, `race_id`, and `day_id` refer to IDs inside that JSON and are not enforced by foreign keys.

## Tables

### organizations

| Column | Notes |
|---|---|
| `id` | Primary key |
| `name` | Required |
| `created_at` | |

### accounts

One row per person who has signed in (migration 16). Sign-in itself (emailed code or link, rate limits, lockout) happens at Clerk; this table stores no password or sign-in factor.

| Column | Notes |
|---|---|
| `id` | Primary key (`acct_...`) |
| `provider_user_id` | The identity provider's user ID (a Clerk user ID; `test|<email>` only in local tests). Unique |
| `email` | The provider's verified primary email, stored lowercase when the account is created. Unique ignoring case (`accounts_by_email`): one account per person, and a second sign-in identity with the same email is refused |
| `created_at` | First sign-in |

### organization_members

Organizer roles (migration 16). Primary key (`organization_id`, `account_id`, `role`), so a person can hold several roles in one organization and each role once. What each role may do is in [src/shared/roles.ts](src/shared/roles.ts) and is checked on the server for every organizer route.

| Column | Notes |
|---|---|
| `organization_id` | References `organizations`; deleting the organization deletes its memberships |
| `account_id` | References `accounts`; indexed (`organization_members_by_account`) |
| `role` | `owner`, `registration_manager`, `check_in_volunteer`, `timer_export`, or `finance` (check constraint) |
| `granted_by` | Account that granted the role; null for seed scripts. Whoever loads a demo is recorded as granting their own owner role. Set to null if that account is deleted |
| `created_at` | |

The person who creates an organization becomes its owner. The last owner cannot be removed. Whoever loads a demonstration organization (fictional data) becomes an owner of it. An owner can hand ownership to someone who has already signed in: in one transaction under the organization's member lock, the successor gains `owner` and the caller loses it (other roles stay). Someone with only an invitation cannot take ownership.

### organization_invitations

A role granted to an email with no account yet (migration 16). Primary key (`organization_id`, `email`, `role`); emails are stored lowercase. An invitation stays open for `INVITATION_DAYS` (14, in `src/shared/roles.ts`). Adding the same email and role again renews it, including after it expired: `expires_at` starts over and `invited_by` becomes the person who renewed it. When someone first signs in with that verified email, each open invitation becomes an `organization_members` row; every invitation for the email is then deleted, expired ones included, because from then on an owner adds that person directly.

| Column | Notes |
|---|---|
| `organization_id` | References `organizations`; cascades on delete |
| `email` | Indexed |
| `role` | Same values as `organization_members.role` |
| `invited_by` | Account that added or last renewed it, or null |
| `created_at` | When it was first sent |
| `expires_at` | Migration 20. Not null. Sign-in after this time gives no role. Invitations that existed before migration 20 got `created_at` plus 14 days |

### membership_changes

Migration 19. Append-only history of role and invitation changes in an organization, shown newest first (the latest 50) in the team panel. Application code never updates or deletes these rows; deleting the organization deletes them.

| Column | Notes |
|---|---|
| `id` | Primary key (`mch_...`) |
| `organization_id` | References `organizations`; cascades on delete. Indexed with `created_at` |
| `action` | `granted`, `invited`, `invitation_renewed`, `invitation_accepted`, `invitation_expired`, `removed`, `invitation_cancelled`, or `ownership_transferred` (check constraint; the two invitation values added by migration 20) |
| `email` | The person whose role changed, lowercase. Kept as text so the history survives the account |
| `role` | Same values as `organization_members.role`; `owner` for a hand-over |
| `actor_id` | Account that made the change: null for seed scripts; for `invitation_accepted` and `invitation_expired`, the person who signed in. Set to null if that account is deleted |
| `created_at` | |

The recipient-facing expiry view reads the latest history action per organization/role for the authenticated email. It shows only invitation_expired actions, so a later grant of the same role supersedes its notice. Re-adding a signed-in recipient is a direct grant, not renewal of the deleted invitation. This derived read adds no table or migration.

Granting a role someone already holds writes no row. Inviting an email again writes `invitation_renewed`. An invitation that expires unused writes `invitation_expired` only when that person signs in; until then the team panel shows it as expired, with Resend and Cancel.

### junior_profiles

Migration 25 introduced profiles; migration 30 separates creator provenance from current authority. A junior has up to two active explicit guardians. Registering with guardian details creates or reuses an unmerged profile under the registering account's active grants. No global name/email household merge occurs. Legacy unlinked junior orders are adopted before inviting or accepting; an acceptor with another managed profile of the same normalized name is refused for support review.

| Column | Notes |
|---|---|
| `id` | Primary key (`jun_...`) |
| `created_by_account_id` | Original profile creator, renamed from `guardian_account_id` in migration 30. Nullable account reference with `ON DELETE SET NULL`; provenance, never authority |
| `name_key` | Normalized first/last name joined by a tab. Older space-joined keys are rewritten under the family lock. No global or creator/name uniqueness is inferred; ambiguous managed matches block registration |
| `first_name`, `last_name` | Current corrected profile name |
| `viewer_email` | Optional lowercase read-only junior login. Either active guardian may set/clear it; it cannot equal either current guardian's email |
| `created_at` | Original profile creation time |
| `merged_into_id`, `merged_by`, `merged_at` | All null or complete soft-merge evidence. Source profiles remain stored; active access excludes them |

A name correction may merge only profiles sharing an active guardian and having identical active guardian sets. Conflicting nonempty junior viewer emails block the whole correction. Successful merges move orders and invitation history to the canonical profile, retain the source profile, and revoke its redundant grants with correcting actor/time. Accepted invitation evidence stays unchanged. The existing order-correction transaction takes the event lock then the shared family lock before changing any order row.

`orders.junior_profile_id` references the profile with `ON DELETE RESTRICT` since migration 30, so deleting a profile cannot restore original-placer access through a null link.

### junior_guardians

Migration 28 backfilled one initial grant per existing profile using profile creation time and an unknown `granted_by`. Migration 30 makes active grants on unmerged profiles the authority for junior orders and family APIs. New profile creation writes its initial grant atomically. Explicit invitation acceptance adds the second grant under the shared family lock, with inviter and acceptance time; signing in alone adds nothing. Migration 31 adds the explicit removal API evidence described below.

| Column | Notes |
|---|---|
| `id` | Primary key (`jgd_...`; historical migration rows use `jgd_migrated_<profile ID>`) |
| `junior_profile_id` | References `junior_profiles`; cascades on profile deletion, which linked orders restrict |
| `account_id` | Guardian account reference; indexed for active rows |
| `granted_by`, `granted_at` | Initial creating account/time or invitation issuer/acceptance time. Historical actor remains null |
| `revoked_by`, `revoked_at` | Actor/time for redundant grants on a soft merge; no general access-removal endpoint is implemented |

The partial unique index permits one active grant per profile/account; the two-guardian cap is enforced by serialized application acceptance. The shared `orderManagerSql` in `src/server/juniors.ts` allows the placing account for an unlinked adult order, or an active guardian for a linked junior order. Private reads, payment/cancellation authorization and registration lists reuse it. Original placer identity alone never authorizes a linked junior order; checkout nonce replay also rechecks active authority. `placedByYou` remains provenance and `canManage` is the independent current permission. Read-only junior viewing remains separate. Account deletion/retention is not implemented; actor references may block deletion.

Migration 31 adds nullable `removal_reason` and `removal_acknowledged_at` to `junior_guardians`. Explicit removals require a different authenticated guardian, 3–300 character trimmed reason and acknowledgement timestamp equal to revocation time; a check constraint requires complete evidence. Historical and profile-merge revocations keep both fields null, without inferred acknowledgement. Private relationship history exposes these records to current guardians. The history response derives `isYou` from the authenticated account ID for display; it is not a stored column and does not grant authority. The removal transaction takes the family lock and targets a relationship ID, never an account-wide revocation: identical retry retains evidence, changed replay conflicts, and opposing removals leave one guardian. It does not rewrite orders, payments, waiver evidence, viewer access or accepted invitations.

### junior_guardian_invitations

Migrations 29–30. Existing guardians privately create/list/replace/cancel invitations; the recipient lists pending invitations by their authenticated email and explicitly accepts with acknowledgement. No historical invitation acceptance is inferred. Existing accounts receive no automatic access. My registrations now renders recipient invitation lookup and acknowledged acceptance, using these same APIs and evidence. My registrations now includes invitation creation/cancellation and relationship removal/history controls. Email delivery remains Planned.

| Column | Notes |
|---|---|
| `id` | Primary key (`jinv_...`) |
| `junior_profile_id` | Current canonical profile; invitation history moves there on a same-family merge |
| `email` | Validated, trimmed lowercase invited address |
| `invited_by`, `created_at`, `expires_at` | Guardian account and original period, using shared `INVITATION_DAYS` |
| `cancelled_by`, `cancelled_at`, `cancellation_reason` | All null or complete actor/time/reason: `cancelled`, `replaced`, `profile_merged` or `profile_claimed`; retries preserve the first outcome |
| `accepted_by`, `accepted_at` | Both null or complete accepting account/time; acceptance and cancellation are mutually exclusive |

One unaccepted, uncancelled record per profile is enforced by a partial unique index; a partial email index serves recipient lookup. Repeating the same pending address preserves ID/expiry. Replacement closes the old record and creates a new one under the family lock. Status is accepted, cancelled, expired at/after deadline, or pending, in that order. An old cancellation cannot close a replacement; cancelling an accepted invitation returns a conflict and cannot remove access.

Acceptance rechecks invited email, original inviter's active authority, an unmerged profile, cancellation/expiry, current guardian count, junior viewer address and acceptor household collision. Grant insertion and acceptance evidence commit together. Concurrent/repeated acceptance yields one grant and retains original evidence; accepted replay never reactivates a revoked grant. Recipient lookup exposes only the junior name, inviter email and expiry needed to review the invitation, not order/emergency/waiver details. Role-based organizer access remains separate; organizers cannot accept or manage a family's invitations without their own explicit family authority.

### junior_profile_claims

Migration 32. One application-written support approval per canonical junior profile. Historical profiles get no inferred DOB, time zone or claim. The support endpoint returns only claim ID and approval time; ordinary rider/order/profile responses do not expose the review inputs.

| Column | Notes |
|---|---|
| `id` | Primary key (`clm_...`) |
| `junior_profile_id` | Unique profile reference with `ON DELETE RESTRICT`; no second claim or profile deletion while evidence remains |
| `rider_account_id` | Existing signed-in claimant account; account deletion restricted |
| `approved_by`, `approved_at` | Authenticated allowlisted support account and UTC approval time; approver must differ from claimant |
| `client_request_id` | Unique normalized creation identity; identical retries retain the original approval |
| `birth_date`, `time_zone` | Support-reviewed calendar DOB (`date`) and rider-confirmed named zone as supplied (trimmed, without runtime alias rewriting); sensitive personal data, not legal identity proof |
| `review_reference` | Trimmed 3–300 character review reference; no identity-document copies |
| `minimum_age` | Explicit configured threshold; database check requires 18 |
| `registration_name_json` | Added in migration 33 for the checkout block: raw first/last names captured atomically by a before-insert trigger. Older claims get the current profile name as the policy-activation baseline, not reconstructed historical claim-time evidence. Complete string fields are required; later profile correction does not rewrite the snapshot |

The family-locked transaction inserts the claim, revokes all active guardian grants with actor/time, cancels unaccepted invitations with `profile_claimed`, and clears `viewer_email`. These writes roll back together on failure. Order authorization recognizes the claimed rider account; original order account, accepted quote, payment and waiver records are not changed. Guardian removal reason/acknowledgement remain null for claim-driven revocation; the claim row supplies its separate approval evidence. Existing organizer roles remain separate. There is no general audit immutability or deletion/retention policy, and no support restoration workflow; account/profile references can restrict future deletion. Claims are disabled until explicit age 18 and support account IDs are configured.

New junior checkout also checks historical guardian account/profile links and their recorded merge chains under the family lock. A recursive query deduplicates visited profile IDs; soft-merged source profiles and grant history remain stored. If that account formerly managed a claimed profile with the same normalized recorded registration-block name, the transaction is refused before inserting an order. It compares the saved name fields with the existing shared normalization rather than trusting legacy stored keys or later mutable profile names. Migration 33 captures a current enforcement baseline for existing claims, adds the insert trigger (including compatibility with older writers that omit the new column), and indexes historical guardian account/profile lookup. Existing DOB, approval time, actor and references are unchanged. No new review entity or override field is stored. Existing accepted orders, legacy adoption and unrelated households are not retroactively merged or invalidated.

### email_messages

Migration 23. One row per outgoing email, written before any send ([ADR 0006](docs/decisions/0006-transactional-email-amazon-ses.md)). The only kind so far is `organizer_invitation`, sent when a signed-in owner invites or resends an invitation (seed scripts send none). The team panel shows the latest status for each invitation. A failed send changes nothing about the invitation. Application code only inserts a row and then sets its outcome; deleting the organization deletes its rows.

| Column | Notes |
|---|---|
| `id` | Primary key (`eml_...`) |
| `organization_id` | References `organizations`; cascades on delete. Indexed with `ref` and `created_at` |
| `kind` | `organizer_invitation` (check constraint) |
| `ref` | What the message is about. For an invitation: `organization_id:email:role` |
| `to_email`, `subject`, `body_text` | The message as written. Invitation emails hold no rider data |
| `status` | `recorded` (local email: kept, never sent), `sent`, or `failed` |
| `provider_message_id` | SES message ID when sent |
| `error` | Provider error text when the send failed (first 500 characters) |
| `created_at`, `sent_at` | |

Not recorded yet: SES delivery, bounce, and complaint events (Planned; they need an SES configuration set with event publishing).

### events

The working draft of an event and a pointer to its current published version.

| Column | Notes |
|---|---|
| `id` | Primary key |
| `organization_id` | Required; references `organizations`. Indexed (`events_by_org`) |
| `draft_json` | The full draft [event configuration](#event-configuration-json) |
| `revision` | Starts at 1; increases on every save. A save must send the revision it started from, or it is refused with "changed somewhere else" (stale-save protection) |
| `published_version` | Latest version number in `event_versions`, or null if never published |
| `published_revision` | Draft revision that was published, used to tell whether the draft has unpublished changes |
| `created_at`, `updated_at` | |

### event_versions

Immutable published snapshots. Riders always register against one of these, never the draft.

| Column | Notes |
|---|---|
| `event_id`, `version` | Composite primary key; `event_id` references `events`. Versions count up from 1 |
| `config_json` | Copy of the draft configuration at publish time |
| `draft_revision` | Draft revision that was published |
| `warnings_acknowledged` | Number of validation warnings the organizer acknowledged |
| `published_at` | |

Publishing is refused if validation finds errors, or warnings that were not acknowledged. Rows are only inserted, never updated.

### test_entries

Simulated entries for exercising capacity rules in the organizer workspace. No payment and no rider data.

| Column | Notes |
|---|---|
| `id` | Primary key |
| `event_id` | References `events`. Indexed |
| `category_id` | Category ID inside the event configuration |
| `rider_ref` | Opaque rider reference, so one rider counts once toward shared limits |
| `created_at` | |

Unique on (`event_id`, `category_id`, `rider_ref`): a rider can hold a category once.

### orders

A rider's checkout in the app. Payment is simulated; no money moves.

| Column | Notes |
|---|---|
| `id` | Primary key |
| `event_id` | References `events`. Indexed |
| `published_version` | The `event_versions` version the order was priced and checked against. Later edits to the event do not change it |
| `client_request_id` | Idempotency key from the browser. Unique per event, so a resubmitted checkout returns the same order instead of a duplicate |
| `status` | `held`, `payment_failed`, `confirmed`, `expired`, `cancelled`, or `needs_attention` (see [Order lifecycle](#order-lifecycle)) |
| `rider_json` | Rider details: name, email, phone, team, racing age, license category, type and number, competition class, collegiate division, emergency contact, and optional guardian. The current details; organizer corrections update it and keep the earlier values in `rider_corrections` |
| `waiver_json` | Waiver version, read and agreed flags, typed signature name, and whether the rider or a guardian signed |
| `waiver_evidence_json` | Migration 26. Accepting account ID (null for demo/case-study fixture orders, including organizer demo actions), validated declared racing age and server acceptance timestamp. Not changed by the application through checkout replay/corrections; null for historical unknown evidence. Does not prove legal age or approval |
| `quote_json` | Price breakdown shown at checkout, so the accepted price stays on record. Since migration 14 it may carry `coupon`: the coupon terms accepted (code, percent or fixed amount, eligible categories), the discount it gave, and which entries got it; coupon discounts also appear on the entry lines with the reason `Coupon <CODE>` |
| `coupon_id` | Migration 14. References `coupons`; the code the rider used, or null. Partial index for counting redemptions. The order is the redemption record (see [Coupon redemptions](#coupon-redemptions)) |
| `extras_json` | Migration 11. Answers to per-category questions (`answers`: category ID → question ID → text) and the category IDs whose waiver addendum the rider accepted (`addenda`). Null on older orders, read as none |
| `total_cents` | Order total |
| `hold_expires_at` | When held places are released (default 10 minutes after the order; `HOLD_MINUTES` overrides) |
| `check_in_code` | Set when the order is confirmed |
| `created_at`, `updated_at`, `confirmed_at` | |
| `account_id` | Migration 16. The signed-in account that placed the order; indexed. That account manages unlinked adult orders; active explicit guardians manage linked junior orders, including payment/cancellation. Authorized organizer roles and the junior's read-only viewer retain their separate permissions. Null for orders made before sign-in and for simulated demo riders. Set to null if the account is deleted |

A retried checkout with the same `client_request_id` returns the first order only to the account that placed it; another account gets 409. The browser retains the exact pending request and displayed waiver text in its existing per-tab draft until recovery or definitive rejection; same-tab refresh preserves the original ID when session storage is available. This adds no database column or migration. Each order still carries its own copy of the rider's details: there is no separate rider profile table, and one account can register other riders (for example a parent).

### coupons

Migration 14. Coupon codes an organizer creates for one event (product.md: Promotions).

| Column | Notes |
|---|---|
| `id` | Primary key |
| `event_id` | References `events` |
| `code` | Upper case; letters, numbers, hyphens, underscores. Unique per event (`UNIQUE (event_id, code)`) |
| `kind` | `fixed` or `percent` (CHECK) |
| `amount_cents` | Fixed coupons: amount off the order, split across eligible entries. Null for percent coupons (CHECK) |
| `percent` | Percent coupons: 1 to 100 off each eligible entry, rounded half up to the cent. Null for fixed coupons (CHECK) |
| `category_ids` | jsonb array of category IDs inside the event configuration; empty means every category |
| `valid_from`, `valid_until` | Optional local event times (`YYYY-MM-DDTHH:MM`, read in the event time zone, like category registration windows). Start inclusive, end exclusive |
| `max_redemptions` | Optional total cap across all riders |
| `max_per_rider` | Migration 22. Optional limit for one rider. A rider is matched across this coupon's paid orders and live holds by the same rule as same-rider suggestions (same license number, or same name and email), checked under the event lock when an order is placed and again when a payment arrives after the hold ended. Two juniors registered from one family email are different riders |
| `active` | The organizer can turn a code off and on. Off codes are refused at checkout; orders already placed keep their discount |
| `created_at`, `updated_at` | |

Coupons are not part of the published event configuration, so creating or turning off a code does not need a new published version. Coupons are never deleted.

### order_entries

One row per category in an order.

| Column | Notes |
|---|---|
| `id` | Primary key |
| `order_id` | References `orders` |
| `event_id` | References `events`. Indexed |
| `category_id` | Current category ID. Inside the order's published version, or a later one after a transfer |
| `rider_ref` | Opaque rider reference shared by all entries in the order |
| `status` | `held`, `confirmed`, `released`, `withdrawn`, or `cancelled`. Withdrawal and event/race/day cancellation are distinct; neither inactive state takes a place or appears on current start lists |
| `original_category_id` | Category bought at purchase, set on the first transfer (null means unchanged). Used to find what was paid for the entry in `orders.quote_json` |
| `withdrawn_at` | When the organizer withdrew the entry |
| `cancelled_at` | Migration 35: when an atomic simulated scope cancellation cancelled the entry; null for older records, never inferred |
| `license_reviewed`, `license_review_note`, `license_reviewed_at` | Organizer's manual license review. Defaults to not reviewed. A withdrawn entry cannot be marked reviewed |

The operational cancellation impact preview reads live order entries, waitlist status/expiry, test reservations, rider links and saved start-list snapshot references under the event lock. It reuses capacity distinct-rider rules to compare current usage with hypothetical removal of all selected reservations, including test entries and live offers; no capacity or entry is actually released. No new entity, schema or audit row is created. Snapshot contents and historic exports remain unchanged. Event-wide snapshot references include removed races; linked live-order waitlist offers remain in the waitlist impact but are omitted from duplicate audience records. This does not deduplicate people across unrelated accounts/orders.

The read-only paid cancellation allocation preview uses `order_entries.category_id` for current published race/day selection, `original_category_id` (or unchanged category) to locate the accepted line in `orders.quote_json`, and `orders.published_version` for the accepted cancellation rules. It selects confirmed entries on confirmed orders, excludes whole-order fees and does not rewrite allocation when only one package component is selected. There is no preview/cancellation/credit row or state mutation from this endpoint; nominal allocation is not a refundable balance.

### cancellation_confirmations

Reviewed cancellation plan evidence (migration 34), exposed through APIs and the Registrations confirmation screen. The separate simulation-only executor consumes a saved plan only after new acknowledgement and fresh checks; confirmation alone never executes. Normal confirmation routes only insert/read. The owner-only generated case-study reset removes confirmations for its own fixture events under event locks; unrelated plan evidence remains. Direct database administration is not made immutable. No historical plan is inferred on upgrade.

The execution financial preflight reads these records and current impact/payment/refund evidence without writing a result or queue. Its eligibility classification is transient, simulation-only and not stored execution state. No schema change accompanies the preflight.

| Column | Notes |
|---|---|
| `id` | Application-generated primary key |
| `event_id` | Required event reference; deletion restricted |
| `client_request_id` | Trimmed opaque request identity, 8–128 Unicode characters; unique with `event_id` |
| `confirmed_by`, `confirmed_at` | Required server-derived account reference and timestamp; account deletion restricted |
| `reason` | Normalized reason of 3–300 Unicode characters |
| `selection_json` | Reviewed strict event/race/day scope; database requires an object with a recognized string scope |
| `preview_fingerprint` | Lowercase SHA-256 digest of stable reviewed impact plus payment-attempt/session/refund metadata; effective expiry included, assessment timestamps excluded |
| `preview_json` | Server-reviewed impact snapshot; required matching event and selection; no rider contacts, tokens or provider payloads |
| `acknowledged_plan_only` | Required true acknowledgement, constrained in the database |

`plan_confirmed` and `executionAvailable: false` are response classifications, not stored cancellation/entry/payment state. Exact retry of the same event/request identity and normalized selection/reason/fingerprint returns the original record; changed details conflict. Current owner/finance authority is required for creation, replay and ID-based read. New identities may create separate reviewed plans, with no execution side effect. Confirmation recomputes state under the event lock, but provider updates outside that lock still require later reconciliation. Simulation execution uses its own fresh checks and repeat/overlap protection; provider/credit execution remains Planned. Snapshot/actor retention is a real-data acceptance gate, not decided by this schema.

The confirmation screen retains only unresolved request/review-version data or a resolved record ID in account/event-scoped tab storage. Recorded evidence is loaded from the server; browser storage does not replace or modify the database evidence. Blocked storage limits recovery to the current page. Starting a separate review clears only the local completed-reference pointer, preserving server evidence; unresolved intent cannot be discarded through that action. No schema change accompanies the screen.

### cancellation_executions

Migration 35, simulation-only execution evidence and durable sale closure. `id` is primary; `event_id` references the event, `(event_id, confirmation_id)` references the matching reviewed plan, and `executed_by` references the authenticated account, all with restricted deletion. `confirmation_id` is unique; `(event_id, client_request_id)` is unique and the normalized request identity is 8–128 Unicode characters. `request_json` retains the strict acknowledged execution intent. `executed_at`, `selection_json`, frozen `race_ids`/`category_ids` and `result_json` preserve scope, actor/time, cancelled entries, removed waitlists, simulated refund references/amounts, audience and historical snapshot references. Result identity/event/plan/actor fields must match their row. No earlier execution or entry cancellation is inferred.

The event transaction and sorted order refund-request locks cover preflight, accepted-allocation simulated refunds, cancelled entry state/timestamp, active waitlist removal and the final result. Any failure rolls back all writes. Exact retry returns the result; another identity for the plan or an overlapping scope conflicts. Scope guards cover current event/day placement and frozen race/category identities, including later published categories or moves. No undo/reopening exists. Original quote, waiver, payment status, unaffected entries, check-in/bib history and saved snapshots remain; current start lists derive removals from inactive entries. Audience evidence does not send messages. Provider mode and provider/credit history are refused; mixed provider configurations against one database are unsupported for this rehearsal.

### entry_changes

Log of organizer transfers and withdrawals of paid entries (migration 6). The order's price is never changed; money differences are recorded here and settled outside the app while payments are simulated.

| Column | Notes |
|---|---|
| `id` | Primary key |
| `event_id`, `order_id`, `entry_id` | References `events`, `orders`, `order_entries`. Indexed by (`order_id`, `created_at`) |
| `kind` | `transfer` or `withdraw` |
| `from_category_id` | Category before the change |
| `to_category_id` | Category after a transfer; null for a withdrawal |
| `amount_paid_cents` | What the rider paid for this entry at purchase, after discounts |
| `new_price_cents` | Current price of the new category (transfers only) |
| `difference_cents` | `new_price_cents` − `amount_paid_cents`. Positive: the rider owes; negative: a refund is due |
| `reason` | Required organizer note |
| `created_at` | |

### rider_corrections

Migration 15. Append-only audit of organizer corrections to rider details (product.md 4: "Allow authorized corrections with a reason and an audit trail"). Application code never updates or deletes these rows.

| Column | Notes |
|---|---|
| `id` | Primary key |
| `event_id` | References `events` |
| `order_id` | References `orders`. Indexed with `created_at` |
| `changes_json` | Array of `{ field, label, before, after }`, only fields that changed. Correctable fields: first and last name, email, phone, team, license number, emergency contact name and phone. Eligibility fields (racing age, license category and type, competition class, collegiate division) and the waiver signature cannot be corrected |
| `cleared_reviews_json` | Set when a corrected license number cleared earlier license reviews on the order: each cleared entry's category ID, review note, and review time. Null otherwise |
| `reason` | Required, 3 to 300 characters |
| `corrected_by` | Account that made the correction (migration 19); null for corrections made before migration 19. Set to null if that account is deleted |
| `created_at` | |

A correction never changes `quote_json`, `total_cents`, entries, `waiver_json` or `waiver_evidence_json`, so there is no money difference to record. It takes the event lock, like transfers. The before and after values are rider personal data and follow the same retention rules as `rider_json` (not built yet).

### payment_attempts

Each payment result for an order: a simulated button press, or a verified Stripe test-mode notification.

| Column | Notes |
|---|---|
| `id` | Primary key. The payment attempt ID sent with the notification (for Stripe, the Stripe event ID; for a zero-total order, `free-<order id>`), so a repeated notification is recognized and returns the order unchanged |
| `order_id` | References `orders`. An attempt ID already recorded for a different order is refused |
| `outcome` | `success`, `failure`, or `mismatch` (Stripe reported a paid amount or currency that differs from the order total) |
| `result_status` | Order status after processing it |
| `created_at` | |
| `provider` | `simulated` (default, including every row before migration 17) or `stripe_test` |
| `provider_ref` | Stripe PaymentIntent ID, when there is one. Kept for reconciliation; a refund names the payment it returns money from by this ID |
| `amount_cents` | Amount the provider reported. Null for simulated attempts |

### payment_sessions

One row per Stripe Checkout Session the app opened (migration 17). Only a session in this table can confirm an order.

| Column | Notes |
|---|---|
| `id` | Primary key. Stripe's session ID (`cs_test_...`) |
| `order_id` | References `orders` |
| `provider` | `stripe_test` |
| `url` | Stripe's hosted payment page, reused while the session is open |
| `amount_cents` | The order total the session charges. A paid notification must match it and the order total |
| `status` | `open`, `completed` (Stripe reported the session finished, paid or awaiting a delayed method), or `expired` |
| `expires_at` | When Stripe closes the session: 31 minutes after the order's fixed hold expiry, so a retry sends the same parameters; the capacity hold still ends at `orders.hold_expires_at` |
| `created_at` | |

At most one open session per order is reused. A new session is opened only while the hold is live and the previous session has expired, so a rider cannot pay twice by accident. The idempotency key sent to Stripe is `checkout-<order id>-<n>`. The request expiry is anchored to the existing order hold rather than the time of each call, so a later retry keeps the key and parameters unchanged. The SDK retries transient conflicts twice. If that budget is exhausted, the API returns a retryable 503 with instructions to use the same order; no session row or payment is fabricated. No schema migration is needed. Existing session deadlines and accepted orders are not rewritten.

### provider_events

Every verified Stripe notification, recorded once by event ID with what it did (migration 17).

| Column | Notes |
|---|---|
| `id` | Primary key. Stripe's event ID. A repeated delivery is answered from this row and changes nothing |
| `provider` | `stripe_test` |
| `type` | Stripe's event type, for example `checkout.session.completed` |
| `session_id` | Stripe session ID, when the event has one |
| `order_id` | References `orders`. Null when the session is not one this app opened |
| `outcome` | `paid`, `pending` (completed, delayed method not settled), `failed`, `expired`, or `ignored` (an event type the app does not act on) |
| `result` | What happened: the order status after `orders.pay`, or `awaiting_payment`, `session_expired`, `unknown_session`, `duplicate_charge` (a second paid session for an order that already had one: money to refund, never a second entry), or `ignored` |
| `received_at` | |
| `payment_ref` | Stripe PaymentIntent ID the notification was about (migration 18), so a duplicate charge can be found and refunded |
| `amount_cents` | Amount the notification reported (migration 18) |

### refunds

Money returned to a rider (migration 18). Each refund returns money from one payment and can name one entry. Entry and payment states are separate: a refund never withdraws an entry, and a withdrawal never refunds.

| Column | Notes |
|---|---|
| `id` | Primary key. Used as the provider idempotency key within the guarded retry window |
| `order_id` | References `orders` |
| `request_json` | Normalized accepted client request ID, requested payment/entry, amount and reason. Null for historical rows; unique order/client request pair. Identical replay keeps the row, changed payload is refused |
| `entry_id` | References `order_entries`. Null for a refund of the whole order or of a duplicate charge |
| `provider` | `simulated` (recorded at once, no money moves) or `stripe_test` |
| `payment_ref` | Stripe PaymentIntent ID the money comes from. Null for a simulated payment |
| `amount_cents` | Greater than zero. The total of active refunds can never exceed what the payment brought in, or what the entry cost |
| `reason` | The organizer's reason |
| `status` | `requested` (row saved, Stripe not yet answered), `pending`, `succeeded`, `failed`, or `canceled`. The first three are active and count against the amount left to refund |
| `provider_refund_id` | Stripe's refund ID. Unique |
| `failure_reason` | Why Stripe failed or canceled it, when it did |
| `requested_by` | References `accounts`; becomes null if the account is deleted |
| `created_at`, `updated_at` | |

The row is written before Stripe is called, so its amount is reserved against the cap. Refund writes for one order run under a lock on `refunds:<order id>`. Creation replay looks up the accepted request before recalculating caps. Unresolved requested provider refunds stop sending after 23 hours; their amount remains reserved pending reconciliation or a late signed update. No historical request evidence is invented. A refunded order keeps its status, its places, its start-list rows, and its coupon redemption until an organizer withdraws the entries.

### bib_settings

| Column | Notes |
|---|---|
| `event_id` | Primary key; references `events`. One row per event |
| `settings_json` | Bib scope (`weekend` or per day) and number ranges per scope |
| `updated_at` | |

### automatic_bib_jobs

Opt-in post-close allocation jobs retain `event_id`, the selected `sort`, `configured_by` (an account), and `created_at`. `completed_at` and `assigned` record a successful allocation; `cancelled_at` and `cancelled_by` preserve superseded or disabled jobs. `last_attempt_at` and `message` expose waiting or failure reasons. One partial unique index permits only one pending job per event. Event deletion cascades its jobs; account foreign keys preserve actor attribution.

Each automatically created `bib_assignments` row references its `automatic_job_id`; manual and existing assignments leave that link null. Completion and every day's assignments commit together under the event lock. A range failure rolls back all assignment rows and saves the job's reason for retry. Settings changes now take that same lock. The worker rechecks current published closing windows, active checkout holds, and the enabling account's current manager permission. No pending-payment entry is allocated, and no payment, readiness, or check-in state changes. Completed jobs do not run again; enabling another job preserves its predecessor's history.

The application polls pending jobs once a minute while listening and checks them on startup. Shutdown waits for work in progress before closing the database. Jobs remain pending while the server is stopped; no cloud scheduler is provisioned. The settings UI and manager-only `GET`/`POST`/`DELETE /api/events/:id/automatic-bibs` endpoints expose status, enabling, and cancellation.

### bib_reassignments

An append-only record of one approved individual or bulk change. `id` is the primary key; `event_id` references the event, `day_id` is the selected configuration day, `scope` is its collision scope, and `(event_id, published_version)` references the published configuration. `requested_by` references the authenticated account; `reason` and `created_at` record why and when. `assignments_json` contains stable rider keys, previous/new assignment IDs, and before/after numbers, without copying names or contact fields. Those JSON IDs are application-validated references, not database foreign keys.

New bib rows and every affected start-list snapshot reference this change through their nullable `reassignment_id` foreign key. Previous bib rows remain with their release reason and original automatic-job/change links. Manual numbers or deterministic resequencing both require the same fresh preview. Checked-in changes require an explicit acknowledgement bound to that preview; only selected riders’ check-in changes invalidate approval. A no-op writes no change, assignment, or snapshot. Conflicts, changed previews, and snapshot failures leave all numbers and history unchanged. Weekend changes revise every affected race across both days; day-scoped changes leave other days alone. Each revision is a full current race snapshot, including other entry/check-in changes since the previous version; that earlier version remains available for comparison. Existing timer locks keep their original snapshot reference.

Individual corrections retain active bibs even after refund, withdrawal, or cancellation. Inactive orders without active bibs remain absent from check-in search. Linked groups use live orders when present, retaining historical orders when the whole group is inactive. Withdrawn-entry ranges apply when the rider has no active entry in the scope; released unpaid holds do not constrain corrections. Inactive riders appear only while holding a bib in the selected collision scope. Revisions use confirmed entries while any active entry remains, otherwise the retained withdrawn entries. Corrections preserve financial, entry, readiness, and check-in states. Bulk selection still requires confirmed entries.

Every release, replacement, audit record, and snapshot commits in one event-locked transaction. Demo reset deletes linked bibs and snapshots before change records and published versions; real history is not deleted by reassignment.

### bib_assignments

Bib history. A changed bib is released with a reason, never deleted.

| Column | Notes |
|---|---|
| `id` | Primary key |
| `event_id` | References `events` |
| `scope` | `weekend`, or a race day ID when bibs are per day |
| `order_id` | References `orders` (the rider) |
| `bib` | Bib number |
| `assigned_at` | |
| `reassignment_id` | Nullable reference to the approved change that created the replacement number |
| `automatic_job_id` | Nullable reference to the post-close job that allocated this number; null for manual/existing assignments |
| `released_at`, `release_reason` | Null while the bib is active |

Two partial unique indexes apply only to active rows (`released_at IS NULL`): a bib number is used once per event and scope (`bib_active_number`), and a rider has one active bib per event and scope (`bib_active_rider`).

The check-in bulk-assignment panel and Phase 3 selected-rider bib API use shared request/response types and assignment exclusions. The check-in list includes the caller’s roles and published day/race/category labels for selection; it adds no private contact fields. Checked-in riders remain excluded even if a settings change leaves no active bib in the new collision scope. The API reads active assignments and confirmed orders under the same per-event transaction lock used by check-in. Its preview fingerprint binds the selected day, optional race/category, sort mode, bib settings, current assignments, and proposed numbers. Race/category scope requires every selected rider to have an entry in that scope (otherwise the batch is refused) and limits which entries the start-order sort uses; the bib range is the overlap of all applicable entry ranges across the collision scope, matching check-in. A category range replaces the event/day fallback for that entry. Empty intersections and missing ranges block new writes; race/category selection never widens the range. Apply recomputes that plan before inserting every row in one transaction; a stale preview or exhausted range inserts none. It does not change entry, payment, waiver, license, or check-in state. No new table or migration is needed for this partial workflow.

### check_ins

| Column | Notes |
|---|---|
| `id` | Primary key |
| `event_id` | References `events` |
| `order_id` | References `orders` |
| `day_id` | Race day ID inside the event configuration |
| `checked_in_at` | |
| `duration_ms` | Measured check-in time (migration 9): from the volunteer's first keystroke or scan into an empty search to the successful check-in. Null when the rider was opened without a search, or the time was over 10 minutes (treated as interrupted) |

Unique on (`event_id`, `order_id`, `day_id`): one check-in per rider per day. A repeat check-in is ignored and the first one is kept.

### check_in_undos

Undone check-ins (migration 7). Undoing removes the `check_ins` row so the rider can be checked in again; this table keeps the record.

| Column | Notes |
|---|---|
| `id` | Primary key |
| `event_id`, `order_id` | References `events`, `orders` |
| `day_id` | Race day ID inside the event configuration. Indexed with `order_id` |
| `checked_in_at` | When the undone check-in happened |
| `bib` | Bib the rider held at the time, if any |
| `bib_released` | 1 if the bib was released; 0 if it was kept because it also covers another day the rider is still checked in for |
| `reason` | Required note |
| `undone_at` | |

A released bib's `bib_assignments.release_reason` reads "Check-in undone: <reason>".

### start_list_snapshots

Numbered start lists per race. Immutable once saved; later changes show as a difference from the previous snapshot.

| Column | Notes |
|---|---|
| `id` | Primary key |
| `event_id` | References `events` |
| `race_id` | Race ID inside the event configuration |
| `version` | Counts up per race; unique on (`event_id`, `race_id`, `version`) |
| `published_version` | Event version the snapshot was built from |
| `rows_json` | The start-list rows |
| `reassignment_id` | Nullable reference to the bib change that caused this revision |
| `created_at` | |

### waitlist_entries

Organizer-managed waitlists (migration 5). A rider joins a full category whose waitlist is turned on; the organizer offers places in order. Policy: [product.md](product.md#3-capacity-and-entry-integrity).

| Column | Notes |
|---|---|
| `id` | Primary key |
| `event_id` | References `events` |
| `category_id` | Category ID inside the event configuration |
| `rider_json` | Name, email, racing age, license category and type, competition class, collegiate division. No emergency contact or guardian |
| `status` | `waiting`, `offered`, `accepted`, or `removed`. An `offered` row whose `offer_expires_at` has passed reads as `expired` (no background job) |
| `offer_token` | Random private link token, set when offered; unique |
| `offered_at` | When the organizer made the offer |
| `offer_expires_at` | `offered_at` + 24 hours |
| `order_id` | References `orders`; set when the rider starts checkout from the offer link |
| `created_at` | Join time; sets the order of the list (index on `event_id`, `category_id`, `created_at`) |
| `updated_at` | |
| `account_id` | Migration 16. The signed-in account that joined; null on older rows. Another account joining with the same rider email is refused |

Paying for the offer's order sets `status` to `accepted`. Removing a rider withdraws any open offer.

### start_list_locks

Start-list locks (migration 8). The organizer locks a race's start list when sending it to the timer. Locking saves a new `start_list_snapshots` row and records the lock against it. Changes after a lock are allowed and are shown as revisions against the locked snapshot. Locking again adds a new row; the most recent row is the current lock.

| Column | Notes |
|---|---|
| `id` | Primary key |
| `event_id` | References `events` |
| `race_id` | Race ID inside the event configuration. Indexed with `event_id` and `locked_at` |
| `snapshot_version` | The `start_list_snapshots.version` that was locked |
| `locked_at` | |

### rider_links

Rider identity across orders (migration 10). The organizer links orders that are the same rider; each linked order points at a rider key, the earliest order in the group. An order with no row is its own rider. Check-in, bibs, check-ins, and start-list `rider_id` use the rider key. Capacity uses it too: when places are counted, a linked order's entries carry the rider key's reference instead of their own `order_entries.rider_ref`, so linked orders count as one rider toward a shared start-group limit or capacity pool (the stored `rider_ref` is not rewritten, and unlinking restores separate counting). Suggestions come from same license number, or same full name and email; nothing is linked automatically.

| Column | Notes |
|---|---|
| `order_id` | Primary key; references `orders` |
| `event_id` | References `events`. Indexed with `rider_key` |
| `rider_key` | References `orders`: the earliest order in the linked group |
| `linked_at` | |

When two orders are linked, a bib or check-in held by the later group moves to the rider key. Linking is refused if both groups already hold one. Unlinking deletes the group's rows; any bib or check-in stays with the earliest order.

### rider_link_dismissals

Suggested matches the organizer marked as different riders (migration 10), so they are not suggested again. Primary key (`event_id`, `order_a`, `order_b`), with `order_a` < `order_b`; plus `dismissed_at`.

### entry_resolutions

Resolution items for paid entries affected by a published change (migration 12). Publishing a change that touches paid entries opens one item per entry; a later change to the same entry adds to its open item.

| Column | Notes |
|---|---|
| `id` | Primary key |
| `event_id`, `order_id`, `entry_id` | References `events`, `orders`, `order_entries`. Indexed by (`event_id`, `status`) |
| `published_version` | Version whose publish opened or last refreshed the item |
| `details_json` | Plain-language list of what changed, from the impact preview |
| `status` | `open`, `kept`, `transferred`, or `withdrawn`. `withdrawn` needs a withdrawn entry; `transferred` needs a transfer logged after the item opened |
| `rider_notified` | 1 once the organizer confirms the rider was told (required to resolve) |
| `note` | Required note on what was agreed |
| `created_at`, `resolved_at` | |

## Event configuration (JSON)

`events.draft_json` and `event_versions.config_json` hold one document validated by `eventConfigSchema` in [src/shared/schema.ts](src/shared/schema.ts) (`schemaVersion: 1`). It contains:

| Part | Holds |
|---|---|
| `event` | Name, time zone, venue, demo flag and notice |
| `ruleSet` | Rule source and season |
| `registration` | Bundles, discounts, fees, and related settings, including `refundRules` (refund and credit steps, how withdrawals are paid back, and what riders get when the organizer cancels; null when none are set) and `refundPolicy` (extra notes). Orders keep the rules of the version they were sold under because they point at that version |
| `days` | 1 to 7 race days |
| `races` | Up to 20 races, each on a day, road race or criterium |
| `displayGroups` | Up to 40 headers that group categories for display; they never set limits |
| `startGroups` | Up to 100, each in a race, with start and staging times and an optional field limit |
| `categories` | Up to 300; each has eligibility paths, pricing and price changes, a registration window, race length, classifications, a start group, an optional `waitlistEnabled` flag (off when absent), optional `questions` (up to 5: wording, required, and answer choices or free text), an optional `addendum` (title and text the rider accepts), an optional `bibRange` (first and last, used at check-in instead of the event or day range), and a status of `active`, `closed`, or `archived` |
| `capacityPools` | Up to 50 shared limits over listed categories and start groups |

The Berkeley demo seeds $80 road race and $60 criterium base prices and a fixed $130 bundle (`priceCents: 13000`, `discountCents: 0`); the fixed price takes precedence over a discount amount. Existing drafts and published orders are not migrated.

Bundles may carry optional `omnium` metadata (`code`, `label`). When such a bundle applies, `orders.quote_json.bundle.omnium` snapshots those values, the two bundled category IDs, and `status: needs_review`. This records a podium nomination, not an awarded classification, additional entry, or clearance. It is provisional until the order is confirmed; cancelled, expired, or released orders do not represent entered packages. No nomination approval or results storage exists. Older bundles and quotes omit this optional metadata. Existing databases need no SQL migration.

The configuration is validated on every save. A save is also refused if it would make existing entries invalid, for example a cap lowered below the places already taken.

## Named demo workspace identity

Named demo loaders identify their shared workspaces and exact fixture event by fixed reserved organization/event IDs, not user-chosen names. Registry definitions supply these IDs to the existing `createOrganization` function. The reserved IDs pin the local demo workspaces already created in this session, so seed reruns preserve their event IDs. A matching display name in another organization never identifies a fixture workspace. Before granting the loader caller demo-owner access, an existing reserved workspace must contain only its exact fixture event, with both draft and latest published configurations marked as demo. Additional events are refused even if their draft is relabeled as demo. The loader transaction and advisory lock use the reserved ID. No schema migration or new privilege model is added. Legacy ad hoc working-copy loaders still create fresh organizations rather than finding any by name.

## Combined Berkeley demo seed

`npm run seed:berkeley` uses the existing tables and schema. It creates the reserved `Berkeley Omnium (local demo)` organization and one Berkeley Omnium 2027 event with an immutable published version, two days, two races, and 54 categories. No orders, rider records, or simulated capacity entries are seeded. The existing Berkeley configuration supplies $80/$60 base prices, a fixed $130 two-race package, podium nomination, $20 extra criterium entry, $15 day-of surcharge, zero fees, and demo window bypass. Creation and publication occur in one transaction under the demo-seed advisory lock. Reruns return the existing event without overwriting drafts or publishing new versions. Previously seeded standalone events and other data are preserved; a fresh database yields the combined-only catalog. The separate organizer working-copy loader still creates a draft with simulated capacity entries. No SQL migration is needed.

Owner-directed local cleanup (November 15, 2026): removed the previously seeded standalone Berkeley Hills Road Race and Berkeley Streets Criterium events and their published versions after verifying that neither had operational records or simulated capacity entries. The existing published Berkeley Omnium, both of its races, and organization/account access were preserved. Immediately after that cleanup, the local rider catalog contained only the combined Omnium; subsequent historical loaders add the other documented demos. This is a one-off cleanup, not automatic deletion on seed reruns.

## Burlingame historical demo seed

`npm run seed:burlingame` calls the authenticated `/api/demo/burlingame` loader, reusing the published-demo transaction with Berkeley. It uses a reserved organization ID, displayed as `Burlingame historical case study (local demo)`, and creates one event with a published snapshot, seven starts, and nine categories from the historical fixture. Each masters start links two categories with separate classification codes. Test limits are 60 riders per start, category caps are unset, and prices are 4000 cents with zero fees. Eligibility requires organizer review, and each category uses a synthetic 40-minute duration. No rider, order, payment, result, or simulated capacity records are seeded. The organization-scoped advisory lock prevents concurrent duplicate seeds. Reruns return the existing event and preserve drafts, versions, Berkeley, and other data. No schema migration is required. Sources and unresolved approval rules are documented in the [case study](docs/case-studies/organizer-templates/burlingame-criterium.md).

## San Francisco Grand Prix historical demo seed

`npm run seed:sf-grand-prix` uses the authenticated `/api/demo/san-francisco-grand-prix` route and shared published-demo transaction. It uses a reserved organization ID displayed as `San Francisco Grand Prix historical case study (local demo)` and creates one event, published snapshot, day, road race, start, category, and classification. The category stores total distance 108.1 miles with `laps: null`; different loop lengths are descriptive course text, not route-segment entities. The start uses synthetic 09:00/60-rider values; pricing is 4000 cents, zero fees, and draft adult annual-license PRO eligibility requiring organizer review. No rider, order, payment, team roster, result, or capacity entries are seeded. The organization advisory lock prevents duplicate concurrent seeds; reruns preserve IDs, drafts, versions, and other demos. No schema migration is needed. Professional admission remains unsupported. See [source and approval boundaries](docs/case-studies/organizer-templates/san-francisco-grand-prix.md).

## Red Kite historical criterium sample seed

`npm run seed:red-kite` uses the authenticated `/api/demo/red-kite-series` route and shared published-demo transaction. It reserves `Red Kite historical criterium sample (local demo)` and creates one empty published event with three historical days/races (#2, #5, #9), 33 starts, and 42 categories. All day/race/start/category references are distinct per round. Each selected round has three starts with two separately classified categories sharing the same synthetic 60-rider limit; category caps remain unset. Synthetic prices are 4000 cents per selection with zero fees/discounts, durations are 30 minutes, and draft eligibility requires organizer review. No bundle, series/pass entity, standings, overall nomination, participant, order, payment, result, or capacity rows are seeded. The org-scoped lock and transaction prevent duplicate seeds and partial publication; reruns preserve drafts, versions, and other events. No schema migration is needed. The full 14-round series is not modeled; see [case study and unresolved decisions](docs/case-studies/organizer-templates/red-kite-series.md).

## Regional historical demo seeds

The shared [regional fixture definitions](src/shared/regionalHistoricalEvents.ts) register four authenticated routes through the existing published-demo transaction: `/api/demo/wente`, `/api/demo/mount-hamilton`, `/api/demo/chico-stage-race`, and `/api/demo/sunset-criterium`. Their reserved demo organizations are defined once in that module and used by both API registration and seed CLI selection. Each loader atomically creates one empty published event under an organization-scoped advisory lock. Reruns preserve event IDs, draft edits, published versions, and other organizations/events; simultaneous requests reuse one event.

| Fixture | Days/races | Starts/categories | Source versus synthetic scope |
|---|---|---|---|
| Wente | 1/1 | 3/3 | 2018 identity; all three fields, start times and 60/45/30-mile lengths are test data |
| Mount Hamilton | 1/1 | 9/14 | 2019 full-course schedule and 63.5-mile total; shared categories retain distinct classification codes |
| Chico | 2/2 | 4/4 | Two selected fields in 2018 road/crit components; no TT, circuit, stage progression, or GC entities |
| San Rafael Sunset | 1/1 | 3/3 | 2017 program slots; synthetic amateur field and 40-minute lengths, no kids/fixed-gear entities |

All category prices are 4000 cents, fees and surcharges are zero, start limits are synthetic 60-rider values, and category caps are unset. Draft annual-license/adult eligibility requires organizer review. Length objects are copied per category so editing one does not alter siblings. IDs and category/start/race references are fresh and local to each event; shared starts do not merge classifications. No rider, order, payment, result, waiver-signature, or capacity rows are seeded. No schema migration is needed. The [case index](docs/case-studies/organizer-templates/README.md) links source/approval boundaries; these fixtures add no full stage-race, professional admission, or equipment-specific workflow.

## Team time trial read-only research examples

`seed:bbc-ttt` and `seed:pinole-ttt` use authenticated `/api/demo/bbc-team-time-trial` and `/api/demo/pinole-team-time-trial` routes and the existing named-demo publication transaction. Reserved organizations and builder metadata live in [the research fixture](src/shared/teamTimeTrialResearch.ts). Organization advisory locks prevent duplicate seeds; reruns preserve IDs, edits, and versions.

The JSON event document adds optional `event.researchOnly`; omitted/false retains normal event validation. A true marker permits publication only for `isDemo` records with no races, categories, starts, pools, or packages. This adds no SQL migration. Each seed inserts a demo organization/access, event draft, and immutable published version. No team, rider, order, price, payment, signature, or result records are seeded. Public summaries expose a required boolean research marker; the chooser labels read-only examples and hides their dates. Shared selection checks and server order creation reject research registrations even through direct API requests.

BBC's day identifies March 9, 2008. Pinole's unresolved edition uses November 15, 2026 explicitly as a research placeholder, never a race date. No TT discipline, team-entry model, timing system, or pre-2000 season extension is added. Older local drafts are explicitly updated and published, not rewritten by idempotent reruns. Paid-entry safety checks still apply to organizer changes. Source/approval boundaries are in the [BBC](docs/case-studies/organizer-templates/berkeley-bicycle-club-team-time-trial.md) and [Pinole](docs/case-studies/organizer-templates/pinole-team-time-trial.md) cases.

## Generated case-study data

`npm run seed:cases` uses the current tables and schema without a migration. It creates one reserved organization (`org_demo_case_studies_v1`) and fixed event IDs. Scenario configuration and simulated test-entry IDs are stable. A PostgreSQL advisory transaction lock serializes loader and reset requests. Rerunning a scenario returns the existing event instead of overwriting organizer changes or duplicating entries and orders. Seeded payment attempts are simulated records only.

The case-study reset is a narrow development operation. In one transaction it resolves events owned by the reserved organization, acquires their event locks in sorted order, removes their execution records and reviewed plan confirmations, then deletes their dependent change-resolution records, rider links, locks, changes, waitlist records, check-ins, bib records, snapshots, payment attempts, order entries, orders, test entries, versions, events, and finally the organization. It never accepts an arbitrary organization ID. Unrelated organizations are preserved. This is not a general rider-data deletion or retention workflow.

## Capacity and concurrency

- Places taken = test entries + confirmed order entries + held order entries whose order hold has not expired + live waitlist offers (`offered`, not expired) whose rider does not yet hold the place through a live order.
- Waitlist first: while a category with its waitlist on has a `waiting` row or a live offer, checkout refuses that category except through the offer link, and the public page reports it as full.
- Every write that can change capacity, holds, payments, bibs, or the ledger runs in a transaction that first takes the event's lock (`pg_advisory_xact_lock` on `event:<id>`): saving a draft, publishing, adding test entries, creating an order, payment, cancelling, transfers and withdrawals, waitlist join and offer, check-in, bib changes, undoing a check-in, rider linking, and start-list snapshots and locks. Two requests for the last place cannot both succeed, even from two app instances; the second waits, then sees the place taken. A repeated payment notification on another connection waits too, then finds the attempt already processed. Writes on different events do not wait for each other.
- Coupon caps: creating an order with a code counts that code's redemptions inside the same event-locked transaction that takes the places, so two riders racing for the last redemption get exactly one (covered by a two-connection test in `tests/coupons.test.ts`).
- Unique constraints still back the rules that must never break: one active bib number per scope (`bib_active_number`, a partial unique index), one check-in per rider and day, one order per client request ID, and one row per payment attempt.

## Order lifecycle

```mermaid
stateDiagram-v2
    [*] --> held: checkout
    held --> confirmed: payment succeeds
    held --> payment_failed: payment declined
    payment_failed --> confirmed: retry succeeds
    held --> expired: hold runs out
    payment_failed --> expired: hold runs out
    expired --> confirmed: late payment, places still free
    expired --> needs_attention: late payment, places gone, window closed, or coupon cap reached
    held --> cancelled: rider cancels
    payment_failed --> cancelled: rider cancels
    expired --> cancelled: rider cancels
    cancelled --> needs_attention: payment arrives after cancelling
```

A new order starts `held` and reserves its places. A successful payment confirms it and issues a check-in code. If the hold runs out, the order is treated as `expired` and its places are free again. A payment that arrives after expiry is confirmed only if every place is still free, registration is open, and any coupon on the order is still under its cap; otherwise the order goes to `needs_attention` for an organizer. A payment for a cancelled order also goes to `needs_attention`, never a silent re-entry, and so does a Stripe payment whose amount or currency differs from the order total. Payment notifications for `confirmed` or `needs_attention` orders change nothing.

`expired` is mostly computed rather than stored: an order still stored as `held` or `payment_failed` reads as `expired` once `hold_expires_at` has passed, so no background job is needed. Entries in an expired order read as `released`. Cancelling or moving to `needs_attention` stores `released` on the entries.

### Coupon redemptions

There is no separate redemption table: an order with `coupon_id` set is the redemption. It counts toward the cap while it is `confirmed`, or `held`/`payment_failed` with a live hold. An expired, cancelled, or `needs_attention` order does not count, so an abandoned hold releases its redemption without a background job. A late payment on an expired order re-checks the cap as well as the places; if another rider took the last redemption meanwhile, the order goes to `needs_attention`. The accepted discount lives in `quote_json` and is never recomputed. A transfer or withdrawal of a paid entry does not return the redemption, and neither does a refund.

## Deletion behavior

Owner-directed local fixture retirement (November 15, 2026): the two legacy purchase-flow demo events were removed in one transaction after confirming they were fictional and had no orders, payment sessions, or other operational children. Only simulated capacity rows, published fixture versions, and the two event rows were deleted. Unrelated events, accounts, and organization access were retained. This was a one-off local cleanup, not a new deletion API or schema migration; the removed loader cannot recreate these fixtures.

The app does not delete operational records during ordinary organizer or rider workflows. The generated case-study reset is the one development-only exception described above.

- **Few cascades.** Operational foreign keys have no `ON DELETE` clause, so deleting a parent row that still has children fails. The exceptions are the sign-in tables (migration 16): deleting an organization deletes its memberships and invitations, deleting an account deletes its memberships, and `orders.account_id`, `waitlist_entries.account_id`, and organization membership/invitation actor references become null. Junior profile creator provenance also becomes null; guardian/invitation evidence references can restrict account deletion. Ordinary app endpoints do not delete organizations, events, versions, orders, payment attempts, bibs, check-ins, or snapshots.
- **Test entries** can be cleared for one event. The generated case-study reset explicitly deletes its own related records in dependency order.
- **Categories** are archived (`status: archived` in the configuration), not removed, so published versions and existing entries still resolve them. If an order's category is missing from its published version, it shows as "Removed category".
- **Orders** are never deleted. Cancelled and expired orders stay for history and stop counting toward capacity.
- **Bibs** are released with a reason, never deleted.
- **Published versions and start-list snapshots** are insert-only.
- **General reset** means dropping and recreating the database ([local setup](docs/runbooks/local-setup.md#start-over)). The scoped case-study reset is not a substitute for retention or rider deletion. Retention periods and deletion of rider personal data are not built; [product.md](product.md#data-storage) requires them before a pilot.

## Not in the database yet

These are in [product.md](product.md#data-model) but do not exist in the app: sign-in factors and MFA records (final pre-launch security gate; Clerk holds sign-in), rider profiles separate from orders for adult riders (juniors have [`junior_profiles`](#junior_profiles) with up to two explicit guardians; acceptance and support-approved claim APIs exist; claim screens remain Planned), live payments (Stripe test-mode payments and refunds are recorded in `payment_sessions`, `provider_events`, `payment_attempts`, and `refunds`; no real money moves), automated waitlist promotion, USA Cycling license and waiver checks, and a general audit log.

Per-feature histories exist instead of a general log. These record who made the change: [`membership_changes`](#membership_changes) (role changes, invitations, and ownership hand-over), `rider_corrections.corrected_by`, `refunds.requested_by`, `bib_reassignments.requested_by`, and `automatic_bib_jobs.configured_by` and `cancelled_by`. These do not record an actor yet: `entry_changes` (transfers and withdrawals), `check_in_undos`, and `bib_assignments`, although each of those actions already requires a signed-in organizer with the right role.


## Planned expansion, not current schema

The [season-pass requirements](product.md#cross-organization-bundles-and-season-passes) require a common purchase linking components across organizations/events, participant approvals, accepted rule versions, and per-organization discount/revenue/refund allocations. Current `orders.event_id` and event-local `registration.bundles` cannot represent that purchase. Planned Stripe payment, refund, transfer, and payout references need distinct reconciliation state; successful payment does not mean an organizer has been paid. Reusable rider identity, scoped reporting, per-rider promotion limits and cross-organization promotions, communications, and overall-participation decisions likewise need an explicit data design before implementation. The generated-fixture loader and scoped reset add no SQL migration, product state transition, or live workflow. The target requirements live in product.md; this file continues to describe the existing database above.


### Planned participant, bib, and credit extensions

[Participant management](product.md#participant-management) requires reusable rider identity plus organization/role-scoped history, saved views, record-action audits, and identity-correction safeguards; current orders still hold independent rider copies. [Automatic/bulk bib allocation](product.md#automatic-and-bulk-bib-assignment) must retain the existing active-number uniqueness and assignment history while adding stable batch previews, concurrency checks, and atomic application; manual batch previews are not persisted, while post-close jobs and their assignment links are stored as described above. [Credits and deferrals](product.md#reusable-credits-and-deferrals) need an auditable balance ledger with issuance, reservation, redemption, release, expiry and restoration records, original payment allocations, issuing-organization/currency/restriction references, and linked source/destination decisions. These are target requirements only. Participant workspace and credit extensions remain Planned; post-close bib jobs are Implemented as described above.

### Rider-specific fixture pricing

Versioned registration settings optionally contain `riderRates`: an existing structured eligibility path, structured category gender scope (`any` or women/men eligibility paths), race base/extra-entry prices, and a fixed bundle price. Shared quote calculation chooses the lowest eligible rate from declared rider facts. Missing facts do not qualify. Accepted order quotes remain immutable snapshots; publishing revised Berkeley prices does not reprice existing orders. No SQL schema change is needed.

The interim local published rate format may retain `categoryIds`; readers honor that stored scope. Newly published fixture rates use `categoryGenderClass`, so deleting or duplicating categories cannot leave stale rate IDs. Updating the local demo uses the validated configuration/publication APIs and does not rewrite historical versions or order quotes.
