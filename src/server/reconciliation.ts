import { formatOrderNumber } from '../shared/lookup';
import { writeCsv } from '../shared/csv';
import type { Db } from './db';

const COLUMNS = ['generated_at', 'basis', 'order_id', 'order_number', 'order_status', 'order_total_cents', 'record_kind', 'record_id', 'provider', 'provider_reference', 'payment_reference', 'session_reference', 'entry_id', 'amount_cents', 'outcome', 'result_status', 'recorded_at', 'updated_at'] as const;
type RecordColumn = Exclude<typeof COLUMNS[number], 'generated_at' | 'basis' | 'order_number'>;

/** Local evidence, not settlement totals. Includes expired/cancelled orders and never infers missing amounts. */
export async function reconciliationCsv(db: Db, eventId: string, generatedAt: string, isDemo: boolean): Promise<string> {
  const rows = await db.all<Record<RecordColumn, string | number | null> & { order_id: string }>(`
    WITH event_orders AS (SELECT id, status, total_cents FROM orders WHERE event_id=$1),
    records AS (
      SELECT o.id AS order_id,o.status AS order_status,o.total_cents AS order_total_cents,
        'payment_attempt' AS record_kind,a.id AS record_id,a.provider,a.provider_ref AS provider_reference,
        a.provider_ref AS payment_reference,NULL::text AS session_reference,NULL::text AS entry_id,a.amount_cents,a.outcome,a.result_status,
        a.created_at AS recorded_at,NULL::timestamptz AS updated_at
      FROM event_orders o JOIN payment_attempts a ON a.order_id=o.id
      UNION ALL
      SELECT o.id,o.status,o.total_cents,'payment_session',s.id,s.provider,s.id,
        NULL::text,s.id,NULL::text,s.amount_cents,NULL::text,s.status,s.created_at,NULL::timestamptz
      FROM event_orders o JOIN payment_sessions s ON s.order_id=o.id
      UNION ALL
      SELECT o.id,o.status,o.total_cents,'provider_event',e.id,e.provider,e.id,
        e.payment_ref,e.session_id,NULL::text,e.amount_cents,e.outcome,e.result,e.received_at,NULL::timestamptz
      FROM event_orders o JOIN provider_events e ON e.order_id=o.id
      UNION ALL
      SELECT o.id,o.status,o.total_cents,'refund',r.id,r.provider,r.provider_refund_id,
        r.payment_ref,NULL::text,r.entry_id,r.amount_cents,NULL::text,r.status,r.created_at,r.updated_at
      FROM event_orders o JOIN refunds r ON r.order_id=o.id
    ) SELECT * FROM records ORDER BY recorded_at,record_kind,record_id`, [eventId]);
  return writeCsv([COLUMNS, ...rows.map((r) => COLUMNS.map((c) => c === 'generated_at' ? generatedAt : c === 'basis' ? 'local_record_not_provider_settlement' : c === 'order_number' ? formatOrderNumber(r.order_id, isDemo) : r[c]))]);
}
