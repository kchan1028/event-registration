import { canAdmit, entryCountsByCategory, type LimitUsage } from '../shared/capacity';
import { newId } from '../shared/factory';
import { eventConfigSchema, type EventConfig, type TestEntry } from '../shared/schema';
import { countIssues, validateConfig, type Issue } from '../shared/validation';
import type { Db } from './db';

const now = () => new Date().toISOString();

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export interface EventRecord {
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
  draft_json: string;
  revision: number;
  published_version: number | null;
  published_revision: number | null;
  updated_at: string;
}

export function createRepo(db: Db, clock: () => Date = () => new Date()) {
  const getRow = db.prepare<[string], EventRow>(
    `SELECT e.*, o.name AS organization_name FROM events e JOIN organizations o ON o.id = e.organization_id WHERE e.id = ?`,
  );
  // Places taken: simulated test entries, confirmed registrations, and unexpired checkout holds.
  const entriesStmt = db.prepare<[string, string, string], { id: string; category_id: string; rider_ref: string }>(
    `SELECT id, category_id, rider_ref FROM test_entries WHERE event_id = ?
     UNION ALL
     SELECT oe.id, oe.category_id, oe.rider_ref FROM order_entries oe JOIN orders o ON o.id = oe.order_id
     WHERE oe.event_id = ? AND (oe.status = 'confirmed' OR (oe.status = 'held' AND o.hold_expires_at > ?))`,
  );
  const insertEntry = db.prepare(`INSERT INTO test_entries (id, event_id, category_id, rider_ref, created_at) VALUES (?, ?, ?, ?, ?)`);

  function toRecord(row: EventRow): EventRecord {
    return {
      id: row.id,
      organizationId: row.organization_id,
      organizationName: row.organization_name,
      revision: row.revision,
      publishedVersion: row.published_version,
      publishedRevision: row.published_revision,
      updatedAt: row.updated_at,
      config: eventConfigSchema.parse(JSON.parse(row.draft_json)),
    };
  }

  function requireEvent(id: string): EventRecord {
    const row = getRow.get(id);
    if (!row) throw new HttpError(404, 'Event not found.');
    return toRecord(row);
  }

  function entries(eventId: string): TestEntry[] {
    return entriesStmt.all(eventId, eventId, clock().toISOString()).map((r) => ({ id: r.id, categoryId: r.category_id, riderRef: r.rider_ref }));
  }

  /** Rules that protect existing entries; enforced on every save. */
  function assertSafeForEntries(config: EventConfig, current: TestEntry[]): void {
    const counts = entryCountsByCategory(current);
    for (const [categoryId, count] of Object.entries(counts)) {
      const cat = config.categories.find((c) => c.id === categoryId);
      if (!cat) throw new HttpError(409, `A category with ${count} entries cannot be deleted. Archive it instead so its history is kept.`);
    }
    const blocking = validateConfig(config, current).filter((i) => i.key.endsWith('.below-entries'));
    if (blocking.length > 0) throw new HttpError(409, blocking[0].message, blocking);
  }

  return {
    listOrganizations() {
      const orgs = db.prepare<[], { id: string; name: string; created_at: string }>(`SELECT * FROM organizations ORDER BY created_at`).all();
      const events = db
        .prepare<[], EventRow>(`SELECT e.*, o.name AS organization_name FROM events e JOIN organizations o ON o.id = e.organization_id ORDER BY e.created_at`)
        .all()
        .map(toRecord);
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

    createOrganization(name: string) {
      const id = newId('org');
      db.prepare(`INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)`).run(id, name, now());
      return { id, name };
    },

    createEvent(organizationId: string, config: EventConfig): EventRecord {
      const org = db.prepare(`SELECT id FROM organizations WHERE id = ?`).get(organizationId);
      if (!org) throw new HttpError(404, 'Organization not found.');
      const parsed = eventConfigSchema.parse(config);
      const id = newId('evt');
      const t = now();
      db.prepare(`INSERT INTO events (id, organization_id, draft_json, revision, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)`).run(
        id,
        organizationId,
        JSON.stringify(parsed),
        t,
        t,
      );
      return requireEvent(id);
    },

    getEvent: requireEvent,
    entries,

    /**
     * Save the draft with optimistic concurrency. Runs as an immediate
     * transaction so a cap change and a concurrent entry cannot interleave.
     */
    saveDraft(id: string, expectedRevision: number, config: EventConfig): EventRecord {
      const parsed = eventConfigSchema.parse(config);
      return db
        .transaction(() => {
          const current = requireEvent(id);
          if (current.revision !== expectedRevision) {
            throw new HttpError(409, 'This event was changed somewhere else. Reload to see the latest version before saving again.', {
              currentRevision: current.revision,
            });
          }
          assertSafeForEntries(parsed, entries(id));
          db.prepare(`UPDATE events SET draft_json = ?, revision = revision + 1, updated_at = ? WHERE id = ?`).run(JSON.stringify(parsed), now(), id);
          return requireEvent(id);
        })
        .immediate();
    },

    publish(id: string, acknowledgeWarnings: boolean): { version: number; issues: Issue[] } {
      return db
        .transaction(() => {
          const current = requireEvent(id);
          const issues = validateConfig(current.config, entries(id));
          const { errors, warnings } = countIssues(issues);
          if (errors > 0) throw new HttpError(422, `Fix ${errors} ${errors === 1 ? 'error' : 'errors'} before publishing.`, issues);
          if (warnings > 0 && !acknowledgeWarnings) throw new HttpError(422, `Review and acknowledge ${warnings} ${warnings === 1 ? 'warning' : 'warnings'} before publishing.`, issues);
          const version = (current.publishedVersion ?? 0) + 1;
          db.prepare(
            `INSERT INTO event_versions (event_id, version, config_json, draft_revision, warnings_acknowledged, published_at) VALUES (?, ?, ?, ?, ?, ?)`,
          ).run(id, version, JSON.stringify(current.config), current.revision, warnings, now());
          db.prepare(`UPDATE events SET published_version = ?, published_revision = ? WHERE id = ?`).run(version, current.revision, id);
          return { version, issues };
        })
        .immediate();
    },

    listVersions(id: string) {
      requireEvent(id);
      return db
        .prepare<[string], { version: number; published_at: string; draft_revision: number; warnings_acknowledged: number }>(
          `SELECT version, published_at, draft_revision, warnings_acknowledged FROM event_versions WHERE event_id = ? ORDER BY version DESC`,
        )
        .all(id)
        .map((v) => ({ version: v.version, publishedAt: v.published_at, draftRevision: v.draft_revision, warningsAcknowledged: v.warnings_acknowledged }));
    },

    getVersion(id: string, version: number): EventConfig {
      const row = db.prepare<[string, number], { config_json: string }>(`SELECT config_json FROM event_versions WHERE event_id = ? AND version = ?`).get(id, version);
      if (!row) throw new HttpError(404, 'Version not found.');
      return eventConfigSchema.parse(JSON.parse(row.config_json));
    },

    /**
     * Add simulated entries one at a time. Each insert happens inside one
     * immediate transaction that rereads the configuration and every existing
     * entry, so concurrent requests cannot oversell a shared limit.
     */
    addTestEntries(eventId: string, categoryId: string, count: number, riderRefs?: string[]) {
      return db
        .transaction(() => {
          const { config } = requireEvent(eventId);
          const current = entries(eventId);
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
            insertEntry.run(entry.id, eventId, categoryId, riderRef, now());
            current.push(entry);
            created++;
          }
          return { requested: count, created, reason, blockedBy };
        })
        .immediate();
    },

    clearTestEntries(eventId: string) {
      requireEvent(eventId);
      return db.prepare(`DELETE FROM test_entries WHERE event_id = ?`).run(eventId).changes;
    },
  };
}

export type Repo = ReturnType<typeof createRepo>;
