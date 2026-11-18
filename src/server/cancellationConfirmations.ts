import { priorCancellationRefusal, recordCancellationRefusal, type CancellationOutcome } from './cancellationRefusals';
import { createHash } from 'node:crypto';
import { newId } from '../shared/factory';
import { CANCELLATION_IMPACT_CHANGED, CANCELLATION_PLAN_NOT_RECORDED, cancellationSelectionSchema, type CancellationConfirmation, type CancellationConfirmationInput, type CancellationConfirmationPreview, type CancellationImpactPreview, type CancellationSelection } from '../shared/cancellations';
import type { Db } from './db';
import type { createCancellationImpact } from './cancellationImpact';
import { eventLock, HttpError } from './repo';

type Row = { id: string; event_id: string; client_request_id: string; confirmed_by: string; confirmed_at: string; reason: string; selection_json: CancellationSelection; preview_fingerprint: string; preview_json: CancellationImpactPreview };

function fingerprint(preview: CancellationImpactPreview, reconciliation: unknown) {
  // Assessment times change on every read; state/expiry effects remain in the snapshot.
  const { generatedAt: _time, ...state } = preview;
  const { generatedAt: _financialTime, ...financial } = preview.financial;
  return createHash('sha256').update(JSON.stringify({ formatVersion: 1, ...state, financial, reconciliation })).digest('hex');
}

function view(row: Row): CancellationConfirmation {
  return { id: row.id, eventId: row.event_id, clientRequestId: row.client_request_id, status: 'plan_confirmed', selection: row.selection_json,
    reason: row.reason, confirmedBy: row.confirmed_by, confirmedAt: row.confirmed_at, previewFingerprint: row.preview_fingerprint,
    preview: row.preview_json, acknowledgedPlanOnly: true, executionAvailable: false };
}

/** Append-only plan evidence through these routes. These routes do not execute; the separate simulation executor performs fresh checks. */
export function createCancellationConfirmations(db: Db, impact: ReturnType<typeof createCancellationImpact>, clock: () => Date) {
  async function prepare(eventId: string, selection: CancellationSelection): Promise<CancellationConfirmationPreview> {
    selection = cancellationSelectionSchema.parse(selection);
    return db.transaction(async () => {
      await db.lock(eventLock(eventId));
      const preview = await impact.preview(eventId, selection);
      const orderIds = [...new Set(preview.entries.map((e) => e.orderId))];
      // Guard financial changes even when the displayed nominal allocation stays the same.
      // References, contacts and provider payloads never enter this hash input or response.
      const reconciliation = orderIds.length ? await db.all(`
        SELECT 'attempt' AS kind,p.id,jsonb_build_array(p.order_id,p.outcome,p.result_status,p.amount_cents) AS state
          FROM payment_attempts p JOIN orders o ON o.id=p.order_id WHERE o.event_id=$1 AND p.order_id=ANY($2)
        UNION ALL SELECT 'session',p.id,jsonb_build_array(p.order_id,p.status,p.amount_cents,p.expires_at,p.expires_at > $3::timestamptz)
          FROM payment_sessions p JOIN orders o ON o.id=p.order_id WHERE o.event_id=$1 AND p.order_id=ANY($2)
        UNION ALL SELECT 'refund',p.id,jsonb_build_array(p.order_id,p.entry_id,p.status,p.amount_cents)
          FROM refunds p JOIN orders o ON o.id=p.order_id WHERE o.event_id=$1 AND p.order_id=ANY($2)
        ORDER BY kind,id`, [eventId, orderIds, preview.generatedAt]) : [];
      return { fingerprint: fingerprint(preview, reconciliation), preview, executionAvailable: false };
    });
  }
  return {
    preview: prepare,
    async confirm(eventId: string, actorId: string, input: CancellationConfirmationInput): Promise<CancellationConfirmation> {
      const outcome = await db.transaction(async (): Promise<CancellationOutcome<CancellationConfirmation>> => {
        await db.lock(eventLock(eventId));
        const existing = await db.get<Row>(`SELECT * FROM cancellation_confirmations WHERE event_id=$1 AND client_request_id=$2`, [eventId, input.clientRequestId]);
        if (existing) {
          if (existing.preview_fingerprint !== input.previewFingerprint || existing.reason !== input.reason || JSON.stringify(cancellationSelectionSchema.parse(existing.selection_json)) !== JSON.stringify(input.selection)) throw new HttpError(409, 'That confirmation request was already used with different details.');
          return { value: view(existing) };
        }
        const prior = await priorCancellationRefusal(db, eventId, 'plan', input.clientRequestId, input);
        if (prior) return { refusal: prior };
        let current: CancellationConfirmationPreview;
        try {
          current = await prepare(eventId, input.selection);
          if (current.fingerprint !== input.previewFingerprint) throw new HttpError(409, CANCELLATION_IMPACT_CHANGED);
        } catch (error) {
          if (error instanceof HttpError && [404, 409, 422].includes(error.status)) return { refusal: await recordCancellationRefusal(db, eventId, 'plan', input.clientRequestId, input, actorId, clock().toISOString(), error, CANCELLATION_PLAN_NOT_RECORDED) };
          throw error;
        }
        const row = await db.get<Row>(`INSERT INTO cancellation_confirmations(id,event_id,client_request_id,confirmed_by,confirmed_at,reason,selection_json,preview_fingerprint,preview_json,acknowledged_plan_only)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,true) RETURNING *`,
        [newId('ccf'), eventId, input.clientRequestId, actorId, clock().toISOString(), input.reason, JSON.stringify(input.selection), current.fingerprint, JSON.stringify(current.preview)]);
        return { value: view(row!) };
      });
      if ('refusal' in outcome) throw new HttpError(outcome.refusal.status, outcome.refusal.message, outcome.refusal.details);
      return outcome.value;
    },
    async get(eventId: string, id: string): Promise<CancellationConfirmation> {
      const row = await db.get<Row>(`SELECT * FROM cancellation_confirmations WHERE event_id=$1 AND id=$2`, [eventId, id]);
      if (!row) throw new HttpError(404, 'Cancellation plan confirmation not found.');
      return view(row);
    },
  };
}
