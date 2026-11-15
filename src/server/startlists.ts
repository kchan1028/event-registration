import { bibScopeKey } from '../shared/checkin';
import { newId } from '../shared/factory';
import { formatLength } from '../shared/format';
import type { EventConfig } from '../shared/schema';
import { diffRows, sortRows, toCsv, type StartListRow } from '../shared/startlist';
import type { Db } from './db';
import type { Identity } from './identity';
import type { Orders } from './orders';
import { eventLock, HttpError, type Repo } from './repo';

/** A name as a lowercase file-name part: letters and digits joined by hyphens, at most 40 characters. */
export function slug(name: string, fallback: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || fallback;
}

/**
 * Start lists per race from confirmed entries, with timestamped snapshots and a
 * sample CSV for the timer. Test entries are never exported (product.md 1a):
 * they live in their own table and are not orders, so they never appear here.
 */
export function createStartLists(db: Db, repo: Repo, orders: Orders, clock: () => Date, identity: Identity) {
  const nowIso = () => clock().toISOString();
  const NOT_PUBLISHED = 'Publish the event first. Start lists come from the published schedule.';

  function requireRace(config: EventConfig, raceId: string) {
    const race = config.races.find((r) => r.id === raceId);
    if (!race) throw new HttpError(404, 'That race is not part of the published schedule.');
    return race;
  }

  /** Everything the rows of any race need, read once per request: the published schedule, bib settings, confirmed orders, bibs, and check-ins. */
  async function load(eventId: string) {
    const { config, version } = await repo.getPublished(eventId, NOT_PUBLISHED);
    const settings = await repo.bibSettings(eventId);
    const bibs = await db.all<{ order_id: string; bib: number; scope: string }>(`SELECT order_id, bib, scope FROM bib_assignments WHERE event_id = $1 AND released_at IS NULL`, [eventId]);
    const checkIns = await db.all<{ order_id: string; day_id: string }>(`SELECT order_id, day_id FROM check_ins WHERE event_id = $1`, [eventId]);
    const confirmed = (await orders.listOrders(eventId)).filter((o) => o.status === 'confirmed');
    const riderKey = await identity.keyOf(eventId); // linked orders are one rider: same rider ID, bib, and check-in
    return { config, version, settings, bibs, checkIns, confirmed, riderKey };
  }
  type Loaded = Awaited<ReturnType<typeof load>>;

  /** Current rows for one race: confirmed orders only; released or cancelled entries drop out. */
  function currentRows({ config, settings, bibs, checkIns, confirmed, riderKey }: Loaded, raceId: string): StartListRow[] {
    const race = requireRace(config, raceId);
    const day = config.days.find((d) => d.id === race.dayId);
    const scope = bibScopeKey(settings, race.dayId);
    const activeBibs = new Map(bibs.filter((r) => r.scope === scope).map((r) => [r.order_id, r.bib]));
    const checkedInIds = new Set(checkIns.filter((r) => r.day_id === race.dayId).map((r) => r.order_id));
    const rows: StartListRow[] = [];
    for (const o of confirmed) {
      for (const e of o.entries) {
        if (e.status !== 'confirmed') continue;
        const cat = config.categories.find((c) => c.id === e.categoryId);
        if (!cat || cat.raceId !== raceId) continue;
        const sg = config.startGroups.find((g) => g.id === cat.startGroupId);
        rows.push({
          entryId: e.id,
          riderId: riderKey(o.id),
          raceId,
          raceName: race.name,
          raceDate: day?.date ?? '',
          startGroup: sg?.name ?? '',
          startTime: sg?.startTime ?? null,
          classificationCode: cat.classifications[0]?.code || cat.timingCode || '',
          categoryName: cat.name,
          raceLength: formatLength(cat.length),
          bib: activeBibs.get(riderKey(o.id)) ?? null,
          firstName: o.rider.firstName,
          lastName: o.rider.lastName,
          team: o.rider.team,
          licenseNumber: o.rider.licenseNumber ?? '',
          racingAge: o.rider.racingAge,
          competitionClass: o.rider.competitionClass ?? '',
          licenseStatus: e.licenseReviewed ? 'reviewed' : 'needs_review',
          checkedIn: checkedInIds.has(riderKey(o.id)),
        });
      }
    }
    return sortRows(rows);
  }

  type SnapRow = { id: string; version: number; published_version: number; rows_json: StartListRow[]; created_at: string };
  const snapRows = (eventId: string, raceId: string) =>
    db.all<SnapRow>(`SELECT id, version, published_version, rows_json, created_at FROM start_list_snapshots WHERE event_id = $1 AND race_id = $2 ORDER BY version`, [eventId, raceId]);

  function snapshotSummaries(snaps: SnapRow[]) {
    return snaps.map((s, i) => {
      const rows = s.rows_json;
      const prev = i > 0 ? snaps[i - 1].rows_json : null;
      return { version: s.version, createdAt: s.created_at, publishedVersion: s.published_version, riders: rows.length, changesFromPrevious: prev ? diffRows(prev, rows) : null };
    });
  }

  /** The race's current lock: the most recent one, pointing at the snapshot that was sent. */
  async function currentLock(eventId: string, raceId: string): Promise<{ snapshotVersion: number; lockedAt: string } | null> {
    const row = await db.get<{ snapshot_version: number; locked_at: string }>(
      `SELECT snapshot_version, locked_at FROM start_list_locks WHERE event_id = $1 AND race_id = $2 ORDER BY locked_at DESC, seq DESC LIMIT 1`,
      [eventId, raceId],
    );
    return row ? { snapshotVersion: row.snapshot_version, lockedAt: row.locked_at } : null;
  }

  return {
    /** Every race with its current rows, the latest snapshot, and what changed since it. */
    async overview(eventId: string) {
      const loaded = await load(eventId);
      const { config, version } = loaded;
      const races = [];
      for (const race of config.races) {
        const rows = currentRows(loaded, race.id);
        const snaps = await snapRows(eventId, race.id);
        const last = snaps.at(-1);
        const lock = await currentLock(eventId, race.id);
        const lockedSnap = lock ? snaps.find((s) => s.version === lock.snapshotVersion) : undefined;
        races.push({
          /** Locked list sent to the timer; later changes are revisions against it, never blocked. */
          lock,
          changesSinceLock: lockedSnap ? diffRows(lockedSnap.rows_json, rows) : null,
          raceId: race.id,
          raceName: race.name,
          date: config.days.find((d) => d.id === race.dayId)?.date ?? '',
          rows,
          snapshots: snapshotSummaries(snaps).reverse(),
          changesSinceLastSnapshot: last ? diffRows(last.rows_json, rows) : null,
        });
      }
      return {
        eventId,
        eventName: config.event.name,
        isDemo: config.event.isDemo,
        publishedVersion: version,
        races,
      };
    },

    /** Lock a race's start list: save a snapshot of the current list and record the lock against it. */
    async lock(eventId: string, raceId: string) {
      return db.transaction(async () => {
        await db.lock(eventLock(eventId));
        const snap = await this.snapshot(eventId, raceId, null);
        const t = nowIso();
        await db.run(`INSERT INTO start_list_locks (id, event_id, race_id, snapshot_version, locked_at) VALUES ($1, $2, $3, $4, $5)`, [newId('lock'), eventId, raceId, snap.version, t]);
        return { ...snap, lockedAt: t };
      });
    },

    async snapshot(eventId: string, raceId: string, reassignmentId: string | null) {
      return db.transaction(async () => {
        await db.lock(eventLock(eventId));
        const loaded = await load(eventId);
        const { version } = loaded;
        const rows = currentRows(loaded, raceId);
        const max = await db.get<{ v: number | null }>(`SELECT MAX(version) AS v FROM start_list_snapshots WHERE event_id = $1 AND race_id = $2`, [eventId, raceId]);
        const next = (max?.v ?? 0) + 1;
        await db.run(`INSERT INTO start_list_snapshots (id, event_id, race_id, version, published_version, rows_json, created_at, reassignment_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [
          newId('sls'),
          eventId,
          raceId,
          next,
          version,
          JSON.stringify(rows),
          nowIso(),
          reassignmentId,
        ]);
        return { version: next, riders: rows.length };
      });
    },

    /** CSV for one race, current or a saved snapshot. All races in one file when raceId is "all". */
    async csv(eventId: string, raceId: string, snapshotVersion: number | null): Promise<{ filename: string; body: string }> {
      if (snapshotVersion !== null) {
        if (raceId === 'all') throw new HttpError(400, 'Snapshots are saved per race. Download a race to get a snapshot.');
        const race = requireRace((await repo.getPublished(eventId, NOT_PUBLISHED)).config, raceId);
        const snap = (await snapRows(eventId, raceId)).find((s) => s.version === snapshotVersion);
        if (!snap) throw new HttpError(404, 'That snapshot does not exist.');
        return { filename: `${slug(race.name, 'race')}-v${snapshotVersion}-SAMPLE.csv`, body: toCsv(snap.rows_json) };
      }
      const loaded = await load(eventId);
      if (raceId === 'all') {
        const rows = loaded.config.races.flatMap((r) => currentRows(loaded, r.id));
        return { filename: `${slug(loaded.config.event.name, 'race')}-all-races-SAMPLE.csv`, body: toCsv(rows) };
      }
      const race = requireRace(loaded.config, raceId);
      return { filename: `${slug(race.name, 'race')}-current-SAMPLE.csv`, body: toCsv(currentRows(loaded, raceId)) };
    },
  };
}

export type StartLists = ReturnType<typeof createStartLists>;
