import { bibScopeKey, bibSettingsSchema, DEFAULT_BIB_SETTINGS, type BibSettings } from '../shared/checkin';
import { newId } from '../shared/factory';
import { formatLength } from '../shared/format';
import type { EventConfig } from '../shared/schema';
import { diffRows, sortRows, toCsv, type StartListRow } from '../shared/startlist';
import type { Db } from './db';
import type { Identity } from './identity';
import type { Orders } from './orders';
import { eventLock, HttpError, type Repo } from './repo';

/**
 * Start lists per race from confirmed entries, with timestamped snapshots and a
 * sample CSV for the timer. Test entries are never exported (product.md 1a):
 * they live in their own table and are not orders, so they never appear here.
 */
export function createStartLists(db: Db, repo: Repo, orders: Orders, clock: () => Date, identity: Identity) {
  const nowIso = () => clock().toISOString();

  async function published(eventId: string): Promise<{ config: EventConfig; version: number }> {
    const record = await repo.getEvent(eventId);
    if (!record.publishedVersion) throw new HttpError(409, 'Publish the event first. Start lists come from the published schedule.');
    return { config: await repo.getVersion(eventId, record.publishedVersion), version: record.publishedVersion };
  }

  async function bibSettings(eventId: string): Promise<BibSettings> {
    const row = await db.get<{ settings_json: unknown }>(`SELECT settings_json FROM bib_settings WHERE event_id = $1`, [eventId]);
    return row ? bibSettingsSchema.parse(row.settings_json) : DEFAULT_BIB_SETTINGS;
  }

  function requireRace(config: EventConfig, raceId: string) {
    const race = config.races.find((r) => r.id === raceId);
    if (!race) throw new HttpError(404, 'That race is not part of the published schedule.');
    return race;
  }

  /** Current rows for one race: confirmed orders only; released or cancelled entries drop out. */
  async function currentRows(eventId: string, raceId: string): Promise<StartListRow[]> {
    const { config } = await published(eventId);
    const race = requireRace(config, raceId);
    const day = config.days.find((d) => d.id === race.dayId);
    const scope = bibScopeKey(await bibSettings(eventId), race.dayId);
    const bibOf = async (orderId: string) =>
      (await db.get<{ bib: number }>(`SELECT bib FROM bib_assignments WHERE event_id = $1 AND scope = $2 AND order_id = $3 AND released_at IS NULL`, [eventId, scope, orderId]))?.bib ?? null;
    const checkedIn = async (orderId: string) =>
      ((await db.get<{ n: number }>(`SELECT COUNT(*)::int AS n FROM check_ins WHERE order_id = $1 AND day_id = $2`, [orderId, race.dayId]))?.n ?? 0) > 0;
    const rows: StartListRow[] = [];
    const riderKey = await identity.keyOf(eventId); // linked orders are one rider: same rider ID, bib, and check-in
    for (const o of await orders.listOrders(eventId)) {
      if (o.status !== 'confirmed') continue;
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
          bib: await bibOf(riderKey(o.id)),
          firstName: o.rider.firstName,
          lastName: o.rider.lastName,
          team: o.rider.team,
          licenseNumber: o.rider.licenseNumber ?? '',
          racingAge: o.rider.racingAge,
          competitionClass: o.rider.competitionClass ?? '',
          licenseStatus: e.licenseReviewed ? 'reviewed' : 'needs_review',
          checkedIn: await checkedIn(riderKey(o.id)),
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

  function slug(s: string) {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'race';
  }

  return {
    /** Every race with its current rows, the latest snapshot, and what changed since it. */
    async overview(eventId: string) {
      const { config, version } = await published(eventId);
      const races = [];
      for (const race of config.races) {
        const rows = await currentRows(eventId, race.id);
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
        const snap = await this.snapshot(eventId, raceId);
        const t = nowIso();
        await db.run(`INSERT INTO start_list_locks (id, event_id, race_id, snapshot_version, locked_at) VALUES ($1, $2, $3, $4, $5)`, [newId('lock'), eventId, raceId, snap.version, t]);
        return { ...snap, lockedAt: t };
      });
    },

    async snapshot(eventId: string, raceId: string) {
      const { config, version } = await published(eventId);
      requireRace(config, raceId);
      return db.transaction(async () => {
        await db.lock(eventLock(eventId));
        const rows = await currentRows(eventId, raceId);
        const max = await db.get<{ v: number | null }>(`SELECT MAX(version) AS v FROM start_list_snapshots WHERE event_id = $1 AND race_id = $2`, [eventId, raceId]);
        const next = (max?.v ?? 0) + 1;
        await db.run(`INSERT INTO start_list_snapshots (id, event_id, race_id, version, published_version, rows_json, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)`, [
          newId('sls'),
          eventId,
          raceId,
          next,
          version,
          JSON.stringify(rows),
          nowIso(),
        ]);
        return { version: next, riders: rows.length };
      });
    },

    /** CSV for one race, current or a saved snapshot. All races in one file when raceId is "all". */
    async csv(eventId: string, raceId: string, snapshotVersion: number | null): Promise<{ filename: string; body: string }> {
      const { config } = await published(eventId);
      if (raceId === 'all') {
        if (snapshotVersion !== null) throw new HttpError(400, 'Snapshots are saved per race. Download a race to get a snapshot.');
        const rows: StartListRow[] = [];
        for (const r of config.races) rows.push(...(await currentRows(eventId, r.id)));
        return { filename: `${slug(config.event.name)}-all-races-SAMPLE.csv`, body: toCsv(rows) };
      }
      const race = requireRace(config, raceId);
      let rows: StartListRow[];
      let suffix = 'current';
      if (snapshotVersion === null) rows = await currentRows(eventId, raceId);
      else {
        const snap = (await snapRows(eventId, raceId)).find((s) => s.version === snapshotVersion);
        if (!snap) throw new HttpError(404, 'That snapshot does not exist.');
        rows = snap.rows_json;
        suffix = `v${snapshotVersion}`;
      }
      return { filename: `${slug(race.name)}-${suffix}-SAMPLE.csv`, body: toCsv(rows) };
    },
  };
}

export type StartLists = ReturnType<typeof createStartLists>;
