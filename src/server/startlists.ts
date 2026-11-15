import { bibScopeKey, bibSettingsSchema, DEFAULT_BIB_SETTINGS, type BibSettings } from '../shared/checkin';
import { newId } from '../shared/factory';
import { formatLength } from '../shared/format';
import type { EventConfig } from '../shared/schema';
import { diffRows, sortRows, toCsv, type StartListRow } from '../shared/startlist';
import type { Db } from './db';
import type { Orders } from './orders';
import { HttpError, type Repo } from './repo';

/**
 * Start lists per race from confirmed entries, with timestamped snapshots and a
 * sample CSV for the timer. Test entries are never exported (product.md 1a):
 * they live in their own table and are not orders, so they never appear here.
 */
export function createStartLists(db: Db, repo: Repo, orders: Orders, clock: () => Date) {
  const nowIso = () => clock().toISOString();

  function published(eventId: string): { config: EventConfig; version: number } {
    const record = repo.getEvent(eventId);
    if (!record.publishedVersion) throw new HttpError(409, 'Publish the event first. Start lists come from the published schedule.');
    return { config: repo.getVersion(eventId, record.publishedVersion), version: record.publishedVersion };
  }

  function bibSettings(eventId: string): BibSettings {
    const row = db.prepare<[string], { settings_json: string }>(`SELECT settings_json FROM bib_settings WHERE event_id = ?`).get(eventId);
    return row ? bibSettingsSchema.parse(JSON.parse(row.settings_json)) : DEFAULT_BIB_SETTINGS;
  }

  function requireRace(config: EventConfig, raceId: string) {
    const race = config.races.find((r) => r.id === raceId);
    if (!race) throw new HttpError(404, 'That race is not part of the published schedule.');
    return race;
  }

  /** Current rows for one race: confirmed orders only; released or cancelled entries drop out. */
  function currentRows(eventId: string, raceId: string): StartListRow[] {
    const { config } = published(eventId);
    const race = requireRace(config, raceId);
    const day = config.days.find((d) => d.id === race.dayId);
    const scope = bibScopeKey(bibSettings(eventId), race.dayId);
    const bibOf = db.prepare<[string, string, string], { bib: number }>(`SELECT bib FROM bib_assignments WHERE event_id = ? AND scope = ? AND order_id = ? AND released_at IS NULL`);
    const checkedIn = db.prepare<[string, string], { n: number }>(`SELECT COUNT(*) AS n FROM check_ins WHERE order_id = ? AND day_id = ?`);
    const rows: StartListRow[] = [];
    for (const o of orders.listOrders(eventId)) {
      if (o.status !== 'confirmed') continue;
      for (const e of o.entries) {
        if (e.status !== 'confirmed') continue;
        const cat = config.categories.find((c) => c.id === e.categoryId);
        if (!cat || cat.raceId !== raceId) continue;
        const sg = config.startGroups.find((g) => g.id === cat.startGroupId);
        rows.push({
          entryId: e.id,
          riderId: o.id,
          raceId,
          raceName: race.name,
          raceDate: day?.date ?? '',
          startGroup: sg?.name ?? '',
          startTime: sg?.startTime ?? null,
          classificationCode: cat.classifications[0]?.code || cat.timingCode || '',
          categoryName: cat.name,
          raceLength: formatLength(cat.length),
          bib: bibOf.get(eventId, scope, o.id)?.bib ?? null,
          firstName: o.rider.firstName,
          lastName: o.rider.lastName,
          team: o.rider.team,
          licenseNumber: o.rider.licenseNumber ?? '',
          racingAge: o.rider.racingAge,
          competitionClass: o.rider.competitionClass ?? '',
          licenseStatus: e.licenseReviewed ? 'reviewed' : 'needs_review',
          checkedIn: (checkedIn.get(o.id, race.dayId)?.n ?? 0) > 0,
        });
      }
    }
    return sortRows(rows);
  }

  type SnapRow = { id: string; version: number; published_version: number; rows_json: string; created_at: string };
  const snapRows = (eventId: string, raceId: string) =>
    db.prepare<[string, string], SnapRow>(`SELECT id, version, published_version, rows_json, created_at FROM start_list_snapshots WHERE event_id = ? AND race_id = ? ORDER BY version`).all(eventId, raceId);

  function snapshotSummaries(eventId: string, raceId: string) {
    const snaps = snapRows(eventId, raceId);
    return snaps.map((s, i) => {
      const rows = JSON.parse(s.rows_json) as StartListRow[];
      const prev = i > 0 ? (JSON.parse(snaps[i - 1].rows_json) as StartListRow[]) : null;
      return { version: s.version, createdAt: s.created_at, publishedVersion: s.published_version, riders: rows.length, changesFromPrevious: prev ? diffRows(prev, rows) : null };
    });
  }

  function slug(s: string) {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'race';
  }

  return {
    /** Every race with its current rows, the latest snapshot, and what changed since it. */
    overview(eventId: string) {
      const { config, version } = published(eventId);
      return {
        eventId,
        eventName: config.event.name,
        isDemo: config.event.isDemo,
        publishedVersion: version,
        races: config.races.map((race) => {
          const rows = currentRows(eventId, race.id);
          const last = snapRows(eventId, race.id).at(-1);
          return {
            raceId: race.id,
            raceName: race.name,
            date: config.days.find((d) => d.id === race.dayId)?.date ?? '',
            rows,
            snapshots: snapshotSummaries(eventId, race.id).reverse(),
            changesSinceLastSnapshot: last ? diffRows(JSON.parse(last.rows_json) as StartListRow[], rows) : null,
          };
        }),
      };
    },

    snapshot(eventId: string, raceId: string) {
      const { config, version } = published(eventId);
      requireRace(config, raceId);
      return db
        .transaction(() => {
          const rows = currentRows(eventId, raceId);
          const next = (db.prepare<[string, string], { v: number | null }>(`SELECT MAX(version) AS v FROM start_list_snapshots WHERE event_id = ? AND race_id = ?`).get(eventId, raceId)?.v ?? 0) + 1;
          db.prepare(`INSERT INTO start_list_snapshots (id, event_id, race_id, version, published_version, rows_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
            newId('sls'),
            eventId,
            raceId,
            next,
            version,
            JSON.stringify(rows),
            nowIso(),
          );
          return { version: next, riders: rows.length };
        })
        .immediate();
    },

    /** CSV for one race, current or a saved snapshot. All races in one file when raceId is "all". */
    csv(eventId: string, raceId: string, snapshotVersion: number | null): { filename: string; body: string } {
      const { config } = published(eventId);
      if (raceId === 'all') {
        if (snapshotVersion !== null) throw new HttpError(400, 'Snapshots are saved per race. Download a race to get a snapshot.');
        const rows = config.races.flatMap((r) => currentRows(eventId, r.id));
        return { filename: `${slug(config.event.name)}-all-races-SAMPLE.csv`, body: toCsv(rows) };
      }
      const race = requireRace(config, raceId);
      let rows: StartListRow[];
      let suffix = 'current';
      if (snapshotVersion === null) rows = currentRows(eventId, raceId);
      else {
        const snap = snapRows(eventId, raceId).find((s) => s.version === snapshotVersion);
        if (!snap) throw new HttpError(404, 'That snapshot does not exist.');
        rows = JSON.parse(snap.rows_json) as StartListRow[];
        suffix = `v${snapshotVersion}`;
      }
      return { filename: `${slug(race.name)}-${suffix}-SAMPLE.csv`, body: toCsv(rows) };
    },
  };
}

export type StartLists = ReturnType<typeof createStartLists>;
