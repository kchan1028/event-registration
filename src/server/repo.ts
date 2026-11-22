import { cancellationScopeState, type CancellationSelection } from '../shared/cancellations';
import { requireCancellationOpen, requireCancellationPlacementUnchanged } from './cancellationClosure';
import { canAdmit, entryCountsByCategory, type LimitUsage } from '../shared/capacity';
import { bibSettingsSchema, DEFAULT_BIB_SETTINGS, type BibSettings } from '../shared/checkin';
import { newId } from '../shared/factory';
import { eventConfigSchema, type EventConfig, type CapacityEntry, type PublicEventSummary } from '../shared/schema';
import { countIssues, validateConfig, type Issue } from '../shared/validation';
import type { Db } from './db';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

interface EventRecord {
  id: string;
  organizationId: string;
  organizationName: string;
  revision: number;
  publishedVersion: number | null;
  publishedRevision: number | null;
  updatedAt: string;
  config: EventConfig;
}

interface EventRow {
  id: string;
  organization_id: string;
  organization_name: string;
  draft_json: unknown;
  revision: number;
  published_version: number | null;
  published_revision: number | null;
  updated_at: string;
}

/** The per-event lock key: every write that can change capacity, holds, bibs, or the ledger takes it first. */
export const eventLock = (eventId: string) => `event:${eventId}`;

/**
 * SQL for "this order entry holds a place": confirmed, or held while its order's hold has not run out.
 * Expects the aliases `oe` (order_entries) and `o` (orders); `at` is the placeholder for the current time.
 */
export const liveEntrySql = (at: string) => `(oe.status = 'confirmed' OR (oe.status = 'held' AND o.hold_expires_at > ${at}))`;

/**
 * SQL for "this unpaid order still reserves what it holds" (a coupon redemption, for example):
 * held or payment failed, with time left on the hold. Expects the alias `o` (orders).
 */
export const reservedOrderSql = (at: string) => `(o.status IN ('held', 'payment_failed') AND o.hold_expires_at > ${at})`;

export function createRepo(db: Db, clock: () => Date) {
  const now = () => clock().toISOString();
  const getRowSql = `SELECT e.*, o.name AS organization_name FROM events e JOIN organizations o ON o.id = e.organization_id WHERE e.id = $1`;
  // Places in use: test entries, confirmed and unexpired held order entries, and live waitlist
  // offers (an offer reserves its place until it expires or its rider's order holds the place instead).
  // Orders the organizer linked as one rider (rider_links) share the rider key's reference, so the
  // rider counts once toward a shared limit, as on start lists and at check-in.
  const entriesSql = `SELECT id, category_id, rider_ref FROM test_entries WHERE event_id = $1
     UNION ALL
     SELECT oe.id, oe.category_id, COALESCE('rider-' || rl.rider_key, oe.rider_ref) FROM order_entries oe JOIN orders o ON o.id = oe.order_id
     LEFT JOIN rider_links rl ON rl.order_id = oe.order_id
     WHERE oe.event_id = $1 AND ${liveEntrySql('$2')}
     UNION ALL
     SELECT w.id, w.category_id, 'waitlist-' || w.id FROM waitlist_entries w
     WHERE w.event_id = $1 AND w.status = 'offered' AND w.offer_expires_at > $2
       AND NOT EXISTS (
         SELECT 1 FROM order_entries oe JOIN orders o ON o.id = oe.order_id
         WHERE o.id = w.order_id AND ${liveEntrySql('$2')}
       )`;

  function toRecord(row: EventRow): EventRecord {
    return {
      id: row.id,
      organizationId: row.organization_id,
      organizationName: row.organization_name,
      revision: row.revision,
      publishedVersion: row.published_version,
      publishedRevision: row.published_revision,
      updatedAt: row.updated_at,
      config: eventConfigSchema.parse(row.draft_json),
    };
  }

  async function requireEvent(id: string): Promise<EventRecord> {
    const row = await db.get<EventRow>(getRowSql, [id]);
    if (!row) throw new HttpError(404, 'Event not found.');
    return toRecord(row);
  }

  /** Checkout compares only the waiver version, so one version must mean one text for the event's whole history. */
  async function waiverVersionHasOtherText(id: string, config: EventConfig) {
    const { waiverVersion, waiverText } = config.registration;
    const other = await db.get(
      `SELECT 1 FROM event_versions
       WHERE event_id = $1 AND COALESCE(config_json #>> '{registration,waiverVersion}', '') = $2
         AND COALESCE(config_json #>> '{registration,waiverText}', '') <> $3
       LIMIT 1`,
      [id, waiverVersion, waiverText],
    );
    return !!other;
  }

  async function requireWaiverVersionKeepsItsText(id: string, config: EventConfig) {
    if (!(await waiverVersionHasOtherText(id, config))) return;
    const { waiverVersion } = config.registration;
    const label = waiverVersion ? `Waiver version "${waiverVersion}"` : 'A blank waiver version';
    throw new HttpError(422, `${label} was already published with different text. In Event setup, enter a new waiver version, then publish, so riders agree to the new text.`);
  }

  async function entries(eventId: string, asOf = now()): Promise<CapacityEntry[]> {
    const rows = await db.all<{ id: string; category_id: string; rider_ref: string }>(entriesSql, [eventId, asOf]);
    return rows.map((r) => ({ id: r.id, categoryId: r.category_id, riderRef: r.rider_ref }));
  }

  /** Rules that protect existing entries; enforced on every save. */
  function assertSafeForEntries(config: EventConfig, current: CapacityEntry[]): void {
    const counts = entryCountsByCategory(current);
    for (const [categoryId, count] of Object.entries(counts)) {
      const cat = config.categories.find((c) => c.id === categoryId);
      if (!cat) throw new HttpError(409, `A category with ${count} entries cannot be deleted. Archive it instead so its history is kept.`);
    }
    const blocking = validateConfig(config, current).filter((i) => i.key.endsWith('.below-entries'));
    if (blocking.length > 0) throw new HttpError(409, blocking[0].message, blocking);
  }

  return {
    waiverVersionHasOtherText,
    /** The given organizations with a summary of each event's draft, oldest first. */
    async listOrganizations(organizationIds: readonly string[]) {
      if (organizationIds.length === 0) return [];
      const orgs = await db.all<{ id: string; name: string }>(`SELECT id, name FROM organizations WHERE id = ANY($1) ORDER BY created_at, seq`, [organizationIds]);
      const events = (
        await db.all<EventRow>(
          `SELECT e.*, o.name AS organization_name FROM events e JOIN organizations o ON o.id = e.organization_id WHERE e.organization_id = ANY($1) ORDER BY e.created_at, e.seq`,
          [organizationIds],
        )
      ).map(toRecord);
      return orgs.map((o) => ({
        id: o.id,
        name: o.name,
        events: events
          .filter((e) => e.organizationId === o.id)
          .map((e) => ({
            id: e.id,
            name: e.config.event.name,
            isDemo: e.config.event.isDemo,
            firstDay: e.config.days[0]?.date ?? null,
            raceCount: e.config.races.length,
            categoryCount: e.config.categories.filter((c) => c.status !== 'archived').length,
            publishedVersion: e.publishedVersion,
            hasUnpublishedChanges: e.publishedRevision !== e.revision,
          })),
      }));
    },

    /** Every published event with its latest published configuration, in the order organizations and events were created. */
    async listPublished(): Promise<{ id: string; organizationName: string; config: EventConfig; cancellation: PublicEventSummary['cancellation'] }[]> {
      const rows = await db.all<{ id: string; organization_name: string; config_json: unknown; cancellation_scopes: { scope: CancellationSelection['scope'] }[] }>(
        `SELECT e.id, o.name AS organization_name, v.config_json,
         COALESCE((SELECT jsonb_agg(jsonb_build_object('scope',c.selection_json->>'scope')) FROM cancellation_executions c WHERE c.event_id=e.id),'[]'::jsonb) AS cancellation_scopes
         FROM events e
         JOIN organizations o ON o.id = e.organization_id
         JOIN event_versions v ON v.event_id = e.id AND v.version = e.published_version
         ORDER BY o.created_at, o.seq, e.created_at, e.seq`,
      );
      return rows.map((r) => ({ id: r.id, organizationName: r.organization_name, config: eventConfigSchema.parse(r.config_json), cancellation: cancellationScopeState(r.cancellation_scopes) }));
    },

    async createOrganization(name: string, requestedId?: string) {
      const id = requestedId ?? newId('org');
      await db.run(`INSERT INTO organizations (id, name, created_at) VALUES ($1, $2, $3)`, [id, name, now()]);
      return { id, name };
    },

    async createEvent(organizationId: string, config: EventConfig, requestedId?: string): Promise<EventRecord> {
      const org = await db.get(`SELECT id FROM organizations WHERE id = $1`, [organizationId]);
      if (!org) throw new HttpError(404, 'Organization not found.');
      const parsed = eventConfigSchema.parse(config);
      const id = requestedId ?? newId('evt');
      const t = now();
      await db.run(`INSERT INTO events (id, organization_id, draft_json, revision, created_at, updated_at) VALUES ($1, $2, $3, 1, $4, $5)`, [
        id,
        organizationId,
        JSON.stringify(parsed),
        t,
        t,
      ]);
      return requireEvent(id);
    },

    getEvent: requireEvent,
    entries,

    /**
     * The latest published configuration, which is what riders, start lists, and waitlists use.
     * Refuses with 409 when the event has never been published; `message` replaces the default wording.
     */
    async getPublished(
      eventId: string,
      message = 'Registration is not open: this event has no published version yet.',
    ): Promise<{ config: EventConfig; version: number; organizationName: string }> {
      const row = await db.get<{ organization_name: string; published_version: number | null; config_json: unknown }>(
        `SELECT o.name AS organization_name, e.published_version, v.config_json FROM events e
         JOIN organizations o ON o.id = e.organization_id
         LEFT JOIN event_versions v ON v.event_id = e.id AND v.version = e.published_version
         WHERE e.id = $1`,
        [eventId],
      );
      if (!row) throw new HttpError(404, 'Event not found.');
      if (!row.published_version) throw new HttpError(409, message);
      return { config: eventConfigSchema.parse(row.config_json), version: row.published_version, organizationName: row.organization_name };
    },

    /**
     * The capacity reference of an order's rider: the rider key's when the organizer linked the
     * order to others (see `entriesSql`), otherwise the order's own.
     */
    async riderRef(orderId: string): Promise<string> {
      const link = await db.get<{ rider_key: string }>(`SELECT rider_key FROM rider_links WHERE order_id = $1`, [orderId]);
      return `rider-${link?.rider_key ?? orderId}`;
    },

    /** Bib scope and ranges for check-in and start lists; the defaults until the organizer saves some. */
    async bibSettings(eventId: string): Promise<BibSettings> {
      const row = await db.get<{ settings_json: unknown }>(`SELECT settings_json FROM bib_settings WHERE event_id = $1`, [eventId]);
      return row ? bibSettingsSchema.parse(row.settings_json) : DEFAULT_BIB_SETTINGS;
    },

    /**
     * Save the draft with optimistic concurrency. Holds the event lock so a cap
     * change and a concurrent entry cannot interleave.
     */
    async saveDraft(id: string, expectedRevision: number, config: EventConfig): Promise<EventRecord> {
      const parsed = eventConfigSchema.parse(config);
      return db.transaction(async () => {
        await db.lock(eventLock(id));
        const current = await requireEvent(id);
        if (current.revision !== expectedRevision) {
          throw new HttpError(409, 'This event was changed somewhere else. Reload to see the latest version before saving again.', {
            currentRevision: current.revision,
          });
        }
        assertSafeForEntries(parsed, await entries(id));
        await requireCancellationPlacementUnchanged(db, id, parsed);
        await db.run(`UPDATE events SET draft_json = $1, revision = revision + 1, updated_at = $2 WHERE id = $3`, [JSON.stringify(parsed), now(), id]);
        return requireEvent(id);
      });
    },

    async publish(id: string, acknowledgeWarnings: boolean): Promise<{ version: number; issues: Issue[] }> {
      return db.transaction(async () => {
        await db.lock(eventLock(id));
        const current = await requireEvent(id);
        await requireCancellationPlacementUnchanged(db, id, current.config);
        const issues = validateConfig(current.config, await entries(id));
        const { errors, warnings } = countIssues(issues);
        if (errors > 0) throw new HttpError(422, `Fix ${errors} ${errors === 1 ? 'error' : 'errors'} before publishing.`, issues);
        if (warnings > 0 && !acknowledgeWarnings) throw new HttpError(422, `Review and acknowledge ${warnings} ${warnings === 1 ? 'warning' : 'warnings'} before publishing.`, issues);
        await requireWaiverVersionKeepsItsText(id, current.config);
        const version = (current.publishedVersion ?? 0) + 1;
        await db.run(
          `INSERT INTO event_versions (event_id, version, config_json, draft_revision, warnings_acknowledged, published_at) VALUES ($1, $2, $3, $4, $5, $6)`,
          [id, version, JSON.stringify(current.config), current.revision, warnings, now()],
        );
        await db.run(`UPDATE events SET published_version = $1, published_revision = $2 WHERE id = $3`, [version, current.revision, id]);
        return { version, issues };
      });
    },

    async listVersions(id: string) {
      await requireEvent(id);
      const rows = await db.all<{ version: number; published_at: string; draft_revision: number; warnings_acknowledged: number }>(
        `SELECT version, published_at, draft_revision, warnings_acknowledged FROM event_versions WHERE event_id = $1 ORDER BY version DESC`,
        [id],
      );
      return rows.map((v) => ({ version: v.version, publishedAt: v.published_at, draftRevision: v.draft_revision, warningsAcknowledged: v.warnings_acknowledged }));
    },

    async getVersion(id: string, version: number): Promise<EventConfig> {
      const row = await db.get<{ config_json: unknown }>(`SELECT config_json FROM event_versions WHERE event_id = $1 AND version = $2`, [id, version]);
      if (!row) throw new HttpError(404, 'Version not found.');
      return eventConfigSchema.parse(row.config_json);
    },

    /** Several published versions of one event in one query. Throws like getVersion if any is missing. */
    async getVersions(id: string, versions: readonly number[]): Promise<Map<number, EventConfig>> {
      const wanted = [...new Set(versions)];
      const rows = await db.all<{ version: number; config_json: unknown }>(`SELECT version, config_json FROM event_versions WHERE event_id = $1 AND version = ANY($2)`, [id, wanted]);
      if (rows.length !== wanted.length) throw new HttpError(404, 'Version not found.');
      return new Map(rows.map((r) => [r.version, eventConfigSchema.parse(r.config_json)]));
    },

    /**
     * Add simulated entries one at a time. The event lock is held while the
     * configuration and every existing entry are reread, so concurrent requests
     * cannot oversell a shared limit.
     */
    async addTestEntries(eventId: string, categoryId: string, count: number, riderRefs?: string[]) {
      return db.transaction(async () => {
        await db.lock(eventLock(eventId));
        const { config } = await requireEvent(eventId);
        await requireCancellationOpen(db, eventId, config, [categoryId]);
        const current = await entries(eventId);
        let created = 0;
        let blockedBy: LimitUsage | null = null;
        let reason: string | null = null;
        for (let i = 0; i < count; i++) {
          const riderRef = riderRefs?.[i] ?? `test-rider-${newId('r').slice(2)}`;
          const decision = canAdmit(config, current, categoryId, riderRef);
          if (!decision.ok) {
            reason = decision.reason;
            if (decision.reason === 'full') blockedBy = decision.blockedBy;
            break;
          }
          const entry = { id: newId('ent'), categoryId, riderRef };
          await db.run(`INSERT INTO test_entries (id, event_id, category_id, rider_ref, created_at) VALUES ($1, $2, $3, $4, $5)`, [entry.id, eventId, categoryId, riderRef, now()]);
          current.push(entry);
          created++;
        }
        return { requested: count, created, reason, blockedBy };
      });
    },

    async clearTestEntries(eventId: string) {
      return db.transaction(async () => {
        await db.lock(eventLock(eventId));
        await requireEvent(eventId);
        return db.run(`DELETE FROM test_entries WHERE event_id = $1`, [eventId]);
      });
    },
  };
}

export type Repo = ReturnType<typeof createRepo>;
