import { randomBytes } from 'node:crypto';
import { canAdmit } from '../shared/capacity';
import { checkSelection, localNow, profileOf } from '../shared/checkout';
import { newId } from '../shared/factory';
import type { EventConfig } from '../shared/schema';
import { blocksPublicSale, effectiveWaitlistStatus, OFFER_HOURS, waitlistJoinSchema, type StoredWaitlistStatus, type WaitlistJoin, type WaitlistStatus } from '../shared/waitlist';
import type { Db } from './db';
import { eventLock, HttpError, type Repo } from './repo';

/**
 * Organizer-managed waitlists. Riders join a full category that has a waitlist;
 * the organizer offers places in order; an offer reserves the place for
 * OFFER_HOURS and is redeemed through a private link at checkout. No email is
 * sent: the organizer copies the link to the rider. Policy is in shared/waitlist.ts.
 */

interface Row {
  id: string;
  event_id: string;
  category_id: string;
  rider_json: WaitlistJoin;
  status: StoredWaitlistStatus;
  offer_token: string | null;
  offered_at: string | null;
  offer_expires_at: string | null;
  order_id: string | null;
  created_at: string;
  account_id: string | null;
}

export function createWaitlist(db: Db, repo: Repo, clock: () => Date) {
  const nowIso = () => clock().toISOString();
  const byId = (id: string, eventId: string) => db.get<Row>(`SELECT * FROM waitlist_entries WHERE id = $1 AND event_id = $2`, [id, eventId]);
  const byCategory = (eventId: string, categoryId: string) =>
    db.all<Row>(`SELECT * FROM waitlist_entries WHERE event_id = $1 AND category_id = $2 ORDER BY created_at, seq`, [eventId, categoryId]);

  const published = async (eventId: string): Promise<EventConfig> => (await repo.getPublished(eventId)).config;

  function status(r: Row): WaitlistStatus {
    return effectiveWaitlistStatus(r.status, r.offer_expires_at, nowIso());
  }

  /**
   * Position among riders still in line (waiting or holding a live offer), 1-based; null once out of line.
   * `sameCategory` is the category's rows, oldest first.
   */
  function position(r: Row, sameCategory: Row[]): number | null {
    const i = sameCategory.filter((x) => blocksPublicSale(status(x))).findIndex((x) => x.id === r.id);
    return i === -1 ? null : i + 1;
  }

  /** `sameCategory`: the category's rows when the caller already has them, so a list does not query once per row. */
  async function view(r: Row, sameCategory?: Row[]) {
    const rider = r.rider_json;
    return {
      id: r.id,
      categoryId: r.category_id,
      firstName: rider.firstName,
      lastName: rider.lastName,
      email: rider.email,
      racingAge: rider.racingAge,
      status: status(r),
      position: position(r, sameCategory ?? (await byCategory(r.event_id, r.category_id))),
      joinedAt: r.created_at,
      offeredAt: r.offered_at,
      offerExpiresAt: r.offer_expires_at,
      offerToken: status(r) === 'offered' ? r.offer_token : null,
      orderId: r.order_id,
    };
  }

  return {
    /** A rider joins the waitlist of a full category that has the waitlist turned on. */
    async join(eventId: string, input: unknown, accountId: string | null) {
      return db.transaction(async () => {
          await db.lock(eventLock(eventId));
          const config = await published(eventId);
          const body = waitlistJoinSchema.parse(input);
          const cat = config.categories.find((c) => c.id === body.categoryId);
          if (!cat || cat.status === 'archived') throw new HttpError(404, 'That category is no longer offered.');
          if (!cat.waitlistEnabled) throw new HttpError(409, `${cat.name} does not have a waitlist.`);

          const rows = await byCategory(eventId, cat.id);
          const inLine = rows.filter((r) => blocksPublicSale(status(r)));
          const full = !canAdmit(config, await repo.entries(eventId), cat.id, `waitlist-check-${newId('x')}`).ok;
          if (!full && inLine.length === 0) throw new HttpError(409, `${cat.name} still has places. Register for it instead of joining the waitlist.`);

          // Same eligibility and registration-window rules as checkout; capacity is the reason they are here.
          const check = checkSelection(config, [cat.id], profileOf(body), { nowLocal: localNow(config.event.timeZone, clock()) });
          if (!check.ok) throw new HttpError(422, check.problems[0], check.problems);

          const email = body.email.toLowerCase();
          const already = inLine.find((r) => r.rider_json.email.toLowerCase() === email);
          // The same rider joining again sees their place; another account using that email does not.
          if (already && already.account_id !== accountId) throw new HttpError(409, 'A rider with this email is already on the waitlist for this category.');
          if (already) return view(already);

          const id = newId('wl');
          const t = nowIso();
          await db.run(`INSERT INTO waitlist_entries (id, event_id, category_id, rider_json, status, created_at, updated_at, account_id) VALUES ($1, $2, $3, $4, 'waiting', $5, $6, $7)`, [
            id,
            eventId,
            cat.id,
            JSON.stringify(body),
            t,
            t,
            accountId,
          ]);
          return view((await byId(id, eventId))!);
      });
    },

    /** Every waitlist entry for the event, grouped by category, oldest first. */
    async list(eventId: string) {
      await repo.getEvent(eventId);
      const rows = await db.all<Row>(`SELECT * FROM waitlist_entries WHERE event_id = $1 ORDER BY created_at, seq`, [eventId]);
      const byCat = new Map<string, Row[]>();
      for (const r of rows) byCat.set(r.category_id, [...(byCat.get(r.category_id) ?? []), r]);
      const entries = [];
      for (const r of rows) entries.push(await view(r, byCat.get(r.category_id)));
      return { offerHours: OFFER_HOURS, entries };
    },

    /** Offer the rider a place. Needs a free place, which the offer then reserves for OFFER_HOURS. */
    async offer(eventId: string, entryId: string) {
      return db.transaction(async () => {
          await db.lock(eventLock(eventId));
          const config = await published(eventId);
          const row = await byId(entryId, eventId);
          if (!row) throw new HttpError(404, 'Waitlist entry not found.');
          if (status(row) !== 'waiting') throw new HttpError(409, 'Only a rider who is still waiting can be offered a place.');
          const name = config.categories.find((c) => c.id === row.category_id)?.name ?? 'This category';
          const room = canAdmit(config, await repo.entries(eventId), row.category_id, `waitlist-${row.id}`);
          if (!room.ok) throw new HttpError(409, `${name} has no free place to offer. Raise its limit or wait until a place frees up.`);
          const t = nowIso();
          const expires = new Date(clock().getTime() + OFFER_HOURS * 3_600_000).toISOString();
          await db.run(`UPDATE waitlist_entries SET status = 'offered', offer_token = $1, offered_at = $2, offer_expires_at = $3, updated_at = $4 WHERE id = $5`, [
            randomBytes(18).toString('base64url'),
            t,
            expires,
            t,
            row.id,
          ]);
          return view((await byId(row.id, eventId))!);
      });
    },

    /** Take a rider off the list (they found another race, or asked to be removed). An open offer is withdrawn. */
    async remove(eventId: string, entryId: string) {
      return db.transaction(async () => {
        // The event lock: a payment confirming this rider's offer cannot land between the check and the update.
        await db.lock(eventLock(eventId));
        const row = await byId(entryId, eventId);
        if (!row) throw new HttpError(404, 'Waitlist entry not found.');
        if (status(row) === 'accepted') throw new HttpError(409, 'This rider already registered from the waitlist.');
        await db.run(`UPDATE waitlist_entries SET status = 'removed', updated_at = $1 WHERE id = $2`, [nowIso(), row.id]);
        return view((await byId(row.id, eventId))!);
      });
    },

    /** What a rider sees when opening an offer link. Only the holder of the link can read it. */
    async offerByToken(token: string) {
      const row = await db.get<Row>(`SELECT * FROM waitlist_entries WHERE offer_token = $1`, [token]);
      if (!row) throw new HttpError(404, 'This waitlist offer was not found.');
      const config = await published(row.event_id);
      const rider = row.rider_json;
      return {
        eventId: row.event_id,
        categoryId: row.category_id,
        categoryName: config.categories.find((c) => c.id === row.category_id)?.name ?? 'Removed category',
        status: status(row),
        offerExpiresAt: row.offer_expires_at,
        rider,
      };
    },
  };
}

export type Waitlist = ReturnType<typeof createWaitlist>;
