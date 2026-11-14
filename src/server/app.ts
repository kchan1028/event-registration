import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z, ZodError } from 'zod';
import { buildBerkeleyOmniumEvent, OMNIUM_ORG_NAME } from '../shared/berkeleyOmnium';
import { buildDemoEvent } from '../shared/demo';
import { configFromTemplate } from '../shared/factory';
import { createEventInputSchema, eventConfigSchema } from '../shared/schema';
import { validateConfig } from '../shared/validation';
import { openDb } from './db';
import { createOrders, type Orders } from './orders';
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
        signIn: 'Sign-in and required multi-factor authentication are not built yet. Run this prototype only on your own computer.',
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
    const body = z.object({ acknowledgeWarnings: z.boolean().default(false) }).parse(req.body ?? {});
    const result = repo.publish(id, body.acknowledgeWarnings);
    return { ...eventPayload(id), publishedVersion: result.version };
  });

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

  // Rider checkout (prototype). Uses the latest published version only.
  app.get('/api/public/events/:id', async (req) => orders.publicEvent(idParam.parse(req.params).id));

  app.post('/api/public/events/:id/orders', async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const body = z
      .object({
        clientRequestId: z.string().min(8).max(64),
        categoryIds: z.array(z.string().min(1).max(64)).min(1).max(10),
        rider: z.unknown(),
        waiver: z.unknown(),
      })
      .parse(req.body);
    return reply.status(201).send(orders.createOrder(id, body));
  });

  app.get('/api/orders/:id', async (req) => orders.getOrder(idParam.parse(req.params).id));

  app.post('/api/orders/:id/payment', async (req) => {
    const { id } = idParam.parse(req.params);
    const body = z.object({ attemptId: z.string().min(8).max(64), outcome: z.enum(['success', 'failure']) }).parse(req.body);
    return orders.pay(id, body.attemptId, body.outcome);
  });

  app.post('/api/orders/:id/cancel', async (req) => orders.cancel(idParam.parse(req.params).id));

  app.get('/api/events/:id/orders', async (req) => orders.listOrders(idParam.parse(req.params).id));

  app.post('/api/order-entries/:id/license-review', async (req) => {
    const { id } = idParam.parse(req.params);
    const body = z.object({ note: z.string().trim().min(3, 'Say how the license was checked.').max(300) }).parse(req.body);
    return orders.reviewLicense(id, body.note);
  });

  function seed(orgName: string, { config, entryPlan }: ReturnType<typeof buildDemoEvent>) {
    const org = repo.createOrganization(orgName);
    const record = repo.createEvent(org.id, config);
    for (const p of entryPlan) repo.addTestEntries(record.id, p.categoryId, p.count);
    return { organizationId: org.id, eventId: record.id };
  }

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
