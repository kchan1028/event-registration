import type { Db } from './db';
import { HttpError } from './repo';

export type CancellationRefusal = { status: number; message: string; details: Record<string, unknown> };
export type CancellationOutcome<T> = { value: T } | { refusal: CancellationRefusal };
type Kind = 'plan' | 'execution';

/** Both callers hold the event lock. Terminal rejection and success identities cannot race. */
export async function priorCancellationRefusal(db: Db, eventId: string, kind: Kind, requestId: string, input: unknown): Promise<CancellationRefusal | null> {
  const row = await db.get<{ same: boolean; status_code: number; message: string; details_json: Record<string, unknown> }>('SELECT request_json=$4::jsonb AS same,status_code,message,details_json FROM cancellation_request_refusals WHERE event_id=$1 AND command_kind=$2 AND client_request_id=$3', [eventId, kind, requestId, JSON.stringify(input)]);
  if (!row) return null;
  if (!row.same) throw new HttpError(409, 'This request identity was already used with different details. Recover the original request.');
  return { status: row.status_code, message: row.message, details: row.details_json };
}

export async function recordCancellationRefusal(db: Db, eventId: string, kind: Kind, requestId: string, input: unknown, actorId: string, at: string, error: HttpError, code: string): Promise<CancellationRefusal> {
  const details = error.details && typeof error.details === 'object' && !Array.isArray(error.details) ? error.details : {};
  const refusal = { status: error.status, message: error.message, details: { ...details, code } };
  await db.run('INSERT INTO cancellation_request_refusals(event_id,command_kind,client_request_id,request_json,rejected_by,rejected_at,status_code,message,details_json) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)', [eventId, kind, requestId, JSON.stringify(input), actorId, at, refusal.status, refusal.message, JSON.stringify(refusal.details)]);
  return refusal;
}
