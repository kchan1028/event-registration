import { newId } from '../shared/factory';
import { todayIn } from '../shared/pricing';
import { refundPolicyEntitlement } from '../shared/refundPolicy';
import type { Quote } from '../shared/pricing';
import type { Db } from './db';
import { recordWithdrawalDeclineNotice } from './email';
import { paidLine, type Orders } from './orders';
import { eventLock, HttpError, type Repo } from './repo';

/**
 * Rider-requested entry changes (product.md "Rider self-service"). A rider asks to withdraw one paid entry, seeing
 * what the accepted refund policy would return, or to move it to another category, seeing the new price and the
 * difference. An organizer approves (the existing organizer withdrawal or transfer runs, with all its checks) or
 * declines with a reason. Nothing here charges or refunds: money stays a separate finance step.
 */

export type WithdrawalReturn = 'cash' | 'credit' | 'rider_choice';

/** A category the entry could move to now, with its price today and the difference from what was paid (owed if positive). */
export interface TransferOption {
  categoryId: string;
  categoryName: string;
  newPriceCents: number;
  differenceCents: number;
}

export interface WithdrawalPolicyPreview {
  entryId: string;
  categoryId: string;
  categoryName: string;
  amountPaidCents: number;
  onDate: string;
  /** Null when the order was sold without structured refund rules, and always null for a transfer request. */
  entitlement: { returnAs: WithdrawalReturn; percent: number; amountCents: number } | null;
  /** Set only for a transfer request: the target the rider saw. */
  transfer?: TransferOption;
}

export interface WithdrawalRequest {
  id: string;
  eventId: string;
  orderId: string;
  entryId: string;
  riderName: string;
  kind: 'withdraw' | 'transfer';
  reason: string;
  policy: WithdrawalPolicyPreview;
  status: 'open' | 'approved' | 'declined';
  decisionReason: string | null;
  createdAt: string;
  decidedAt: string | null;
}

interface EntryFacts {
  event_id: string;
  order_id: string;
  entry_status: string;
  order_status: string;
  category_id: string;
  original_category_id: string | null;
  published_version: number;
  quote_json: Quote;
}

interface Row {
  id: string; event_id: string; order_id: string; entry_id: string; category_id: string; client_request_id: string; reason: string;
  kind: WithdrawalRequest['kind']; to_category_id: string | null;
  policy_json: WithdrawalPolicyPreview; status: WithdrawalRequest['status']; decision_reason: string | null;
  created_at: string; decided_at: string | null; rider_name: string;
}

const SELECT = `SELECT w.*, concat_ws(' ', o.rider_json->>'firstName', o.rider_json->>'lastName') AS rider_name
  FROM withdrawal_requests w JOIN orders o ON o.id = w.order_id`;

const toView = (r: Row): WithdrawalRequest => ({
  id: r.id, eventId: r.event_id, orderId: r.order_id, entryId: r.entry_id, riderName: r.rider_name, kind: r.kind, reason: r.reason,
  policy: r.policy_json, status: r.status, decisionReason: r.decision_reason,
  createdAt: new Date(r.created_at).toISOString(), decidedAt: r.decided_at ? new Date(r.decided_at).toISOString() : null,
});

export function createWithdrawalRequests(db: Db, repo: Repo, orders: Orders, clock: () => Date, senderAddress?: string) {
  async function facts(entryId: string) {
    const e = await db.get<EntryFacts>(
      `SELECT o.event_id, e.order_id, e.status AS entry_status, o.status AS order_status, e.category_id, e.original_category_id,
              o.published_version, o.quote_json
       FROM order_entries e JOIN orders o ON o.id = e.order_id WHERE e.id = $1`, [entryId],
    );
    if (!e) throw new HttpError(404, 'Entry not found.');
    return e;
  }

  /** What the accepted policy would return for this one paid, active entry today. Read-only; reserves nothing. */
  async function preview(entryId: string): Promise<WithdrawalPolicyPreview> {
    const e = await facts(entryId);
    if (e.order_status !== 'confirmed' || e.entry_status !== 'confirmed') throw new HttpError(409, 'Only a paid, active entry can be withdrawn.');
    const config = await repo.getVersion(e.event_id, e.published_version);
    const amountPaidCents = paidLine(e.quote_json, e)?.totalCents ?? 0;
    const onDate = todayIn(config.event.timeZone, clock());
    const firstDay = config.days.map((d) => d.date).sort()[0];
    return {
      entryId,
      categoryId: e.category_id,
      // An organizer may have moved the entry into a category added after purchase, so fall back to the published version.
      categoryName: config.categories.find((c) => c.id === e.category_id)?.name
        ?? (await repo.getPublished(e.event_id)).config.categories.find((c) => c.id === e.category_id)?.name
        ?? 'This entry',
      amountPaidCents,
      onDate,
      entitlement: refundPolicyEntitlement(config.registration.refundRules, firstDay, onDate, amountPaidCents, 'withdrawal'),
    };
  }

  async function one(id: string) {
    const row = await db.get<Row>(`${SELECT} WHERE w.id = $1`, [id]);
    if (!row) throw new HttpError(404, 'Withdrawal request not found.');
    return row;
  }

  return {
    preview,

    /** The open request for an entry, if any, so the rider sees it is waiting. */
    async openFor(entryId: string): Promise<WithdrawalRequest | null> {
      const row = await db.get<Row>(`${SELECT} WHERE w.entry_id = $1 AND w.status = 'open'`, [entryId]);
      return row ? toView(row) : null;
    },

    /** A rider asks to withdraw a paid, active entry. One open request per entry; an exact retry returns the same request. */
    async request(
      entryId: string,
      accountId: string,
      body: { clientRequestId: string; reason: string; expectedCategoryId: string; expectedReturnAs: WithdrawalReturn | null; expectedAmountCents: number | null },
    ): Promise<WithdrawalRequest> {
      return db.transaction(async () => {
        const { event_id } = await facts(entryId);
        await db.lock(eventLock(event_id));
        const same = await db.get<Row>(`${SELECT} WHERE w.entry_id = $1 AND w.client_request_id = $2`, [entryId, body.clientRequestId]);
        if (same) {
          // An exact retry only: the same reason and the terms the rider saw.
          if (same.reason !== body.reason || same.kind !== 'withdraw' || same.policy_json.categoryId !== body.expectedCategoryId
            || (same.policy_json.entitlement?.returnAs ?? null) !== body.expectedReturnAs || (same.policy_json.entitlement?.amountCents ?? null) !== body.expectedAmountCents) {
            throw new HttpError(409, 'This request id was already used for a different request.');
          }
          return toView(same);
        }
        const e = await facts(entryId);
        if (e.order_status !== 'confirmed' || e.entry_status !== 'confirmed') throw new HttpError(409, 'Only a paid, active entry can be withdrawn.');
        if (await db.get(`SELECT 1 FROM withdrawal_requests WHERE entry_id = $1 AND status = 'open'`, [entryId])) {
          throw new HttpError(409, 'A request for this entry is already waiting for the organizer.');
        }
        // The rider confirms the amount they were shown; if the policy step changed since (a deadline passed), they review it again.
        const policy = await preview(entryId);
        if (policy.categoryId !== body.expectedCategoryId) {
          throw new HttpError(409, 'This entry moved to another category since you looked. Review it and send your request again.');
        }
        if ((policy.entitlement?.returnAs ?? null) !== body.expectedReturnAs || (policy.entitlement?.amountCents ?? null) !== body.expectedAmountCents) {
          throw new HttpError(409, 'What withdrawing returns has changed since you looked. Review the new amount and send your request again.');
        }
        const id = newId('wdr');
        await db.run(
          `INSERT INTO withdrawal_requests (id, event_id, order_id, entry_id, category_id, requested_by, client_request_id, reason, policy_json, status, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'open', $10)`,
          [id, e.event_id, e.order_id, entryId, e.category_id, accountId, body.clientRequestId, body.reason, JSON.stringify(policy), clock().toISOString()],
        );
        return toView(await one(id));
      });
    },

    /** Categories this paid entry could move to now, each passing every organizer transfer check. Read-only. */
    async transferOptions(entryId: string): Promise<{ from: WithdrawalPolicyPreview; options: TransferOption[] }> {
      const from = { ...(await preview(entryId)), entitlement: null };
      const { config } = await repo.getPublished((await facts(entryId)).event_id);
      const options: TransferOption[] = [];
      for (const c of config.categories) {
        if (c.status !== 'active' || c.id === from.categoryId) continue;
        try {
          const check = await orders.transferCheck(entryId, c.id);
          options.push({ categoryId: c.id, categoryName: c.name, newPriceCents: check.newPrice, differenceCents: check.newPrice - check.paid });
        } catch (e) {
          if (!(e instanceof HttpError)) throw e;
        }
      }
      return { from, options };
    },

    /** A rider asks to move a paid entry to another category. The same rules as a withdrawal request apply, plus the target's checks. */
    async requestTransfer(
      entryId: string,
      accountId: string,
      body: { clientRequestId: string; reason: string; toCategoryId: string; expectedCategoryId: string; expectedNewPriceCents: number },
    ): Promise<WithdrawalRequest> {
      return db.transaction(async () => {
        const { event_id } = await facts(entryId);
        await db.lock(eventLock(event_id));
        const same = await db.get<Row>(`${SELECT} WHERE w.entry_id = $1 AND w.client_request_id = $2`, [entryId, body.clientRequestId]);
        if (same) {
          // An exact retry only: the same reason, target and the terms the rider saw.
          if (same.reason !== body.reason || same.kind !== 'transfer' || same.to_category_id !== body.toCategoryId
            || same.policy_json.categoryId !== body.expectedCategoryId || same.policy_json.transfer?.newPriceCents !== body.expectedNewPriceCents) {
            throw new HttpError(409, 'This request id was already used for a different request.');
          }
          return toView(same);
        }
        const from = { ...(await preview(entryId)), entitlement: null };
        if (await db.get(`SELECT 1 FROM withdrawal_requests WHERE entry_id = $1 AND status = 'open'`, [entryId])) {
          throw new HttpError(409, 'A request for this entry is already waiting for the organizer.');
        }
        if (from.categoryId !== body.expectedCategoryId) {
          throw new HttpError(409, 'This entry moved to another category since you looked. Review it and send your request again.');
        }
        const check = await orders.transferCheck(entryId, body.toCategoryId);
        if (check.newPrice !== body.expectedNewPriceCents) {
          throw new HttpError(409, `The price of ${check.target.name} has changed since you looked. Review it and send your request again.`);
        }
        const transfer: TransferOption = { categoryId: check.target.id, categoryName: check.target.name, newPriceCents: check.newPrice, differenceCents: check.newPrice - check.paid };
        const id = newId('wdr');
        await db.run(
          `INSERT INTO withdrawal_requests (id, event_id, order_id, entry_id, category_id, requested_by, client_request_id, reason, policy_json, status, created_at, kind, to_category_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'open', $10, 'transfer', $11)`,
          [id, check.e.event_id, check.e.order_id, entryId, from.categoryId, accountId, body.clientRequestId, body.reason, JSON.stringify({ ...from, transfer }), clock().toISOString(), check.target.id],
        );
        return toView(await one(id));
      });
    },

    async list(eventId: string): Promise<WithdrawalRequest[]> {
      const rows = await db.all<Row>(`${SELECT} WHERE w.event_id = $1 ORDER BY (w.status = 'open') DESC, w.created_at DESC, w.seq DESC`, [eventId]);
      return rows.map(toView);
    },

    /** The organizer withdraws or moves the entry through the existing organizer action, which records the change and the rider notice. */
    async approve(eventId: string, id: string, accountId: string): Promise<WithdrawalRequest> {
      return db.transaction(async () => {
        await db.lock(eventLock(eventId));
        const row = await one(id);
        if (row.event_id !== eventId) throw new HttpError(404, 'Withdrawal request not found.');
        if (row.status !== 'open') throw new HttpError(409, `This request was already ${row.status}.`);
        // The rider asked about one category; if the entry has since been transferred, they have not asked to leave the new one.
        if ((await facts(row.entry_id)).category_id !== row.category_id) {
          throw new HttpError(409, 'This entry moved to another category after the rider asked. Decline this request and check with the rider.');
        }
        // The existing organizer action rechecks everything; if the move is no longer possible, the request stays open.
        // The rider agreed to a price, so the transfer is refused if the price it records (worked out once, inside it) differs.
        if (row.kind === 'transfer') {
          await orders.transferEntry(row.entry_id, row.to_category_id!, `Rider request: ${row.reason}`.slice(0, 300), { expectedNewPriceCents: row.policy_json.transfer?.newPriceCents ?? -1 });
        }
        else await orders.withdrawEntry(row.entry_id, `Rider request: ${row.reason}`.slice(0, 300));
        const change = await db.get<{ id: string }>(
          `SELECT id FROM entry_changes WHERE entry_id = $1 AND kind = $2 ORDER BY seq DESC LIMIT 1`, [row.entry_id, row.kind],
        );
        await db.run(
          `UPDATE withdrawal_requests SET status = 'approved', decided_by = $2, decided_at = $3, entry_change_id = $4 WHERE id = $1`,
          [id, accountId, clock().toISOString(), change?.id ?? null],
        );
        return toView(await one(id));
      });
    },

    /** The organizer keeps the entry and says why. The entry, payment and readiness are unchanged. */
    async decline(eventId: string, id: string, accountId: string, reason: string): Promise<WithdrawalRequest> {
      return db.transaction(async () => {
        await db.lock(eventLock(eventId));
        const row = await one(id);
        if (row.event_id !== eventId) throw new HttpError(404, 'Withdrawal request not found.');
        if (row.status !== 'open') throw new HttpError(409, `This request was already ${row.status}.`);
        await db.run(
          `UPDATE withdrawal_requests SET status = 'declined', decided_by = $2, decided_at = $3, decision_reason = $4 WHERE id = $1`,
          [id, accountId, clock().toISOString(), reason],
        );
        await recordWithdrawalDeclineNotice(db, id, clock().toISOString(), senderAddress);
        return toView(await one(id));
      });
    },
  };
}

export type WithdrawalRequests = ReturnType<typeof createWithdrawalRequests>;
