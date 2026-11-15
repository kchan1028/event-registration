import { automaticBibInputSchema, type AutomaticBibJob } from '../shared/checkin';
import { localNow, enforcesWindows, windowState } from '../shared/checkout';
import { newId } from '../shared/factory';
import type { Access, Account } from './auth';
import type { CheckIn } from './checkin';
import type { Db } from './db';
import { eventLock, HttpError, reservedOrderSql, type Repo } from './repo';

/** Keep diagnostic frames and database codes without exception messages or row details. */
export function automaticBibError(error: unknown) {
  const value = error instanceof Error ? error : new Error('Unknown automatic bib error');
  return {
    name: value.name,
    code: typeof (value as { code?: unknown }).code === 'string' ? (value as Error & { code: string }).code : null,
    frames: value.stack?.split('\n').slice(1).filter((line) => /^\s+at /.test(line)) ?? [],
  };
}

/** Durable opt-in jobs. The event lock also serializes manual bibs, checkout, and publication. */
export function createAutomaticBibs(db: Db, repo: Repo, checkIn: CheckIn, access: Access, clock: () => Date) {
  const columns = `id, sort, configured_by AS "configuredBy", created_at AS "createdAt",
    completed_at AS "completedAt", cancelled_at AS "cancelledAt", cancelled_by AS "cancelledBy",
    last_attempt_at AS "lastAttemptAt", message, assigned`;

  async function runJob(id: string, eventId: string) {
    return db.transaction(async () => {
      await db.lock(eventLock(eventId));
      const job = await db.get<AutomaticBibJob>(`SELECT ${columns} FROM automatic_bib_jobs WHERE id = $1 AND completed_at IS NULL AND cancelled_at IS NULL`, [id]);
      if (!job) return null;
      const at = clock().toISOString();
      try {
        // A savepoint rolls back all days if any range fails, leaving a retryable job with its reason.
        await db.transaction(async () => {
          const actor = await db.get<Account>(`SELECT id, email FROM accounts WHERE id = $1`, [job.configuredBy]);
          if (!actor) throw new HttpError(409, 'The organizer who enabled automatic assignment is unavailable.');
          try {
            await access.requireEvent(actor, eventId, 'checkin.settings');
          } catch (error) {
            if (error instanceof HttpError && (error.status === 403 || error.status === 404)) {
              throw new HttpError(409, 'The organizer who enabled this job no longer has bib-settings permission. An owner or registration manager must cancel and re-enable automatic assignment.');
            }
            throw error;
          }
          const { config } = await repo.getPublished(eventId);
          const categories = config.categories.filter((c) => c.status !== 'archived');
          if (!categories.length) throw new HttpError(409, 'No published registration categories are configured.');
          if (!enforcesWindows(config)) throw new HttpError(409, 'Turn off the demo registration-window bypass before automatic assignment.');
          const now = localNow(config.event.timeZone, clock());
          if (categories.some((c) => c.status !== 'closed' && windowState(c, now) !== 'closed')) {
            throw new HttpError(409, 'Waiting for every published category to close registration. Missing closing times must be configured or the category closed explicitly.');
          }
          if (await db.get(`SELECT 1 FROM orders o WHERE o.event_id = $1 AND ${reservedOrderSql('$2')} LIMIT 1`, [eventId, at])) {
            throw new HttpError(409, 'Waiting for outstanding checkout holds to settle or expire.');
          }
          const assigned = await checkIn.assignUnassignedBibs(eventId, job.sort, job.id);
          await db.run(`UPDATE automatic_bib_jobs SET completed_at = $1, last_attempt_at = $1, message = NULL, assigned = $2 WHERE id = $3`, [at, assigned, id]);
        });
      } catch (error) {
        // Domain messages contain configuration/range details, never rider identity or database errors.
        const message = error instanceof HttpError ? error.message : 'Automatic assignment failed. Check server monitoring and retry.';
        await db.run(`UPDATE automatic_bib_jobs SET last_attempt_at = $1, message = $2 WHERE id = $3`, [at, message, id]);
        return error instanceof HttpError ? null : automaticBibError(error);
      }
      return null;
    });
  }

  return {
    async list(eventId: string): Promise<AutomaticBibJob[]> {
      return db.all<AutomaticBibJob>(`SELECT ${columns} FROM automatic_bib_jobs WHERE event_id = $1 ORDER BY created_at DESC, id`, [eventId]);
    },
    async enable(eventId: string, input: unknown, actor: Account) {
      const { sort } = automaticBibInputSchema.parse(input);
      return db.transaction(async () => {
        await db.lock(eventLock(eventId));
        const at = clock().toISOString();
        await db.run(`UPDATE automatic_bib_jobs SET cancelled_at = $1, cancelled_by = $2 WHERE event_id = $3 AND completed_at IS NULL AND cancelled_at IS NULL`, [at, actor.id, eventId]);
        const id = newId('bibjob');
        await db.run(`INSERT INTO automatic_bib_jobs (id, event_id, sort, configured_by, created_at) VALUES ($1, $2, $3, $4, $5)`, [id, eventId, sort, actor.id, at]);
        return { id };
      });
    },
    async disable(eventId: string, actor: Account) {
      await db.transaction(async () => {
        await db.lock(eventLock(eventId));
        await db.run(`UPDATE automatic_bib_jobs SET cancelled_at = $1, cancelled_by = $2 WHERE event_id = $3 AND completed_at IS NULL AND cancelled_at IS NULL`, [clock().toISOString(), actor.id, eventId]);
      });
    },
    async runDue() {
      const pending = await db.all<{ id: string; event_id: string }>(`SELECT id, event_id FROM automatic_bib_jobs WHERE completed_at IS NULL AND cancelled_at IS NULL ORDER BY created_at, id`);
      const failures: ReturnType<typeof automaticBibError>[] = [];
      for (const job of pending) {
        try {
          const failure = await runJob(job.id, job.event_id);
          if (failure) failures.push(failure);
        } catch (error) {
          failures.push(automaticBibError(error));
        }
      }
      if (failures.length) throw new AggregateError(failures, 'Automatic bib assignment failed; inspect job status.');
    },
  };
}
export type AutomaticBibs = ReturnType<typeof createAutomaticBibs>;
