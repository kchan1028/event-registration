import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z, ZodError } from 'zod';
import { BERKELEY_DEMO_ORG, buildBerkeleyEvents } from '../shared/berkeleyEvents';
import { buildBerkeleyOmniumEvent, OMNIUM_ORG_NAME } from '../shared/berkeleyOmnium';
import { buildDemoEvent } from '../shared/demo';
import { configFromTemplate } from '../shared/factory';
import { buildFixtureEvents, FIXTURE_ORG_NAME } from '../shared/fixtures';
import { createEventInputSchema, eventConfigSchema } from '../shared/schema';
import { entriesCsv, ledgerCsv } from '../shared/exports';
import { changeImpact, type ImpactEntry } from '../shared/impact';
import { validateConfig } from '../shared/validation';
import { openDb } from './db';
import { createCheckIn } from './checkin';
import { createIdentity } from './identity';
import { createResolutions } from './resolutions';
import { createStartLists } from './startlists';
import { createOrders, type Orders } from './orders';
import { createWaitlist } from './waitlist';
import { createRepo, HttpError, type Repo } from './repo';

export interface AppOptions {
  dbPath: string;
  serveWeb?: boolean;
  logger?: boolean;
  /** Injectable clock for tests of hold expiry. */
  now?: () => Date;
  /** How long checkout holds places before payment. */
  holdMinutes?: number;
}

export function buildApp(opts: AppOptions): { app: FastifyInstance; repo: Repo; orders: Orders } {
  const db = openDb(opts.dbPath);
  const clock = opts.now ?? (() => new Date());
  const repo = createRepo(db, clock);
  const orders = createOrders(db, repo, clock, opts.holdMinutes ?? Number(process.env.HOLD_MINUTES ?? 10));
  const identity = createIdentity(db, orders, clock);
  const resolutions = createResolutions(db, orders, clock);
  const checkIn = createCheckIn(db, repo, orders, clock, identity);
  const startLists = createStartLists(db, repo, orders, clock, identity);
  const waitlist = createWaitlist(db, repo, clock);
  const app = Fastify({ logger: opts.logger ?? false, bodyLimit: 2 * 1024 * 1024 });

  app.addHook('onClose', async () => db.close());

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof HttpError) return reply.status(err.status).send({ error: err.message, details: err.details });
    if (err instanceof ZodError) {
      return reply.status(400).send({ error: 'Some fields are not valid.', details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
    }
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) app.log.error(err);
    return reply.status(status).send({ error: status >= 500 ? 'Something went wrong on the server.' : (err as Error).message });
  });

  const idParam = z.object({ id: z.string().min(1).max(64) });

  function eventPayload(id: string) {
    const record = repo.getEvent(id);
    const entries = repo.entries(id);
    return {
      ...record,
      entries,
      versions: repo.listVersions(id),
      issues: validateConfig(record.config, entries),
      pending: {
        licenseVerification: 'USA Cycling license and category checks are not connected. Every license is unverified and needs review.',
        payments: 'Payments are not connected. Checkout uses a simulated payment and takes no money.',
        signIn: 'Sign-in and required multi-factor authentication are not built yet. Until they are, run the app only on your own computer.',
      },
    };
  }

  app.get('/api/health', async () => ({ ok: true }));

  app.get('/api/organizations', async () => repo.listOrganizations());

  app.post('/api/organizations', async (req, reply) => {
    const body = z.object({ name: z.string().trim().min(1, 'Enter an organization name.').max(120) }).parse(req.body);
    return reply.status(201).send(repo.createOrganization(body.name));
  });

  app.post('/api/organizations/:id/events', async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const input = createEventInputSchema.parse(req.body);
    const record = repo.createEvent(id, configFromTemplate(input));
    return reply.status(201).send(eventPayload(record.id));
  });

  app.get('/api/events/:id', async (req) => eventPayload(idParam.parse(req.params).id));

  app.put('/api/events/:id/config', async (req) => {
    const { id } = idParam.parse(req.params);
    const body = z.object({ revision: z.number().int(), config: eventConfigSchema }).parse(req.body);
    repo.saveDraft(id, body.revision, body.config);
    return eventPayload(id);
  });

  app.post('/api/events/:id/publish', async (req) => {
    const { id } = idParam.parse(req.params);
    const body = z.object({ acknowledgeWarnings: z.boolean().default(false), acknowledgeImpact: z.boolean().default(false) }).parse(req.body ?? {});
    // A change that touches riders who already entered must be reviewed, like warnings.
    const { impact } = impactFor(id);
    if (impact && impact.categories.length > 0 && !body.acknowledgeImpact) {
      const n = impact.categories.length;
      throw new HttpError(422, `Review who the ${n} changed ${n === 1 ? 'category' : 'categories'} with entries affect before publishing.`, impact);
    }
    const result = repo.publish(id, body.acknowledgeWarnings);
    // Paid entries the change touches each get an item in the resolution workflow.
    if (impact && impact.categories.length > 0) resolutions.record(id, result.version, impact);
    return { ...eventPayload(id), publishedVersion: result.version };
  });

  app.get('/api/events/:id/resolutions', async (req) => resolutions.list(idParam.parse(req.params).id));
  app.post('/api/events/:id/resolutions/:rid', async (req) => {
    const p = z.object({ id: z.string().min(1).max(64), rid: z.string().min(1).max(64) }).parse(req.params);
    const body = z
      .object({ outcome: z.enum(['kept', 'transferred', 'withdrawn']), riderNotified: z.boolean(), note: z.string().trim().min(3, 'Write what was agreed with the rider.').max(300) })
      .parse(req.body);
    return resolutions.resolve(p.id, p.rid, body.outcome, body.riderNotified, body.note);
  });

  /**
   * Change impact preview: what publishing the draft would change for riders who
   * already entered (confirmed entries and unexpired holds) under the latest published version.
   */
  function impactFor(id: string) {
    const record = repo.getEvent(id);
    if (record.publishedVersion === null) return { publishedVersion: null, impact: null };
    const published = repo.getVersion(id, record.publishedVersion);
    const rows = db
      .prepare<[string, string], { order_id: string; category_id: string; status: string; rider_json: string }>(
        `SELECT oe.order_id, oe.category_id, oe.status, o.rider_json FROM order_entries oe JOIN orders o ON o.id = oe.order_id
         WHERE oe.event_id = ? AND (oe.status = 'confirmed' OR (oe.status = 'held' AND o.hold_expires_at > ?))`,
      )
      .all(id, clock().toISOString());
    const entries: ImpactEntry[] = rows.map((r) => {
      const rider = JSON.parse(r.rider_json) as { firstName?: string; lastName?: string };
      return {
        orderId: r.order_id,
        categoryId: r.category_id,
        status: r.status === 'confirmed' ? 'confirmed' : 'held',
        riderName: [rider.firstName, rider.lastName].filter(Boolean).join(' ') || 'Unnamed rider',
      };
    });
    return { publishedVersion: record.publishedVersion, impact: changeImpact(published, record.config, entries) };
  }

  app.get('/api/events/:id/impact', async (req) => impactFor(idParam.parse(req.params).id));

  app.get('/api/events/:id/versions/:version', async (req) => {
    const p = z.object({ id: z.string(), version: z.coerce.number().int().min(1) }).parse(req.params);
    return { version: p.version, config: repo.getVersion(p.id, p.version) };
  });

  app.post('/api/events/:id/test-entries', async (req) => {
    const { id } = idParam.parse(req.params);
    const body = z
      .object({
        categoryId: z.string().min(1).max(64),
        count: z.number().int().min(1).max(500),
        riderRefs: z.array(z.string().regex(/^test-rider-[\w-]{1,40}$/)).max(500).optional(),
      })
      .parse(req.body);
    const result = repo.addTestEntries(id, body.categoryId, body.count, body.riderRefs);
    return { result, event: eventPayload(id) };
  });

  app.delete('/api/events/:id/test-entries', async (req) => {
    const { id } = idParam.parse(req.params);
    const removed = repo.clearTestEntries(id);
    return { removed, event: eventPayload(id) };
  });

  // Rider checkout. Uses the latest published version only.
  app.get('/api/public/events', async () =>
    repo
      .listOrganizations()
      .flatMap((o) => o.events.filter((e) => e.publishedVersion !== null).map((e) => ({ id: e.id, organizationName: o.name })))
      .map(({ id, organizationName }) => {
        const record = repo.getEvent(id);
        const config = repo.getVersion(id, record.publishedVersion!);
        return {
          id,
          organizationName,
          name: config.event.name,
          venue: config.event.venue,
          isDemo: config.event.isDemo,
          days: config.days.map((d) => ({ date: d.date, label: d.label, races: config.races.filter((r) => r.dayId === d.id).map((r) => r.name) })),
          categoryCount: config.categories.filter((c) => c.status !== 'archived').length,
        };
      }),
  );

  /** Loads the clickable demo purchase flow fixtures (docs/fixtures) once, published. */
  app.post('/api/demo/purchase-flow', async (_req, reply) => {
    const existing = repo.listOrganizations().find((o) => o.name === FIXTURE_ORG_NAME);
    if (existing && existing.events.length > 0) return reply.status(200).send({ organizationId: existing.id, eventIds: existing.events.map((e) => e.id) });
    const org = existing ?? repo.createOrganization(FIXTURE_ORG_NAME);
    const eventIds: string[] = [];
    for (const { config, entryPlan } of buildFixtureEvents()) {
      const record = repo.createEvent(org.id, config);
      for (const p of entryPlan) repo.addTestEntries(record.id, p.categoryId, p.count);
      repo.publish(record.id, true);
      eventIds.push(record.id);
    }
    return reply.status(201).send({ organizationId: org.id, eventIds });
  });

  app.get('/api/public/events/:id', async (req) => orders.publicEvent(idParam.parse(req.params).id));

  app.post('/api/public/events/:id/orders', async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const body = z
      .object({
        clientRequestId: z.string().min(8).max(64),
        categoryIds: z.array(z.string().min(1).max(64)).min(1).max(10),
        rider: z.unknown(),
        waiver: z.unknown(),
        extras: z.unknown().optional(),
        offerToken: z.string().min(10).max(64).nullable().optional(),
      })
      .parse(req.body);
    return reply.status(201).send(orders.createOrder(id, body));
  });

  // Organizer-managed waitlists (src/server/waitlist.ts).
  app.post('/api/public/events/:id/waitlist', async (req, reply) => reply.status(201).send(waitlist.join(idParam.parse(req.params).id, req.body)));
  app.get('/api/public/offers/:token', async (req) => waitlist.offerByToken(z.object({ token: z.string().min(10).max(64) }).parse(req.params).token));
  app.get('/api/events/:id/waitlist', async (req) => waitlist.list(idParam.parse(req.params).id));
  const waitlistParams = z.object({ id: z.string().min(1).max(64), entryId: z.string().min(1).max(64) });
  app.post('/api/events/:id/waitlist/:entryId/offer', async (req) => {
    const p = waitlistParams.parse(req.params);
    return waitlist.offer(p.id, p.entryId);
  });
  app.post('/api/events/:id/waitlist/:entryId/remove', async (req) => {
    const p = waitlistParams.parse(req.params);
    return waitlist.remove(p.id, p.entryId);
  });

  app.get('/api/orders/:id', async (req) => orders.getOrder(idParam.parse(req.params).id));

  app.post('/api/orders/:id/payment', async (req) => {
    const { id } = idParam.parse(req.params);
    const body = z.object({ attemptId: z.string().min(8).max(64), outcome: z.enum(['success', 'failure']) }).parse(req.body);
    return orders.pay(id, body.attemptId, body.outcome);
  });

  app.post('/api/orders/:id/cancel', async (req) => orders.cancel(idParam.parse(req.params).id));

  app.get('/api/events/:id/orders', async (req) => orders.listOrders(idParam.parse(req.params).id));

  // Organizer transfers and withdrawals of paid entries. A reason is required and logged.
  app.post('/api/order-entries/:id/transfer', async (req) => {
    const { id } = idParam.parse(req.params);
    const body = z.object({ toCategoryId: z.string().min(1).max(64), reason: z.string().trim().min(3, 'Write why the entry is moving.').max(300) }).parse(req.body);
    return orders.transferEntry(id, body.toCategoryId, body.reason);
  });
  app.post('/api/order-entries/:id/withdraw', async (req) => {
    const { id } = idParam.parse(req.params);
    const body = z.object({ reason: z.string().trim().min(3, 'Write why the entry is withdrawn.').max(300) }).parse(req.body);
    return orders.withdrawEntry(id, body.reason);
  });

  app.post('/api/order-entries/:id/license-review', async (req) => {
    const { id } = idParam.parse(req.params);
    const body = z.object({ note: z.string().trim().min(3, 'Say how the license was checked.').max(300) }).parse(req.body);
    return orders.reviewLicense(id, body.note);
  });

  // Race-day check-in. Volunteers see readiness and bib only.
  app.get('/api/events/:id/check-in', async (req) => {
    const { id } = idParam.parse(req.params);
    const q = z.object({ day: z.string().max(64).optional(), q: z.string().max(80).default('') }).parse(req.query);
    return checkIn.list(id, q.day, q.q);
  });

  app.put('/api/events/:id/bib-settings', async (req) => checkIn.saveSettings(idParam.parse(req.params).id, req.body));

  app.post('/api/events/:id/check-in/:orderId', async (req) => {
    const p = z.object({ id: z.string().min(1).max(64), orderId: z.string().min(1).max(64) }).parse(req.params);
    const body = z
      .object({ dayId: z.string().min(1).max(64), bib: z.number().int().min(1).max(99999).nullable().default(null), durationMs: z.number().int().min(0).max(86_400_000).nullable().default(null) })
      .parse(req.body);
    return checkIn.checkIn(p.id, p.orderId, body.dayId, body.bib, body.durationMs);
  });

  app.post('/api/events/:id/check-in/:orderId/bib', async (req) => {
    const p = z.object({ id: z.string().min(1).max(64), orderId: z.string().min(1).max(64) }).parse(req.params);
    const body = z
      .object({ dayId: z.string().min(1).max(64), bib: z.number().int().min(1).max(99999), reason: z.string().trim().min(3, 'Say why the bib changed.').max(200) })
      .parse(req.body);
    return checkIn.changeBib(p.id, p.orderId, body.dayId, body.bib, body.reason);
  });

  app.post('/api/events/:id/check-in/:orderId/undo', async (req) => {
    const p = z.object({ id: z.string().min(1).max(64), orderId: z.string().min(1).max(64) }).parse(req.params);
    const body = z.object({ dayId: z.string().min(1).max(64), reason: z.string().trim().min(3, 'Say why the check-in is being undone.').max(200) }).parse(req.body);
    return checkIn.undoCheckIn(p.id, p.orderId, body.dayId, body.reason);
  });

  // Rider identity across orders: suggestions and organizer-confirmed links (src/server/identity.ts).
  app.get('/api/events/:id/rider-identity', async (req) => identity.overview(idParam.parse(req.params).id));
  const pairBody = z.object({ orderIds: z.tuple([z.string().min(1).max(64), z.string().min(1).max(64)]) });
  app.post('/api/events/:id/rider-identity/link', async (req) => {
    const { orderIds } = pairBody.parse(req.body);
    return identity.link(idParam.parse(req.params).id, orderIds[0], orderIds[1]);
  });
  app.post('/api/events/:id/rider-identity/dismiss', async (req) => {
    const { orderIds } = pairBody.parse(req.body);
    return identity.dismiss(idParam.parse(req.params).id, orderIds[0], orderIds[1]);
  });
  app.post('/api/events/:id/rider-identity/unlink', async (req) => {
    const { orderId } = z.object({ orderId: z.string().min(1).max(64) }).parse(req.body);
    return identity.unlink(idParam.parse(req.params).id, orderId);
  });

  app.post('/api/events/:id/check-in-demo-riders', async (req, reply) => reply.status(201).send(checkIn.addDemoRiders(idParam.parse(req.params).id)));

  // Start lists and the sample timer export. No contact or payment data.
  app.get('/api/events/:id/start-lists', async (req) => startLists.overview(idParam.parse(req.params).id));

  app.post('/api/events/:id/start-lists/:raceId/snapshots', async (req, reply) => {
    const p = z.object({ id: z.string().min(1).max(64), raceId: z.string().min(1).max(64) }).parse(req.params);
    return reply.status(201).send(startLists.snapshot(p.id, p.raceId));
  });

  app.post('/api/events/:id/start-lists/:raceId/lock', async (req, reply) => {
    const p = z.object({ id: z.string().min(1).max(64), raceId: z.string().min(1).max(64) }).parse(req.params);
    return reply.status(201).send(startLists.lock(p.id, p.raceId));
  });

  // Organizer exports from the database: entries and a (simulated) ledger. No contact or emergency details.
  app.get('/api/events/:id/exports/:kind', async (req, reply) => {
    const p = z.object({ id: z.string().min(1).max(64), kind: z.enum(['entries.csv', 'ledger.csv']) }).parse(req.params);
    const record = repo.getEvent(p.id);
    const list = orders.listOrders(p.id).filter((o) => o.status !== 'cancelled' && o.status !== 'expired');
    const slugName = record.config.event.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'event';
    const demo = record.config.event.isDemo ? '-DEMO' : '';
    const body = p.kind === 'entries.csv' ? entriesCsv(list, identity.keyOf(p.id)) : ledgerCsv(list);
    return reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${slugName}-${p.kind === 'entries.csv' ? 'entries' : 'ledger'}${demo}.csv"`)
      .header('Cache-Control', 'no-store')
      .send(body);
  });

  app.get('/api/events/:id/start-lists/:raceId/csv', async (req, reply) => {
    const p = z.object({ id: z.string().min(1).max(64), raceId: z.string().min(1).max(64) }).parse(req.params);
    const q = z.object({ snapshot: z.coerce.number().int().min(1).optional() }).parse(req.query);
    const file = startLists.csv(p.id, p.raceId, q.snapshot ?? null);
    return reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${file.filename}"`)
      .header('Cache-Control', 'no-store')
      .send(file.body);
  });

  function seed(orgName: string, { config, entryPlan }: ReturnType<typeof buildDemoEvent>) {
    const org = repo.createOrganization(orgName);
    const record = repo.createEvent(org.id, config);
    for (const p of entryPlan) repo.addTestEntries(record.id, p.categoryId, p.count);
    return { organizationId: org.id, eventId: record.id };
  }

  /** Seeds two published standalone events once, without touching other local data. */
  app.post('/api/demo/berkeley-events', async (_req, reply) => {
    const result = db.transaction(() => {
      const existing = repo.listOrganizations().find((o) => o.name === BERKELEY_DEMO_ORG);
      if (existing) return { created: false, organizationId: existing.id, eventIds: existing.events.map((e) => e.id) };
      const org = repo.createOrganization(BERKELEY_DEMO_ORG);
      const eventIds = buildBerkeleyEvents().map((config) => {
        const event = repo.createEvent(org.id, config);
        repo.publish(event.id, true);
        return event.id;
      });
      return { created: true, organizationId: org.id, eventIds };
    }).immediate();
    return reply.status(result.created ? 201 : 200).send(result);
  });

  /** Creates the labeled fictional demonstration organization and event. */
  app.post('/api/demo', async (_req, reply) => reply.status(201).send(seed('Example Cycling Club (demonstration)', buildDemoEvent())));

  /** Creates the Berkeley Omnium working copy (2026 fields, 2027 dates, placeholder fees, simulated entries). */
  app.post('/api/demo/berkeley-omnium', async (_req, reply) => reply.status(201).send(seed(OMNIUM_ORG_NAME, buildBerkeleyOmniumEvent())));

  const webRoot = resolve(process.cwd(), 'dist/web');
  if (opts.serveWeb && existsSync(webRoot)) {
    app.register(fastifyStatic, { root: webRoot, wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.status(404).send({ error: 'Not found.' });
      return reply.sendFile('index.html');
    });
  }

  return { app, repo, orders };
}
