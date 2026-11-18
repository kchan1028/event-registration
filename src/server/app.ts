import { isResearchExample } from '../shared/researchExamples';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z, ZodError } from 'zod';
import { buildBurlingameEvent } from '../shared/burlingame';
import { buildSanFranciscoGrandPrixEvent } from '../shared/sanFranciscoGrandPrix';
import { buildRedKiteSeriesEvent } from '../shared/redKiteSeries';
import { regionalHistoricalDemos } from '../shared/regionalHistoricalEvents';
import { teamTimeTrialResearchDemos } from '../shared/teamTimeTrialResearch';
import { buildBerkeleyOmniumEvent, OMNIUM_ORG_NAME } from '../shared/berkeleyOmnium';
import { buildDemoEvent } from '../shared/demo';
import { buildCaseStudyScenarios, CASE_STUDY_ORG_ID, CASE_STUDY_REFERENCE_NOW } from '../shared/caseStudies';
import { configFromTemplate } from '../shared/factory';
import { type EventConfig, bibNumberSchema, createEventInputSchema, eventConfigSchema } from '../shared/schema';
import { entriesCsv, ledgerCsv } from '../shared/exports';
import { eventSummary } from '../shared/reports';
import { riderCorrectionSchema } from '../shared/lookup';
import { changeImpact, type ImpactEntry } from '../shared/impact';
import { validateConfig } from '../shared/validation';
import { reconciliationCsv } from './reconciliation';
import { cancellationExportState, cancellationExportFilename } from './cancellationClosure';
import { openDb } from './db';
import { createAutomaticBibs, automaticBibError, type AutomaticBibs } from './automaticBibs';
import { createCheckIn } from './checkin';
import { createCaseStudyFixtures } from './caseStudies';
import { createIdentity } from './identity';
import { createResolutions } from './resolutions';
import { createStartLists, slug } from './startlists';
import { createCoupons } from './coupons';
import { createOrders, isLiveOrder, type Orders } from './orders';
import { createPayments, paymentsFromEnv, publicAppUrl, type PaymentProvider } from './payments';
import { createRefunds } from './refunds';
import { createWaitlist } from './waitlist';
import { createRepo, eventLock, HttpError, liveEntrySql, type Repo } from './repo';
import { createMailer, emailFromEnv, type EmailSender } from './email';
import { createJuniors } from './juniors';
import { createCancellationConfirmations } from './cancellationConfirmations';
import { createCancellationFinancialPreflight } from './cancellationFinancialPreflight';
import { createCancellationExecution } from './cancellationExecution';
import { cancellationExecutionSchema } from '../shared/cancellations';
import { createCancellationImpact } from './cancellationImpact';
import { createCancellationAllocations } from './cancellationAllocations';
import { cancellationSelectionSchema, cancellationConfirmationSchema } from '../shared/cancellations';
import { createProfileClaims, profileClaimSettingsFromEnv, validateProfileClaimSettings, type ProfileClaimSettings } from './profileClaims';
import { guardianRemovalSchema } from '../shared/juniors';
import { authProviderFromEnv, createAccess, type Access, type Account, type AuthProvider } from './auth';
import { bibBatchSchema, bibChangeSchema, bibReassignmentSchema, bibFingerprintSchema } from '../shared/checkin';
import { can, ROLES, type Permission, type Role } from '../shared/roles';

declare module 'fastify' {
  interface FastifyRequest {
    /** The signed-in account. Set for every route that is not marked public. */
    account?: Account;
  }
  interface FastifyContextConfig {
    /** Routes open without sign-in: health, the public event list and event pages, and the Stripe webhook (trusted only by its signature). */
    public?: boolean;
  }
}

export interface AppOptions {
  /** PostgreSQL connection string (ADR 0004). */
  databaseUrl: string;
  serveWeb?: boolean;
  logger?: boolean;
  /** Injectable clock for tests of hold expiry. */
  now?: () => Date;
  /** How long checkout holds places before payment. */
  holdMinutes?: number;
  /** Who is calling (ADR 0003). Defaults to Clerk, or the local test provider, from the environment (throws when it is not configured). */
  auth?: AuthProvider;
  /** Payment provider (ADR 0002). Defaults to Stripe test mode when STRIPE_SECRET_KEY is set, otherwise simulated. */
  payments?: PaymentProvider;
  /** Where Stripe sends riders back. Defaults to PUBLIC_APP_URL. */
  appUrl?: string;
  /** Outgoing email (ADR 0006). Defaults to local (recorded, never sent) unless EMAIL_MODE=ses. */
  email?: EmailSender;
  /** Disabled unless age18 and explicit support account IDs are configured. */
  profileClaims?: ProfileClaimSettings;
}

export function buildApp(opts: AppOptions): { app: FastifyInstance; repo: Repo; orders: Orders; access: Access; automaticBibs: AutomaticBibs } {
  // Sign-in, payments, and the app URL are resolved from the environment here and nowhere else.
  // A missing or refused setting throws before anything is opened; src/server/index.ts prints it and exits.
  const provider = opts.auth ?? authProviderFromEnv();
  const paymentProvider = opts.payments ?? paymentsFromEnv();
  const appUrl = opts.appUrl ?? (paymentProvider.mode === 'simulated' ? '' : publicAppUrl());
  const claimSettings = opts.profileClaims ?? profileClaimSettingsFromEnv();
  validateProfileClaimSettings(claimSettings);
  const db = openDb(opts.databaseUrl, (err) => app.log.error(err));
  const clock = opts.now ?? (() => new Date());
  const repo = createRepo(db, clock);
  const coupons = createCoupons(db, repo, clock);
  const juniors = createJuniors(db, clock);
  const profileClaims = createProfileClaims(db, clock, claimSettings);
  const orders = createOrders(db, repo, clock, opts.holdMinutes ?? Number(process.env.HOLD_MINUTES ?? 10), coupons, juniors);
  const identity = createIdentity(db, orders, clock);
  const resolutions = createResolutions(db, orders, clock);
  const startLists = createStartLists(db, repo, orders, clock, identity);
  const checkIn = createCheckIn(db, repo, orders, clock, identity, startLists);
  const waitlist = createWaitlist(db, repo, clock);
  const caseStudies = createCaseStudyFixtures(db, repo, orders);
  const emailSender = opts.email ?? emailFromEnv();
  // The sign-in link in invitation emails. Only SES sends (never in production), so local email needs no URL setting.
  const access = createAccess(db, provider, clock, createMailer(db, emailSender, clock), appUrl || (emailSender.mode === 'ses' ? publicAppUrl() : ''));
  const automaticBibs = createAutomaticBibs(db, repo, checkIn, access, clock);
  const refunds = createRefunds(db, paymentProvider, clock, repo);
  const cancellationAllocations = createCancellationAllocations(db, repo, clock);
  const cancellationImpact = createCancellationImpact(db, repo, cancellationAllocations, clock);
  const cancellationConfirmations = createCancellationConfirmations(db, cancellationImpact, clock);
  const cancellationFinancialPreflight = createCancellationFinancialPreflight(db, cancellationConfirmations, clock);
  const cancellationExecution = createCancellationExecution(db, repo, cancellationConfirmations, cancellationFinancialPreflight, refunds, paymentProvider.mode === 'simulated', clock);
  const payments = createPayments(db, orders, paymentProvider, clock, appUrl, refunds.onRefundEvent);
  const app = Fastify({ logger: opts.logger ?? false, bodyLimit: 2 * 1024 * 1024 });

  // Migrations run once before the server accepts requests (listen, or the first inject in tests).
  app.addHook('onReady', async () => db.migrate());
  // Route parameters. Every ID is bounded the same way.
  const idStr = z.string().min(1).max(64);
  const idParam = z.object({ id: idStr });
  const versionParams = z.object({ id: idStr, version: z.coerce.number().int().min(1) });
  const resolutionParams = z.object({ id: idStr, rid: idStr });
  const couponParams = z.object({ id: idStr, couponId: idStr });
  const waitlistParams = z.object({ id: idStr, entryId: idStr });
  const checkInParams = z.object({ id: idStr, orderId: idStr });
  const raceParams = z.object({ id: idStr, raceId: idStr });
  let stoppingBibWorker = false;
  let bibTimer: ReturnType<typeof setTimeout> | undefined;
  let bibWork: Promise<void> = Promise.resolve();
  function pollAutomaticBibs() {
    bibWork = automaticBibs.runDue().catch((error: unknown) => {
      app.log.error({ failures: error instanceof AggregateError ? error.errors : [automaticBibError(error)] }, 'Automatic bib worker failed; inspect job status and database availability.');
    }).finally(() => {
      if (!stoppingBibWorker) bibTimer = setTimeout(pollAutomaticBibs, 60_000);
    });
  }
  app.addHook('onListen', async () => { pollAutomaticBibs(); });
  app.addHook('preClose', async () => {
    stoppingBibWorker = true;
    clearTimeout(bibTimer);
    await bibWork;
  });
  app.addHook('onClose', async () => db.close());

  // Sign-in is required for every API route unless the route is marked public. Default deny:
  // a new route is protected even if its author forgets to think about sign-in.
  app.addHook('preHandler', async (req) => {
    if (!req.url.startsWith('/api/') || req.routeOptions.config?.public) return;
    const signedIn = await provider.verify(req);
    if (!signedIn) throw new HttpError(401, 'Sign in to continue.');
    req.account = await access.accountFor(signedIn);
  });

  /** The signed-in caller (set by the preHandler hook above). */
  function me(req: { account?: Account }): Account {
    if (!req.account) throw new HttpError(401, 'Sign in to continue.');
    return req.account;
  }
  /**
   * For routes under /api/events/:id: parses the route parameters once (`schema` when the route has
   * more than `:id`), checks the caller's permission on the event, and returns the parameters with the caller's roles.
   */
  async function onEvent<P extends { id: string } = { id: string }>(
    req: { account?: Account; params: unknown },
    permission: Permission,
    schema: z.ZodType<P, z.ZodTypeDef, unknown> = idParam as unknown as z.ZodType<P, z.ZodTypeDef, unknown>,
  ): Promise<P & { roles: Role[] }> {
    const params = schema.parse(req.params);
    return { ...params, roles: await access.requireEvent(me(req), params.id, permission) };
  }
  const isPublic = { config: { public: true } };

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof HttpError) return reply.status(err.status).send({ error: err.message, details: err.details });
    if (err instanceof ZodError) {
      return reply.status(400).send({ error: 'Some fields are not valid.', details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
    }
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) app.log.error(err);
    return reply.status(status).send({ error: status >= 500 ? 'Something went wrong on the server.' : (err as Error).message });
  });

  async function eventPayload(id: string) {
    const record = await repo.getEvent(id);
    const entries = await repo.entries(id);
    return {
      ...record,
      entries,
      versions: await repo.listVersions(id),
      issues: validateConfig(record.config, entries),
      pending: {
        licenseVerification: 'USA Cycling license and category checks are not connected. Every license is unverified and needs review.',
        payments:
          payments.mode === 'stripe_test'
            ? 'Payments use Stripe test mode. Only Stripe test cards work and no real money moves.'
            : 'Payments are not connected. Checkout uses a simulated payment and takes no money.',
        signIn: 'Sign-in is by emailed link or code only. Multi-factor sign-in for organizers is not built yet (Phase 3), so use fictional data only.',
      },
    };
  }

  // Health check for a load balancer or platform: answers 503 while the database cannot be reached.
  app.get('/api/health', isPublic, async (_req, reply) => {
    try {
      await db.get('SELECT 1');
      return { ok: true };
    } catch (err) {
      app.log.error(err);
      return reply.status(503).send({ ok: false, error: 'The database cannot be reached.' });
    }
  });

  // The signed-in account and the organizations it belongs to.
  app.get('/api/me', async (req) => {
    const account = me(req);
    return { account: { id: account.id, email: account.email }, memberships: await access.memberships(account.id) };
  });

  app.get('/api/rider/expired-invitations', async (req) => access.expiredInvitations(me(req)));

  // Only the organizations the caller belongs to, with the caller's roles in each.
  app.get('/api/organizations', async (req) => {
    const mine = new Map((await access.memberships(me(req).id)).map((m) => [m.organizationId, m.roles]));
    return (await repo.listOrganizations([...mine.keys()])).map((o) => ({ ...o, roles: mine.get(o.id)! }));
  });

  // Anyone signed in can start an organization and becomes its owner.
  app.post('/api/organizations', async (req, reply) => {
    const body = z.object({ name: z.string().trim().min(1, 'Enter an organization name.').max(120) }).parse(req.body);
    const org = await db.transaction(async () => {
      const created = await repo.createOrganization(body.name);
      await access.grant(created.id, me(req), 'owner', me(req).id);
      return created;
    });
    return reply.status(201).send(org);
  });

  // People and roles. Owners only.
  const memberBody = z.object({ email: z.string().trim().email('Enter an email address.').max(254), role: z.enum(ROLES) });
  app.get('/api/organizations/:id/members', async (req) => {
    const { id } = idParam.parse(req.params);
    await access.requireOrg(me(req), id, 'members.manage');
    return access.listMembers(id);
  });
  app.post('/api/organizations/:id/members', async (req) => {
    const { id } = idParam.parse(req.params);
    await access.requireOrg(me(req), id, 'members.manage');
    const body = memberBody.parse(req.body);
    return access.addMember(id, body.email, body.role, me(req));
  });
  app.post('/api/organizations/:id/members/remove', async (req) => {
    const { id } = idParam.parse(req.params);
    await access.requireOrg(me(req), id, 'members.manage');
    const body = memberBody.parse(req.body);
    return access.removeMember(id, body.email, body.role, me(req));
  });
  // An owner hands their owner role to someone who has signed in. Recorded in the role history.
  app.post('/api/organizations/:id/ownership-transfer', async (req) => {
    const { id } = idParam.parse(req.params);
    await access.requireOrg(me(req), id, 'members.manage');
    const body = memberBody.pick({ email: true }).parse(req.body);
    return access.transferOwnership(id, body.email, me(req));
  });

  app.post('/api/organizations/:id/events', async (req, reply) => {
    const { id } = idParam.parse(req.params);
    await access.requireOrg(me(req), id, 'event.edit');
    const input = createEventInputSchema.parse(req.body);
    const record = await repo.createEvent(id, configFromTemplate(input));
    return reply.status(201).send(await eventPayload(record.id));
  });

  app.get('/api/events/:id', async (req) => {
    const { id, roles } = await onEvent(req, 'event.view');
    return { ...(await eventPayload(id)), roles };
  });

  app.put('/api/events/:id/config', async (req) => {
    const { id } = await onEvent(req, 'event.edit');
    const body = z.object({ revision: z.number().int(), config: eventConfigSchema }).parse(req.body);
    await repo.saveDraft(id, body.revision, body.config);
    return eventPayload(id);
  });

  app.post('/api/events/:id/publish', async (req) => {
    const { id } = await onEvent(req, 'event.edit');
    const body = z.object({ acknowledgeWarnings: z.boolean().default(false), acknowledgeImpact: z.boolean().default(false) }).parse(req.body ?? {});
    // One transaction under the event lock: the impact that was reviewed is the impact that is published
    // and recorded, with no entry or draft change in between. repo.publish joins it as a savepoint.
    const version = await db.transaction(async () => {
      await db.lock(eventLock(id));
      // A change that touches riders who already entered must be reviewed, like warnings.
      const { impact } = await impactFor(id);
      if (impact && impact.categories.length > 0 && !body.acknowledgeImpact) {
        const n = impact.categories.length;
        throw new HttpError(422, `Review who the ${n} changed ${n === 1 ? 'category' : 'categories'} with entries affect before publishing.`, impact);
      }
      const result = await repo.publish(id, body.acknowledgeWarnings);
      // Paid entries the change touches each get an item in the resolution workflow.
      if (impact && impact.categories.length > 0) await resolutions.record(id, result.version, impact);
      return result.version;
    });
    return { ...(await eventPayload(id)), publishedVersion: version };
  });

  app.get('/api/events/:id/resolutions', async (req) => {
    return resolutions.list((await onEvent(req, 'entries.manage')).id);
  });
  app.post('/api/events/:id/resolutions/:rid', async (req) => {
    const p = await onEvent(req, 'entries.manage', resolutionParams);
    const body = z
      .object({ outcome: z.enum(['kept', 'transferred', 'withdrawn']), riderNotified: z.boolean(), note: z.string().trim().min(3, 'Write what was agreed with the rider.').max(300) })
      .parse(req.body);
    return resolutions.resolve(p.id, p.rid, body.outcome, body.riderNotified, body.note);
  });

  /**
   * Change impact preview: what publishing the draft would change for riders who
   * already entered (confirmed entries and unexpired holds) under the latest published version.
   */
  async function impactFor(id: string) {
    const record = await repo.getEvent(id);
    if (record.publishedVersion === null) return { publishedVersion: null, impact: null };
    const published = await repo.getVersion(id, record.publishedVersion);
    const rows = await db.all<{ order_id: string; category_id: string; status: string; rider_json: { firstName?: string; lastName?: string } }>(
      `SELECT oe.order_id, oe.category_id, oe.status, o.rider_json FROM order_entries oe JOIN orders o ON o.id = oe.order_id
       WHERE oe.event_id = $1 AND ${liveEntrySql('$2')} ORDER BY oe.seq`,
      [id, clock().toISOString()],
    );
    const entries: ImpactEntry[] = rows.map((r) => {
      const rider = r.rider_json;
      return {
        orderId: r.order_id,
        categoryId: r.category_id,
        status: r.status === 'confirmed' ? 'confirmed' : 'held',
        riderName: [rider.firstName, rider.lastName].filter(Boolean).join(' ') || 'Unnamed rider',
      };
    });
    return { publishedVersion: record.publishedVersion, impact: changeImpact(published, record.config, entries) };
  }

  app.get('/api/events/:id/impact', async (req) => {
    return impactFor((await onEvent(req, 'event.edit')).id);
  });

  app.get('/api/events/:id/versions/:version', async (req) => {
    const p = await onEvent(req, 'event.view', versionParams);
    return { version: p.version, config: await repo.getVersion(p.id, p.version) };
  });

  app.post('/api/events/:id/test-entries', async (req) => {
    const { id } = await onEvent(req, 'event.edit');
    const body = z
      .object({
        categoryId: z.string().min(1).max(64),
        count: z.number().int().min(1).max(500),
        riderRefs: z.array(z.string().regex(/^test-rider-[\w-]{1,40}$/)).max(500).optional(),
      })
      .parse(req.body);
    const result = await repo.addTestEntries(id, body.categoryId, body.count, body.riderRefs);
    return { result, event: await eventPayload(id) };
  });

  app.delete('/api/events/:id/test-entries', async (req) => {
    const { id } = await onEvent(req, 'event.edit');
    const removed = await repo.clearTestEntries(id);
    return { removed, event: await eventPayload(id) };
  });

  // Rider checkout. Uses the latest published version only.
  app.get('/api/public/events', isPublic, async () => {
    return (await repo.listPublished()).map(({ id, organizationName, config, cancellation }) => ({
      id,
      organizationName,
      cancellation,
      name: config.event.name,
      venue: config.event.venue,
      isDemo: config.event.isDemo,
      researchOnly: isResearchExample(config),
      days: config.days.map((d) => ({ date: d.date, label: d.label, races: config.races.filter((r) => r.dayId === d.id).map((r) => r.name) })),
      categoryCount: config.categories.filter((c) => c.status !== 'archived').length,
    }));
  });

  app.get('/api/demo/case-studies', async () => ({
    referenceClock: CASE_STUDY_REFERENCE_NOW,
    scenarios: buildCaseStudyScenarios().map(({ key, eventId, title, purpose, publish }) => ({ key, eventId, title, purpose, publish })),
  }));

  app.post('/api/demo/case-studies', async (req, reply) => {
    const result = await caseStudies.loadAll();
    await joinDemo(req, CASE_STUDY_ORG_ID);
    return reply.status(result.results.some((row) => row.created) ? 201 : 200).send(result);
  });

  app.post('/api/demo/case-studies/:key', async (req, reply) => {
    const { key } = z.object({ key: z.enum(['criterium', 'road-shared-field', 'omnium', 'empty-event', 'large-event']) }).parse(req.params);
    const result = await caseStudies.load(key);
    await joinDemo(req, CASE_STUDY_ORG_ID);
    return reply.status(result.created ? 201 : 200).send(result);
  });

  // Reset removes the case-study organization, so only its owners may run it.
  app.delete('/api/demo/case-studies', async (req) => {
    if (await db.get(`SELECT 1 FROM organizations WHERE id = $1`, [CASE_STUDY_ORG_ID])) await access.requireOrg(me(req), CASE_STUDY_ORG_ID, 'members.manage');
    return caseStudies.reset();
  });

  app.get('/api/public/events/:id', isPublic, async (req) => ({ ...(await orders.publicEvent(idParam.parse(req.params).id)), paymentMode: payments.mode }));

  // Rider routes (/api/rider/...) need sign-in like every route not marked public. The order belongs to the rider's account.
  app.post('/api/rider/events/:id/orders', async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const body = z
      .object({
        clientRequestId: z.string().min(8).max(64),
        categoryIds: z.array(z.string().min(1).max(64)).min(1).max(10),
        rider: z.unknown(),
        waiver: z.unknown(),
        extras: z.unknown().optional(),
        offerToken: z.string().min(10).max(64).nullable().optional(),
        couponCode: z.string().trim().min(1).max(32).nullable().optional(),
      })
      .parse(req.body);
    return reply.status(201).send(await orders.createOrder(id, body, me(req).id));
  });

  // Coupons (src/server/coupons.ts). Riders check a code; the order re-checks and counts it under the event lock.
  app.post('/api/rider/events/:id/coupons/check', async (req) => {
    const { id } = idParam.parse(req.params);
    const { code } = z.object({ code: z.string().trim().min(1).max(32) }).parse(req.body);
    return coupons.check(id, code);
  });
  app.get('/api/events/:id/coupons', async (req) => {
    return coupons.list((await onEvent(req, 'event.edit')).id);
  });
  app.post('/api/events/:id/coupons', async (req, reply) => {
    const { id } = await onEvent(req, 'event.edit');
    return reply.status(201).send(await coupons.create(id, req.body));
  });
  app.post('/api/events/:id/coupons/:couponId/active', async (req) => {
    const p = await onEvent(req, 'event.edit', couponParams);
    const { active } = z.object({ active: z.boolean() }).parse(req.body);
    return coupons.setActive(p.id, p.couponId, active);
  });

  // Organizer-managed waitlists (src/server/waitlist.ts).
  app.post('/api/rider/events/:id/waitlist', async (req, reply) => reply.status(201).send(await waitlist.join(idParam.parse(req.params).id, req.body, me(req).id)));
  // The offer link is private to the rider it was sent to; opening it needs sign-in.
  app.get('/api/rider/offers/:token', async (req) => waitlist.offerByToken(z.object({ token: z.string().min(10).max(64) }).parse(req.params).token));
  app.get('/api/events/:id/waitlist', async (req) => {
    return waitlist.list((await onEvent(req, 'entries.manage')).id);
  });
  app.post('/api/events/:id/waitlist/:entryId/offer', async (req) => {
    const p = await onEvent(req, 'entries.manage', waitlistParams);
    return waitlist.offer(p.id, p.entryId);
  });
  app.post('/api/events/:id/waitlist/:entryId/remove', async (req) => {
    const p = await onEvent(req, 'entries.manage', waitlistParams);
    return waitlist.remove(p.id, p.entryId);
  });

  // A rider sees their own orders; organizers who may see orders see their events' orders.
  app.get('/api/orders/:id', async (req) => {
    const { id } = idParam.parse(req.params);
    await access.requireOrderAccess(me(req), { orderId: id }, { rider: true, juniorViewer: true, permission: 'orders.view' });
    return orders.getOrder(id);
  });

  // The signed-in person's own registrations, plus those of juniors who named them as their login.
  app.get('/api/rider/registrations', async (req) => orders.listForAccount(me(req)));

  // Explicitly managed juniors, private guardian acceptance, and the junior's read-only login.
  app.post('/api/support/juniors/:id/claim', async (req) => profileClaims.approve(me(req), idParam.parse(req.params).id, req.body));
  app.get('/api/rider/juniors', async (req) => juniors.list(me(req).id));
  app.get('/api/rider/guardian-invitations', async (req) => juniors.receivedInvitations(me(req)));
  app.post('/api/rider/guardian-invitations/:id/accept', async (req) => {
    z.object({ acknowledge: z.literal(true) }).parse(req.body);
    return juniors.accept(me(req), idParam.parse(req.params).id);
  });
  app.get('/api/rider/juniors/:id/guardians', async (req) => juniors.relationships(me(req), idParam.parse(req.params).id));
  app.post('/api/rider/juniors/:id/guardians/:relationshipId/remove', async (req) => {
    const { id, relationshipId } = idParam.extend({ relationshipId: idStr }).parse(req.params);
    const { reason } = guardianRemovalSchema.parse(req.body);
    return juniors.removeGuardian(me(req), id, relationshipId, reason);
  });
  app.get('/api/rider/juniors/:id/guardian-invitations', async (req) => juniors.invitations(me(req), idParam.parse(req.params).id));
  app.post('/api/rider/juniors/:id/guardian-invitations', async (req) => {
    const { email } = z.object({ email: z.string().trim().email('Enter a guardian email address.').max(254) }).parse(req.body);
    return juniors.invite(me(req), idParam.parse(req.params).id, email);
  });
  app.post('/api/rider/juniors/:id/guardian-invitations/:invitationId/cancel', async (req) => {
    const { id, invitationId } = idParam.extend({ invitationId: idStr }).parse(req.params);
    return juniors.cancelInvitation(me(req), id, invitationId);
  });
  app.post('/api/rider/juniors/:id/viewer', async (req) => {
    const { id } = idParam.parse(req.params);
    const { email } = z.object({ email: z.string().trim().email('Enter the junior’s email.').max(254).nullable() }).parse(req.body);
    return juniors.setViewer(me(req), id, email);
  });

  // The adult placing account or a current authorized junior guardian may pay or cancel.
  app.post('/api/orders/:id/payment', async (req) => {
    const { id } = idParam.parse(req.params);
    await access.requireOrderAccess(me(req), { orderId: id }, { rider: true });
    // With a real provider connected, only a verified provider notification can mark an order paid.
    if (payments.mode !== 'simulated') throw new HttpError(409, 'This build takes payment through Stripe test mode. Use the payment page.');
    const body = z.object({ attemptId: z.string().min(8).max(64), outcome: z.enum(['success', 'failure']) }).parse(req.body);
    return orders.pay(id, body.attemptId, body.outcome);
  });

  // Stripe hosted Checkout (test mode): opens or reuses the order's payment page.
  app.post('/api/orders/:id/checkout-session', async (req) => {
    const { id } = idParam.parse(req.params);
    await access.requireOrderAccess(me(req), { orderId: id }, { rider: true });
    return payments.startCheckout(id);
  });

  app.post('/api/events/:id/cancellation-confirmation-preview', async (req) => {
    const { id } = await onEvent(req, 'payments.refund');
    return cancellationConfirmations.preview(id, cancellationSelectionSchema.parse(req.body));
  });
  app.post('/api/events/:id/cancellation-confirmations', async (req) => {
    const { id } = await onEvent(req, 'payments.refund');
    return cancellationConfirmations.confirm(id, me(req).id, cancellationConfirmationSchema.parse(req.body));
  });
  app.get('/api/events/:id/cancellation-confirmations/:confirmationId', async (req) => {
    const { id, confirmationId } = await onEvent(req, 'payments.refund', z.object({ id: z.string().min(1).max(64), confirmationId: z.string().min(1).max(64) }));
    return cancellationConfirmations.get(id, confirmationId);
  });
  app.get('/api/events/:id/cancellation-confirmations/:confirmationId/financial-preflight', async (req) => {
    const { id, confirmationId } = await onEvent(req, 'payments.refund', z.object({ id: z.string().min(1).max(64), confirmationId: z.string().min(1).max(64) }));
    return cancellationFinancialPreflight.assess(id, confirmationId);
  });
  app.get('/api/events/:id/cancellation-confirmations/:confirmationId/execution-check', async (req) => {
    const { id, confirmationId } = await onEvent(req, 'payments.refund', z.object({ id: z.string().min(1).max(64), confirmationId: z.string().min(1).max(64) }));
    return cancellationExecution.check(id, confirmationId);
  });
  app.post('/api/events/:id/cancellation-executions', async (req) => {
    const { id } = await onEvent(req, 'payments.refund');
    return cancellationExecution.execute(id, me(req).id, cancellationExecutionSchema.parse(req.body));
  });
  app.get('/api/events/:id/cancellation-executions/:executionId', async (req) => {
    const { id, executionId } = await onEvent(req, 'payments.refund', z.object({ id: z.string().min(1).max(64), executionId: z.string().min(1).max(64) }));
    return cancellationExecution.get(id, executionId);
  });

  app.post('/api/events/:id/cancellation-impact-preview', async (req) => {
    const { id } = await onEvent(req, 'payments.refund');
    return cancellationImpact.preview(id, cancellationSelectionSchema.parse(req.body));
  });

  app.post('/api/events/:id/cancellation-allocation-preview', async (req) => {
    const { id } = await onEvent(req, 'payments.refund');
    return cancellationAllocations.preview(id, cancellationSelectionSchema.parse(req.body));
  });

  // Refunds: money back to the rider from one payment, optionally for one entry. Owner or finance role.
  app.get('/api/orders/:id/refund-policy-preview', async (req) => {
    const { id } = idParam.parse(req.params);
    await access.requireOrderAccess(me(req), { orderId: id }, { permission: 'payments.refund' });
    const { reason } = z.object({ reason: z.enum(['withdrawal', 'organizer_cancellation']) }).strict().parse(req.query);
    return refunds.policyPreview(id, reason);
  });
  app.get('/api/orders/:id/refunds', async (req) => {
    const { id } = idParam.parse(req.params);
    await access.requireOrderAccess(me(req), { orderId: id }, { permission: 'orders.view' });
    return refunds.list(id);
  });
  app.post('/api/orders/:id/refunds', async (req) => {
    const { id } = idParam.parse(req.params);
    await access.requireOrderAccess(me(req), { orderId: id }, { permission: 'payments.refund' });
    const result = await refunds.request(id, req.body, me(req).id);
    return { ...await orders.getOrder(id), ...result };
  });
  app.post('/api/refunds/:id/retry', async (req) => {
    const { id } = idParam.parse(req.params);
    const orderId = await refunds.orderOf(id);
    await access.requireOrderAccess(me(req), { orderId }, { permission: 'payments.refund' });
    await refunds.retry(id);
    return orders.getOrder(orderId);
  });

  // Stripe notifications. Public, because Stripe calls it; trusted only after the signature on the raw body verifies.
  app.register(async (scope) => {
    scope.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => done(null, body));
    scope.post('/api/payments/stripe/webhook', isPublic, async (req) => {
      const signature = req.headers['stripe-signature'];
      return payments.handleWebhook(String(req.body ?? ''), Array.isArray(signature) ? signature[0] : signature);
    });
  });

  app.post('/api/orders/:id/cancel', async (req) => {
    const { id } = idParam.parse(req.params);
    await access.requireOrderAccess(me(req), { orderId: id }, { rider: true });
    return orders.cancel(id);
  });

  app.get('/api/events/:id/orders', async (req) => {
    const { id } = await onEvent(req, 'orders.view');
    const { q } = z.object({ q: z.string().max(120).optional() }).parse(req.query);
    return orders.listOrders(id, q ?? '');
  });

  // Organizer corrections to rider details. A reason is required and every correction is kept.
  app.post('/api/orders/:id/rider-corrections', async (req) => {
    const { id } = idParam.parse(req.params);
    await access.requireOrderAccess(me(req), { orderId: id }, { permission: 'entries.manage' });
    const body = z.object({ changes: riderCorrectionSchema, reason: z.string().trim().min(3, 'Write why the details are being corrected.').max(300) }).parse(req.body);
    return orders.correctRider(id, body.changes, body.reason, me(req).id);
  });

  // Organizer transfers and withdrawals of paid entries. A reason is required and logged.
  app.post('/api/order-entries/:id/transfer', async (req) => {
    const { id } = idParam.parse(req.params);
    await access.requireOrderAccess(me(req), { entryId: id }, { permission: 'entries.manage' });
    const body = z.object({ toCategoryId: z.string().min(1).max(64), reason: z.string().trim().min(3, 'Write why the entry is moving.').max(300) }).parse(req.body);
    return orders.transferEntry(id, body.toCategoryId, body.reason);
  });
  app.post('/api/order-entries/:id/withdraw', async (req) => {
    const { id } = idParam.parse(req.params);
    await access.requireOrderAccess(me(req), { entryId: id }, { permission: 'entries.manage' });
    const body = z.object({ reason: z.string().trim().min(3, 'Write why the entry is withdrawn.').max(300) }).parse(req.body);
    return orders.withdrawEntry(id, body.reason);
  });

  app.post('/api/order-entries/:id/license-review', async (req) => {
    const { id } = idParam.parse(req.params);
    await access.requireOrderAccess(me(req), { entryId: id }, { permission: 'entries.manage' });
    const body = z.object({ note: z.string().trim().min(3, 'Say how the license was checked.').max(300) }).parse(req.body);
    return orders.reviewLicense(id, body.note);
  });

  // Race-day check-in. Volunteers see readiness and bib only.
  app.get('/api/events/:id/check-in', async (req) => {
    const { id, roles } = await onEvent(req, 'checkin');
    const q = z.object({ day: z.string().max(64).optional(), q: z.string().max(80).default('') }).parse(req.query);
    return { ...(await checkIn.list(id, q.day, q.q)), roles };
  });

  app.put('/api/events/:id/bib-settings', async (req) => {
    return checkIn.saveSettings((await onEvent(req, 'checkin.settings')).id, req.body);
  });

  app.post('/api/events/:id/check-in/:orderId', async (req) => {
    const p = await onEvent(req, 'checkin', checkInParams);
    const body = z
      .object({ dayId: z.string().min(1).max(64), bib: bibNumberSchema.nullable().default(null), durationMs: z.number().int().min(0).max(86_400_000).nullable().default(null) })
      .parse(req.body);
    return checkIn.checkIn(p.id, p.orderId, body.dayId, body.bib, body.durationMs);
  });

  app.post('/api/events/:id/check-in/:orderId/bib/preview', async (req) => {
    const p = await onEvent(req, 'checkin', checkInParams);
    return checkIn.previewBibChange(p.id, p.orderId, bibChangeSchema.parse(req.body));
  });
  app.post('/api/events/:id/check-in/:orderId/bib', async (req) => {
    const p = await onEvent(req, 'checkin', checkInParams);
    const body = bibChangeSchema.extend({ fingerprint: bibFingerprintSchema }).parse(req.body);
    return checkIn.changeBib(p.id, p.orderId, body, body.fingerprint, me(req).id);
  });

  app.post('/api/events/:id/check-in/:orderId/undo', async (req) => {
    const p = await onEvent(req, 'checkin', checkInParams);
    const body = z.object({ dayId: z.string().min(1).max(64), reason: z.string().trim().min(3, 'Say why the check-in is being undone.').max(200) }).parse(req.body);
    return checkIn.undoCheckIn(p.id, p.orderId, body.dayId, body.reason);
  });

  app.get('/api/events/:id/automatic-bibs', async (req) => {
    const { id } = await onEvent(req, 'checkin.settings');
    return automaticBibs.list(id);
  });
  app.post('/api/events/:id/automatic-bibs', async (req) => {
    const { id } = await onEvent(req, 'checkin.settings');
    return automaticBibs.enable(id, req.body, me(req));
  });
  app.delete('/api/events/:id/automatic-bibs', async (req) => {
    const { id } = await onEvent(req, 'checkin.settings');
    return { cancelled: await automaticBibs.disable(id, me(req)) };
  });

  app.post('/api/events/:id/bibs/preview', async (req) => {
    await onEvent(req, 'checkin.settings');
    const body = bibBatchSchema.parse(req.body);
    return checkIn.previewBibs(idParam.parse(req.params).id, body);
  });
  app.post('/api/events/:id/bibs/apply', async (req) => {
    await onEvent(req, 'checkin.settings');
    const body = bibBatchSchema.extend({ fingerprint: bibFingerprintSchema }).parse(req.body);
    return checkIn.applyBibs(idParam.parse(req.params).id, body, body.fingerprint);
  });

  app.post('/api/events/:id/bibs/reassign/preview', async (req) => {
    const { id } = await onEvent(req, 'checkin.settings');
    return checkIn.previewReassignments(id, bibReassignmentSchema.parse(req.body));
  });
  app.post('/api/events/:id/bibs/reassign/apply', async (req) => {
    const { id } = await onEvent(req, 'checkin.settings');
    const body = z.object({ batch: bibReassignmentSchema, fingerprint: bibFingerprintSchema }).parse(req.body);
    return checkIn.applyReassignments(id, body.batch, body.fingerprint, me(req).id);
  });

  // Rider identity across orders: suggestions and organizer-confirmed links (src/server/identity.ts).
  app.get('/api/events/:id/rider-identity', async (req) => {
    return identity.overview((await onEvent(req, 'entries.manage')).id);
  });
  const pairBody = z.object({ orderIds: z.tuple([z.string().min(1).max(64), z.string().min(1).max(64)]) });
  app.post('/api/events/:id/rider-identity/link', async (req) => {
    const { id } = await onEvent(req, 'entries.manage');
    const { orderIds } = pairBody.parse(req.body);
    return identity.link(id, orderIds[0], orderIds[1]);
  });
  app.post('/api/events/:id/rider-identity/dismiss', async (req) => {
    const { id } = await onEvent(req, 'entries.manage');
    const { orderIds } = pairBody.parse(req.body);
    return identity.dismiss(id, orderIds[0], orderIds[1]);
  });
  app.post('/api/events/:id/rider-identity/unlink', async (req) => {
    const { id } = await onEvent(req, 'entries.manage');
    const { orderId } = z.object({ orderId: idStr }).parse(req.body);
    return identity.unlink(id, orderId);
  });

  app.post('/api/events/:id/check-in-demo-riders', async (req, reply) => {
    const { id } = await onEvent(req, 'event.edit');
    return reply.status(201).send(await checkIn.addDemoRiders(id));
  });

  // Start lists and the sample timer export. No contact or payment data.
  app.get('/api/events/:id/start-lists', async (req) => {
    return startLists.overview((await onEvent(req, 'startlists')).id);
  });

  app.post('/api/events/:id/start-lists/:raceId/snapshots', async (req, reply) => {
    const p = await onEvent(req, 'startlists', raceParams);
    return reply.status(201).send(await startLists.snapshot(p.id, p.raceId, null));
  });

  app.post('/api/events/:id/start-lists/:raceId/lock', async (req, reply) => {
    const p = await onEvent(req, 'startlists', raceParams);
    return reply.status(201).send(await startLists.lock(p.id, p.raceId));
  });

  // Counts for anyone who may see registrations; the money breakdown only for roles that may download the ledger.
  app.get('/api/events/:id/summary', async (req) => {
    const { id, roles } = await onEvent(req, 'orders.view');
    const list = (await orders.listOrders(id)).filter(isLiveOrder);
    return eventSummary(list, await identity.keyOf(id), await waitlist.statuses(id), can(roles, 'export.ledger'));
  });

  // Protected database exports: entries, ledger and local reconciliation evidence. No contact or emergency details.
  app.get('/api/events/:id/exports/:kind', async (req, reply) => {
    // The permission depends on which file is asked for, so the parameters are parsed before the check.
    const p = z.object({ id: idStr, kind: z.enum(['entries.csv', 'ledger.csv', 'reconciliation.csv']) }).parse(req.params);
    await access.requireEvent(me(req), p.id, p.kind === 'entries.csv' ? 'export.entries' : 'export.ledger');
    const file = await db.transaction(async () => {
      await db.lock(eventLock(p.id));
      const record = await repo.getEvent(p.id);
      const slugName = slug(record.config.event.name, 'event');
      const demo = record.config.event.isDemo ? '-DEMO' : '';
      const generatedAt = clock().toISOString();
      let body: string;
      if (p.kind === 'reconciliation.csv') body = await reconciliationCsv(db, p.id, generatedAt, record.config.event.isDemo);
      else {
        const list = (await orders.listOrders(p.id)).filter(isLiveOrder);
        body = p.kind === 'entries.csv' ? entriesCsv(list, await identity.keyOf(p.id)) : ledgerCsv(list);
      }
      const cancellation = await cancellationExportState(db, p.id, record.config);
      return { body, cancellation, generatedAt, filename: cancellationExportFilename(`${slugName}-${p.kind.slice(0, -4)}${p.kind === 'reconciliation.csv' ? '-LOCAL-RECORDS' : ''}${demo}.csv`, cancellation) };
    });
    if (p.kind === 'reconciliation.csv') reply.header('X-CycleReg-Export-Generated-At', file.generatedAt);
    return reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${file.filename}"`)
      .header('X-CycleReg-Cancellation', file.cancellation)
      .header('X-CycleReg-Export-Context', 'current')
      .header('Cache-Control', 'no-store')
      .send(file.body);
  });

  app.get('/api/events/:id/start-lists/:raceId/csv', async (req, reply) => {
    const p = await onEvent(req, 'startlists', raceParams);
    const q = z.object({ snapshot: z.coerce.number().int().min(1).optional() }).parse(req.query);
    const file = await startLists.csv(p.id, p.raceId, q.snapshot ?? null);
    return reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${file.filename}"`)
      .header('X-CycleReg-Cancellation', file.cancellation)
      .header('X-CycleReg-Export-Context', file.historical ? 'historical' : 'current')
      .header('Cache-Control', 'no-store')
      .send(file.body);
  });

  /**
   * Demonstration organizations hold fictional data only. Whoever loads one becomes an owner of
   * it, so each person who loads the shared demos can open them.
   */
  async function joinDemo(req: { account?: Account }, organizationId: string) {
    await access.grant(organizationId, me(req), 'owner', me(req).id);
  }

  async function seed(req: { account?: Account }, orgName: string, { config, entryPlan }: ReturnType<typeof buildDemoEvent>) {
    const org = await repo.createOrganization(orgName);
    await joinDemo(req, org.id);
    const record = await repo.createEvent(org.id, config);
    for (const p of entryPlan) await repo.addTestEntries(record.id, p.categoryId, p.count);
    return { organizationId: org.id, eventId: record.id };
  }

  /** Publishes one empty named demo once; research examples remain unavailable for registration. */
  async function seedPublishedDemo(req: { account?: Account }, orgId: string, eventId: string, orgName: string, build: () => EventConfig) {
    const result = await db.transaction(async () => {
      await db.lock(`demo:${orgId}`);
      const existing = (await repo.listOrganizations([orgId]))[0];
      if (existing) {
        const event = existing.events[0];
        if (existing.events.length !== 1 || event.id !== eventId || !event.isDemo) throw new HttpError(409, 'The demo workspace contains additional or non-demo events and cannot be shared by this loader.');
        if (event.publishedVersion !== null && !(await repo.getVersion(eventId, event.publishedVersion)).event.isDemo) throw new HttpError(409, 'The demo workspace has a non-demo publication and cannot be shared by this loader.');
        return { created: false, organizationId: existing.id, eventIds: [eventId] };
      }
      const org = await repo.createOrganization(orgName, orgId);
      const event = await repo.createEvent(org.id, build(), eventId);
      await repo.publish(event.id, true);
      const eventIds = [event.id];
      return { created: true, organizationId: org.id, eventIds };
    });
    await joinDemo(req, result.organizationId);
    return result;
  }

  app.post('/api/demo/berkeley-events', async (req, reply) => {
    const result = await seedPublishedDemo(req, 'org_acbeb908951a', 'evt_e70bd7cd1b17', 'Berkeley Omnium (local demo)', () => buildBerkeleyOmniumEvent().config);
    return reply.status(result.created ? 201 : 200).send(result);
  });

  app.post('/api/demo/burlingame', async (req, reply) => {
    const result = await seedPublishedDemo(req, 'org_5470cc3518ac', 'evt_f27fa508a3d5', 'Burlingame historical case study (local demo)', buildBurlingameEvent);
    return reply.status(result.created ? 201 : 200).send(result);
  });

  app.post('/api/demo/san-francisco-grand-prix', async (req, reply) => {
    const result = await seedPublishedDemo(req, 'org_5792fe80507a', 'evt_46cd01ce202f', 'San Francisco Grand Prix historical case study (local demo)', buildSanFranciscoGrandPrixEvent);
    return reply.status(result.created ? 201 : 200).send(result);
  });

  app.post('/api/demo/red-kite-series', async (req, reply) => {
    const result = await seedPublishedDemo(req, 'org_29aac4734933', 'evt_280dff645637', 'Red Kite historical criterium sample (local demo)', buildRedKiteSeriesEvent);
    return reply.status(result.created ? 201 : 200).send(result);
  });

  for (const demo of regionalHistoricalDemos) {
    app.post(`/api/demo/${demo.key}`, async (req, reply) => {
      const result = await seedPublishedDemo(req, demo.organizationId, demo.eventId, demo.organizationName, demo.build);
      return reply.status(result.created ? 201 : 200).send(result);
    });
  }

  for (const demo of teamTimeTrialResearchDemos) {
    app.post(`/api/demo/${demo.key}`, async (req, reply) => {
      const result = await seedPublishedDemo(req, demo.organizationId, demo.eventId, demo.organizationName, demo.build);
      return reply.status(result.created ? 201 : 200).send(result);
    });
  }

  /** Creates the labeled fictional demonstration organization and event. */
  app.post('/api/demo', async (req, reply) => reply.status(201).send(await seed(req, 'Example Cycling Club (demonstration)', buildDemoEvent())));

  /** Creates the Berkeley Omnium working copy (2026 fields, 2027 dates, placeholder fees, simulated entries). */
  app.post('/api/demo/berkeley-omnium', async (req, reply) => reply.status(201).send(await seed(req, OMNIUM_ORG_NAME, buildBerkeleyOmniumEvent())));

  const webRoot = resolve(process.cwd(), 'dist/web');
  if (opts.serveWeb && existsSync(webRoot)) {
    app.register(fastifyStatic, { root: webRoot, wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.status(404).send({ error: 'Not found.' });
      return reply.sendFile('index.html');
    });
  }

  return { app, repo, orders, access, automaticBibs };
}
