import { isResearchExample, RESEARCH_REGISTRATION_MESSAGE } from '../shared/researchExamples';
import QRCode from 'qrcode';
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { checkExtras, EMPTY_EXTRAS, type OrderExtras } from '../shared/categoryExtras';
import { checkSelection, checkSignature, findConflicts, formatLocalDateTime, MESSAGES, needsGuardian as guardianNeeded, profileOf, riderDetailsSchema, windowState, type RiderDetails, type WindowState } from '../shared/checkout';
import { evaluateCategory, licenseLabel, summarizeEligibility, summarizePath, type EligibilityResult, type RiderProfile } from '../shared/eligibility';
import { DEMO_RIDERS } from '../shared/fixtures';
import { formatCents, formatDate, formatLength, formatTime, sortCategories } from '../shared/format';
import { quote, type Quote } from '../shared/pricing';
import type { CouponTerms } from '../shared/coupons';
import { REFUND_STATUS_LABEL } from '../shared/refunds';
import { COLLEGIATE_DIVISIONS, LICENSE_CATEGORIES, type Bundle, type Category, type EventConfig } from '../shared/schema';
import { OFFER_HOURS } from '../shared/waitlist';
import { api, ApiError, type OrderView, type PaymentMode, type PublicEvent, type PublicEventSummary, type WaitlistOffer } from './api';
import { href, navigate } from './App';
import { formatDateTime, refundedCents } from './format';
import { dayHue, Field, Icon, IntInput, Pending, ThemeToggle } from './ui';
import { AccountMenu, SignInPrompt, useSession } from './auth';
import { useLoad } from './useLoad';
import { refundPolicyLines } from '../shared/refundPolicy';

/*
 * Rider purchase flow (product.md 2a). No real money moves: payment is either the simulated
 * button or Stripe test mode, whichever the server runs, and the wording follows that mode.
 * Demo labels show only for demo events.
 */

type Step = 'races' | 'details' | 'waiver' | 'review';
const STEPS: { key: Step; label: string }[] = [
  { key: 'races', label: 'Choose races' },
  { key: 'details', label: 'Racer details' },
  { key: 'waiver', label: 'Waiver' },
  { key: 'review', label: 'Review and payment' },
];

type Details = Omit<RiderDetails, 'racingAge' | 'licenseCategory' | 'licenseType' | 'competitionClass' | 'collegiateDivision'>;

interface Draft {
  step: Step;
  reached: number; // furthest step index completed
  profile: RiderProfile;
  selected: string[];
  bundleIntent: string | null;
  details: Details;
  waiver: { read: boolean; signatureName: string; agreed: boolean };
  orderId: string | null;
  clientRequestId: string;
  /** Exact submission and waiver text to recover after an uncertain response. */
  pendingReservation: { request: Parameters<typeof api.createOrder>[1]; waiverText: string } | null;
  /** Private link token from a waitlist offer; lets this rider take the reserved place. */
  offerToken?: string | null;
  offerCategoryId?: string | null;
  /** Answers to per-category questions and accepted category waiver addenda. */
  extras?: OrderExtras;
  /** Coupon the server accepted for this event; priced in the browser with the shared rule and re-checked when places are held. */
  coupon?: CouponTerms | null;
}

const EMPTY_PROFILE: RiderProfile = { racingAge: null, licenseCategory: null, licenseType: null, competitionClass: null, collegiateDivision: null };
const EMPTY_DETAILS: Details = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  team: '',
  licenseNumber: '',
  demoRiderId: null,
  emergencyContact: { name: '', phone: '' },
  guardian: null,
};

function freshDraft(): Draft {
  return {
    step: 'races',
    reached: 0,
    profile: EMPTY_PROFILE,
    selected: [],
    bundleIntent: null,
    details: EMPTY_DETAILS,
    waiver: { read: false, signatureName: '', agreed: false },
    orderId: null,
    clientRequestId: crypto.randomUUID(),
    pendingReservation: null,
  };
}

type Update = (fn: (d: Draft) => Draft) => void;

const draftKey = (eventId: string) => `cyclereg.register.${eventId}`;

/** Forgets the stored registration once its order no longer needs it. With `orderId`, only when the stored one is for that order. */
function clearStoredDraft(eventId: string, orderId?: string): void {
  try {
    const raw = sessionStorage.getItem(draftKey(eventId));
    if (raw && (!orderId || (JSON.parse(raw) as Draft).orderId === orderId)) sessionStorage.removeItem(draftKey(eventId));
  } catch {
    /* storage unavailable */
  }
}

/** Keeps an unfinished registration in this tab only, so a refresh or Back does not lose it. */
function useStoredDraft(eventId: string): [Draft, Update] {
  const key = draftKey(eventId);
  const [draft, setDraft] = useState<Draft>(() => {
    try {
      const raw = sessionStorage.getItem(key);
      if (raw) return { ...freshDraft(), ...(JSON.parse(raw) as Draft) };
    } catch {
      /* storage unavailable */
    }
    return freshDraft();
  });
  const update: Update = (fn) =>
    setDraft((d) => {
      const next = fn(d);
      try {
        sessionStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* storage unavailable */
      }
      return next;
    });
  return [draft, update];
}

/** Rider page header. The Demo badge shows only for a demo event; the note follows how payment works there. */
function RegHeader({ demo = false, mode = null }: { demo?: boolean; mode?: PaymentMode | null }) {
  return (
    <header className="reg__bar">
      <a className="brand" href={href({ page: 'events' })} aria-label="CycleReg, all events">
        CycleReg
      </a>
      {demo && <span className="demo-badge">Demo</span>}
      <span className="reg__bar-note">{mode === 'simulated' ? 'Rider registration with simulated payment' : mode === 'stripe_test' ? 'Rider registration, Stripe test mode' : 'Rider registration'}</span>
      <span className="reg__bar-end">
        <ThemeToggle />
        <AccountMenu />
      </span>
    </header>
  );
}

/** How payment works, in one line. Nothing shows when the mode is not known yet. */
function PaymentNote({ mode }: { mode: PaymentMode | null }) {
  if (!mode) return null;
  return <p className="simulated">{mode === 'stripe_test' ? 'Stripe test mode: only test cards work and no real money moves.' : 'Simulated payment: no money is charged.'}</p>;
}

/** Error summary at the top of a step; focuses itself so screen readers announce it. */
function ErrorSummary({ errors }: { errors: { id: string; message: string }[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (errors.length) ref.current?.focus();
  }, [errors]);
  if (errors.length === 0) return null;
  return (
    <div ref={ref} className="error-summary" role="alert" tabIndex={-1} aria-labelledby="error-summary-title">
      <h3 id="error-summary-title">
        Fix {errors.length === 1 ? 'this problem' : `these ${errors.length} problems`} to continue
      </h3>
      <ul>
        {errors.map((e) => (
          <li key={e.id + e.message}>
            <a
              href={`#${e.id}`}
              onClick={(ev) => {
                ev.preventDefault();
                document.getElementById(e.id)?.focus();
              }}
            >
              {e.message}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* Step 0: browse events --------------------------------------------------- */

export function RegisterIndex() {
  const { data: events, error } = useLoad<PublicEventSummary[]>(() => api.publicEvents(), []);
  return (
    <div className="reg">
      <RegHeader />
      <main className="reg__main reg__main--narrow">
        <h1 className="done__title">Choose an event</h1>
        <div className="pending-stack">
          <Pending>No real money moves here: payment is simulated or runs in Stripe test mode. Demo entries are fictional. Research examples are read-only and do not accept registrations.</Pending>
        </div>
        {error && <p className="alert alert--error">{error}</p>}
        {events === null && !error && <div className="skeleton" aria-label="Loading events" />}
        {events?.length === 0 && (
          <div className="empty">
            <p>No published events yet. Publish an event in the organizer workspace, or load a local demo using the setup guide.</p>
            <a className="btn btn--secondary" href="#/">
              Back to the home page
            </a>
          </div>
        )}
        <ul className="event-pick">
          {events?.map((e) => (
            <li key={e.id}>
              <a className="event-pick__link" href={href({ page: 'register', eventId: e.id })}>
                <span className="event-pick__name">
                  {e.name}
                  {e.researchOnly ? <span className="tag tag--demo">Research example</span> : e.isDemo && <span className="tag tag--demo">Demo data</span>}
                </span>
                <span className="event-pick__meta">
                  {e.researchOnly ? 'Read-only research' : e.days.map((d) => formatDate(d.date)).join(' and ')}
                  {e.venue ? ` · ${e.venue}` : ''}
                </span>
                <span className="event-pick__races">
                  {e.researchOnly ? 'Registration unavailable' : `${e.days.flatMap((d) => d.races).join(' · ')} · ${e.categoryCount} categories`}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}

/* The flow ---------------------------------------------------------------- */

export function Register({ eventId }: { eventId: string }) {
  const [ev, setEv] = useState<PublicEvent | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [draft, update] = useStoredDraft(eventId);

  const [offer, setOffer] = useState<WaitlistOffer | null>(null);
  const [offerError, setOfferError] = useState<string | null>(null);
  const session = useSession();
  const signedIn = session.status === 'signed-in';
  const offerToken = new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('offer');

  useEffect(() => {
    api.publicEvent(eventId).then(setEv).catch(setError);
  }, [eventId]);

  // A waitlist offer link (#/register/<event>?offer=<token>) preselects the offered category and prefills the rider.
  useEffect(() => {
    const token = offerToken;
    if (!token || !signedIn) return; // the offer holds the rider's details, so it opens after sign-in
    api
      .waitlistOffer(token)
      .then((o) => {
        if (o.eventId !== eventId) return;
        setOffer(o);
        if (o.status !== 'offered') return;
        update((d) => ({
          ...d,
          offerToken: token,
          offerCategoryId: o.categoryId,
          selected: d.selected.includes(o.categoryId) ? d.selected : [...d.selected, o.categoryId],
          profile: d.profile.racingAge === null ? profileOf(o.rider) : d.profile,
          details: d.details.firstName ? d.details : { ...d.details, firstName: o.rider.firstName, lastName: o.rider.lastName, email: o.rider.email },
        }));
      })
      .catch((e: ApiError) => setOfferError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, signedIn]);

  if (error) {
    return (
      <div className="reg">
        <RegHeader />
        <main className="reg__main reg__main--narrow">
          <p className="alert alert--warn" role="alert">
            {error.message}
          </p>
          <a className="btn btn--secondary" href={href({ page: 'events' })}>
            See all events
          </a>
        </main>
      </div>
    );
  }
  if (!ev) return <div className="state-page"><div className="skeleton skeleton--page" aria-label="Loading registration" /></div>;

  const { config } = ev;
  if (isResearchExample(config)) {
    return (
      <div className="reg">
        <RegHeader />
        <main className="reg__main reg__main--narrow">
          <h1 className="done__title">{config.event.name}</h1>
          <p className="muted">{config.event.venue}</p>
          <h2>Registration unavailable</h2>
          <p>{RESEARCH_REGISTRATION_MESSAGE}</p>
          <Pending>{config.event.demoNotice}</Pending>
          <a className="btn btn--secondary" href={href({ page: 'events' })}>Back to events</a>
        </main>
      </div>
    );
  }
  const stepIndex = STEPS.findIndex((s) => s.key === draft.step);

  /** Going back keeps everything entered. Leaving the review step releases the held places first. */
  const goTo = async (step: Step) => {
    if (draft.pendingReservation) return;
    if (draft.step === 'review' && draft.orderId) {
      try {
        await api.cancelOrder(draft.orderId);
      } catch {
        /* the hold expires on its own */
      }
      const latest = await api.publicEvent(eventId).catch(() => null);
      const changedWaiver = !latest || latest.config.registration.waiverVersion !== ev.config.registration.waiverVersion || latest.config.registration.waiverText !== ev.config.registration.waiverText;
      if (latest) setEv(latest);
      update((d) => ({ ...d, step, orderId: null, clientRequestId: crypto.randomUUID(), waiver: changedWaiver ? { ...d.waiver, read: false, agreed: false } : d.waiver }));
    } else update((d) => ({ ...d, step }));
  };

  return (
    <div className="reg">
      <RegHeader demo={config.event.isDemo} mode={ev.paymentMode} />
      <main className="reg__main">
        <section className="reg__event" aria-labelledby="reg-title">
          <a className="link small" href={href({ page: 'events' })}>
            All events
          </a>
          <h1 id="reg-title">{config.event.name}</h1>
          <p className="reg__meta">
            {config.days.map((d) => formatDate(d.date)).join(' and ')}
            {config.event.venue ? ` · ${config.event.venue}` : ''} · {ev.organizationName}
          </p>
          {config.event.isDemo && (
            <p className="demo-banner demo-banner--inline" role="note">
              <strong>Demo data.</strong> {config.event.demoNotice}
            </p>
          )}
          {offerError && (
            <p className="note note--warn" role="alert">
              {offerError}
            </p>
          )}
          {offer && <OfferBanner offer={offer} />}
          <div className="pending-stack">
            <Pending>
              {ev.paymentMode === 'stripe_test'
                ? 'Payment runs in Stripe test mode. Only Stripe test cards work and no real money moves.'
                : 'Payment is simulated. No card is asked for and no money is charged.'}
            </Pending>
            <Pending>USA Cycling license checks are not connected. Demo riders carry a simulated license result; everyone else is reviewed by the organizer.</Pending>
          </div>
        </section>

        {!signedIn && !offerToken && draft.step === 'races' && session.status !== 'loading' && (
          <p className="signin-early" role="note">
            <span>Sign in now so checkout is not interrupted later. You stay signed in on this device.</span>
            {session.status === 'unconfigured' ? (
              <span className="muted small">Sign-in is not set up on this computer.</span>
            ) : (
              <button type="button" className="btn btn--secondary btn--small" onClick={session.signIn}>
                Sign in with email
              </button>
            )}
          </p>
        )}
        <nav aria-label="Registration progress">
          <ol className="stepper">
            {STEPS.map((s, i) => {
              const current = i === stepIndex;
              const reachable = i < stepIndex || (i <= draft.reached && i !== stepIndex && s.key !== 'review');
              return (
                <li key={s.key} className={current ? 'is-current' : i < stepIndex ? 'is-done' : ''}>
                  {reachable ? (
                    <button className="stepper__btn" disabled={!!draft.pendingReservation} onClick={() => goTo(s.key)}>
                      <span className="stepper__num num" aria-hidden="true">
                        {i < stepIndex ? <Icon name="check" size={14} /> : i + 1}
                      </span>
                      {s.label}
                      <span className="sr-only"> (completed, go back)</span>
                    </button>
                  ) : (
                    <span aria-current={current ? 'step' : undefined} aria-disabled={!current || undefined}>
                      <span className="stepper__num num" aria-hidden="true">
                        {i + 1}
                      </span>
                      {s.label}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>

        {offerToken && !signedIn && draft.step === 'races' && (
          <SignInPrompt title="Sign in to use your waitlist offer">Sign in with the email you joined the waitlist with to see the place being held for you.</SignInPrompt>
        )}
        {draft.step === 'races' && <ChooseRaces ev={ev} draft={draft} update={update} />}
        {draft.step !== 'races' && !signedIn ? (
          <SignInPrompt title="Sign in to continue your registration">
            Your race choices are saved. Sign in with your email to enter your details, sign the waiver, and hold your places. Your registration is kept in your
            account.
          </SignInPrompt>
        ) : (
          <>
        {draft.step === 'details' && <DetailsStep config={config} draft={draft} update={update} goTo={goTo} />}
        {draft.step === 'waiver' && <Waiver ev={ev} draft={draft} update={update} goTo={goTo} setEvent={setEv} />}
        {draft.step === 'review' && draft.orderId && <Review orderId={draft.orderId} eventId={eventId} goTo={goTo} paymentMode={ev.paymentMode} />}
          </>
        )}
      </main>
    </div>
  );
}

/* Step 1: choose races ---------------------------------------------------- */

function ChooseRaces({ ev, draft, update }: { ev: PublicEvent; draft: Draft; update: Update }) {
  const { config } = ev;
  const [trayOpen, setTrayOpen] = useState(false);
  const [matchesOnly, setMatchesOnly] = useState(false);
  const scheduleRef = useRef<HTMLDivElement>(null);
  const [errors, setErrors] = useState<{ id: string; message: string }[]>([]);
  const checking = Object.values(draft.profile).some((v) => v !== null);
  const q = useMemo(() => quote(config, draft.selected, ev.today, draft.coupon ?? null, draft.profile), [config, draft.selected, ev.today, draft.coupon, draft.profile]);
  const conflicts = useMemo(() => findConflicts(config, draft.selected), [config, draft.selected]);
  const setProfile = (p: Partial<RiderProfile>) => {
    if (p.racingAge === null || p.licenseCategory === null) setMatchesOnly(false);
    update((d) => ({ ...d, profile: { ...d.profile, ...p } }));
  };
  const toggle = (id: string) => update((d) => ({ ...d, selected: d.selected.includes(id) ? d.selected.filter((x) => x !== id) : [...d.selected, id] }));
  const result = (cat: Category): EligibilityResult | null => (checking ? evaluateCategory(cat, draft.profile) : null);
  const matchesReady = draft.profile.racingAge !== null && draft.profile.licenseCategory !== null;
  const matching = matchesOnly && matchesReady;
  const matchingCount = config.categories.filter((cat) => cat.status !== 'archived' && result(cat)?.status === 'eligible').length;
  const visible = (cat: Category) => !matching || result(cat)?.status === 'eligible' || draft.selected.includes(cat.id) || draft.offerCategoryId === cat.id;
  const findMyRaces = () => {
    setMatchesOnly(true);
    scheduleRef.current?.focus();
    scheduleRef.current?.scrollIntoView({ block: 'start' });
  };
  const intent = config.registration.bundles.find((b) => b.id === draft.bundleIntent) ?? null;
  const selectedRaces = new Set(draft.selected.map((id) => config.categories.find((c) => c.id === id)?.raceId));
  const intentMissing = intent ? intent.raceIds.filter((r) => !selectedRaces.has(r)) : [];

  const applyDemoRider = (id: string) => {
    const r = DEMO_RIDERS.find((x) => x.id === id);
    if (!r) {
      setMatchesOnly(false);
      return update((d) => ({ ...d, profile: EMPTY_PROFILE, details: EMPTY_DETAILS }));
    }
    update((d) => ({
      ...d,
      profile: { racingAge: r.racingAge, licenseCategory: r.licenseCategory, licenseType: 'annual', competitionClass: r.competitionClass, collegiateDivision: null },
      details: {
        firstName: r.firstName,
        lastName: r.lastName,
        email: r.email,
        phone: r.phone,
        team: r.team,
        licenseNumber: r.licenseNumber,
        demoRiderId: r.id,
        emergencyContact: { ...r.emergencyContact },
        guardian: r.guardian ? { ...r.guardian } : null,
      },
    }));
  };

  const next = () => {
    const errs: { id: string; message: string }[] = [];
    if (draft.profile.racingAge === null) errs.push({ id: 'f-racing-age', message: 'Enter your racing age.' });
    // The same gate the server applies to the order: eligibility, closed categories, registration windows, and start conflicts.
    const check = checkSelection(config, draft.selected, draft.profile, { nowLocal: ev.nowLocal });
    // The shared rule gives each problem in words. The summary also links each one to the race it is about.
    const anchor = (message: string) => {
      const named = draft.selected.find((sel) => {
        const name = config.categories.find((c) => c.id === sel)?.name;
        return !!name && message.includes(name);
      });
      const id = check.conflicts.find((c) => c.message === message)?.b ?? named;
      return id ? `opt-${id}` : 'schedule';
    };
    for (const message of check.problems) errs.push({ id: anchor(message), message });
    // Places left and waitlist offers are live counts the shared rule does not see.
    for (const id of draft.selected) {
      const cat = config.categories.find((c) => c.id === id);
      // A waitlist offer reserves this rider's place, so its category is not full for them.
      const offeredHere = !!draft.offerToken && draft.offerCategoryId === id;
      if (cat && ev.remaining[id] === 0 && !offeredHere) errs.push({ id: `opt-${id}`, message: `${cat.name}: ${MESSAGES.full}` });
    }
    if (intent && intentMissing.length) {
      errs.push({ id: 'tray-title', message: `The ${intent.name} needs one eligible race on each day. Add a race in ${intentMissing.map((r) => config.races.find((x) => x.id === r)?.name).join(' and ')}.` });
    }
    if (q.coupon?.unappliedReason) errs.push({ id: 'f-coupon', message: `${q.coupon.unappliedReason} Remove the code or change your races.` });
    setErrors(errs);
    if (errs.length === 0) update((d) => ({ ...d, step: 'details', reached: Math.max(d.reached, 1) }));
  };

  return (
    <div className="reg__grid">
      <div className="reg__col">
        <ErrorSummary errors={errors} />
        <WindowBanner ev={ev} />
        <section className="about" aria-labelledby="about-title">
          <h2 id="about-title">About you</h2>
          <p className="muted">Use your details to find matching races, or browse the full schedule.</p>
          <Field label="Use a demo rider (fake data)" id="f-demo-rider" className="about__demo">
            {(id) => (
              <select id={id} className="input" value={draft.details.demoRiderId ?? ''} onChange={(e) => applyDemoRider(e.target.value)}>
                <option value="">None, I’ll enter my own made-up details</option>
                {DEMO_RIDERS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.firstName} {r.lastName}: racing age {r.racingAge}, {licenseLabel(r.licenseCategory)}, {r.competitionClass}
                    {r.guardian ? ', with guardian' : ''}
                    {r.licenseCheck === 'simulated_unknown' ? ', license not verified' : ''}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <div className="about__fields">
            <Field label="Racing age" id="f-racing-age">
              {(id) => <IntInput id={id} value={draft.profile.racingAge} min={5} max={110} onCommit={(v) => setProfile({ racingAge: v })} />}
            </Field>
            <Field label="License category">
              {(id) => (
                <select id={id} className="input" value={draft.profile.licenseCategory ?? ''} onChange={(e) => setProfile({ licenseCategory: (e.target.value || null) as RiderProfile['licenseCategory'] })}>
                  <option value="">I don’t know</option>
                  {LICENSE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {licenseLabel(c)}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label="Competition class">
              {(id) => (
                <select id={id} className="input" value={draft.profile.competitionClass ?? ''} onChange={(e) => setProfile({ competitionClass: (e.target.value || null) as RiderProfile['competitionClass'] })}>
                  <option value="">Prefer not to say</option>
                  <option value="women">Women</option>
                  <option value="men">Men</option>
                  <option value="other">Other (organizer confirms)</option>
                </select>
              )}
            </Field>
            <Field label="Collegiate racer?">
              {(id) => (
                <select id={id} className="input" value={draft.profile.collegiateDivision ?? ''} onChange={(e) => setProfile({ collegiateDivision: (e.target.value || null) as RiderProfile['collegiateDivision'] })}>
                  <option value="">No</option>
                  {COLLEGIATE_DIVISIONS.map((d) => (
                    <option key={d} value={d}>
                      Yes, division {d}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </div>
          <p className="muted small">Racing age is the age your federation uses for the season. It is not calculated from a birth date yet.</p>
          <div className="race-finder">
            <button className="btn btn--secondary" disabled={!matchesReady} aria-describedby="race-finder-hint" onClick={findMyRaces}>Find my races</button>
            <p id="race-finder-hint" className="small muted">{matchesReady ? `${matchingCount} matching categories based on your answers.` : 'Enter your racing age and license category to find matches.'}</p>
          </div>
        </section>

        {config.registration.bundles.filter((b) => b.omnium && b.priceCents !== null).map((bundle) => {
          const rates = packageRates(config, bundle);
          if (rates.length === 0) return null;
          return (
            <section key={bundle.id} className="package-pricing" aria-labelledby={`pricing-${bundle.id}`}>
              <h2 id={`pricing-${bundle.id}`}>Omnium pricing</h2>
              <p>One entry in each race: {bundle.raceIds.map((id) => config.races.find((r) => r.id === id)?.name).join(' and ')}.</p>
              <table className="package-pricing__table">
                <caption className="sr-only">Omnium package prices</caption>
                <thead><tr><th scope="col">Rider rate</th><th scope="col">Package price</th></tr></thead>
                <tbody>
                  {rates.map((rate) => <tr key={rate.eligibility.id}><th scope="row">{rate.eligibility.label || summarizePath(rate.eligibility)}</th><td className="num">{formatCents(rate.bundlePriceCents)}</td></tr>)}
                  <tr><th scope="row">Standard</th><td className="num">{formatCents(bundle.priceCents!)}</td></tr>
                </tbody>
              </table>
              <p className="small"><strong>Your lowest eligible price applies automatically.</strong> Your rider details and race categories determine your rate. {rates.some((r) => r.categoryGenderClass === 'women') && 'Women’s pricing applies to women’s race categories.'}</p>
            </section>
          );
        })}

        <div id="schedule" ref={scheduleRef} tabIndex={-1} className="schedule-anchor">
          <div className="schedule-tools">
            <h2>{matching ? 'Your matching races' : 'Race schedule'}</h2>
            <div className="schedule-tools__views" role="group" aria-label="Schedule view">
              <button className={`btn btn--small ${matching ? 'btn--ghost' : 'btn--primary'}`} aria-pressed={!matching} onClick={() => setMatchesOnly(false)}>All races</button>
              <button className={`btn btn--small ${matching ? 'btn--primary' : 'btn--ghost'}`} aria-pressed={matching} disabled={!matchesReady} onClick={() => setMatchesOnly(true)}>Matching races</button>
            </div>
          </div>
          <p className={matching ? 'small' : 'sr-only'} role="status">{matching ? `${matchingCount === 0 ? 'No categories match your current answers.' : `${matchingCount} categories match your answers.`} Selected entries stay visible. For races that need more details or organizer review, choose All races.` : ''}</p>
          {config.days.map((day, di) => (
            <section key={day.id} className="sched-day" style={{ ['--day' as string]: dayHue(di) }} aria-labelledby={`day-${day.id}`}>
              <h2 className="sched-day__title" id={`day-${day.id}`}>
                {day.label} <span>{formatDate(day.date)}</span>
              </h2>
              {config.races
                .filter((r) => r.dayId === day.id)
                .map((race) => {
                  const groups = [...config.startGroups.filter((g) => g.raceId === race.id)].sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''));
                  return (
                    <div key={race.id} className="sched-race">
                      <h3 className="sched-race__title">
                        {race.name}
                        {race.course && <span>{race.course}</span>}
                      </h3>
                      {matching && !config.categories.some((cat) => cat.raceId === race.id && cat.status !== 'archived' && cat.startGroupId !== null && visible(cat)) && <p className="muted small">No matching categories in this race. Choose All races to review the full schedule.</p>}
                      <ol className="sched-list">
                        {groups.map((sg) => {
                          const allCats = sortCategories(config.categories.filter((c) => c.startGroupId === sg.id && c.status !== 'archived'));
                          const cats = allCats.filter(visible);
                          if (cats.length === 0) return null;
                          return (
                            <li key={sg.id} className="start">
                              <div className="start__time">
                                <span className="num">{formatTime(sg.startTime)}</span>
                                {sg.stagingTime && <span className="start__staging">Staging {formatTime(sg.stagingTime)}</span>}
                              </div>
                              <div className="start__cats">
                                {allCats.length > 1 && (
                                  <p className="start__shared">
                                    <Icon name="clip" size={14} /> {allCats.length} categories start together and are scored separately. Choose one category.
                                  </p>
                                )}
                                {cats.map((cat) => (
                                  <RaceOption
                                    key={cat.id}
                                    config={config}
                                    cat={cat}
                                    today={ev.today}
                                    profile={draft.profile}
                                    selected={draft.selected.includes(cat.id)}
                                    remaining={ev.remaining[cat.id] ?? null}
                                    window={windowState(cat, ev.nowLocal)}
                                    enforceWindows={ev.enforceWindows}
                                    result={result(cat)}
                                    conflicts={draft.selected.includes(cat.id) ? conflicts.filter((c) => c.a === cat.id || c.b === cat.id) : []}
                                    onToggle={() => toggle(cat.id)}
                                    offered={!!draft.offerToken && draft.offerCategoryId === cat.id}
                                    waitlist={ev.waitlist?.[cat.id] ? <JoinWaitlist ev={ev} cat={cat} draft={draft} /> : null}
                                  />
                                ))}
                              </div>
                            </li>
                          );
                        })}
                      </ol>
                    </div>
                  );
                })}
            </section>
          ))}
        </div>
      </div>

      <aside className={`tray ${trayOpen ? 'is-open' : ''}`} aria-labelledby="tray-title">
        <button className="tray__toggle" aria-expanded={trayOpen} onClick={() => setTrayOpen(!trayOpen)}>
          <span>
            <span className="num">{draft.selected.length}</span> {draft.selected.length === 1 ? 'race' : 'races'}
          </span>
          <span className="num tray__toggle-total">{formatCents(q.totalCents)}</span>
          <span className="tray__toggle-label">{trayOpen ? 'Hide' : 'View'}</span>
        </button>
        <div className="tray__body">
          <h2 id="tray-title" className="tray__title" tabIndex={-1}>
            Your entries
          </h2>
          {config.registration.bundles.map((b) => (
            <div key={b.id} className={`bundle-pick ${draft.bundleIntent === b.id ? 'is-on' : ''}`}>
              <label className="check">
                <input type="checkbox" checked={draft.bundleIntent === b.id} onChange={(e) => update((d) => ({ ...d, bundleIntent: e.target.checked ? b.id : null }))} />
                <span>
                  I want the <strong>{b.name}</strong> ({b.priceCents !== null ? packageRates(config, b).length ? 'one entry per race; see the Omnium pricing comparison' : `${formatCents(b.priceCents)} for one race each day` : `save ${formatCents(b.discountCents)}`})
                </span>
              </label>
              {draft.bundleIntent === b.id && intentMissing.length > 0 && (
                <p className="small text-warn">Choose one eligible race in {intentMissing.map((r) => config.races.find((x) => x.id === r)?.name).join(' and ')}.</p>
              )}
            </div>
          ))}
          {draft.selected.length === 0 ? (
            <p className="muted small">Pick a race to add it here. Prices, discounts, fees, and the total update as you go.</p>
          ) : (
            <QuoteTable q={q} raceName={(id) => config.races.find((r) => r.id === id)?.name ?? ''} onRemove={(id) => toggle(id)} />
          )}
          <BundleHint config={config} selected={draft.selected} q={q} />
          {draft.selected.length > 0 && <CouponField eventId={ev.eventId} draft={draft} update={update} q={q} />}
          <button className="btn btn--primary tray__cta" onClick={next}>
            Continue to racer details
          </button>
          {refundPolicyLines(config).length > 0 && (
            <details className="tray__policy">
              <summary>Refund policy</summary>
              <RefundLines lines={refundPolicyLines(config)} />
            </details>
          )}
        </div>
      </aside>
    </div>
  );
}

function RaceOption({
  profile,
  config,
  cat,
  today,
  selected,
  remaining,
  window,
  enforceWindows,
  result,
  conflicts,
  onToggle,
  offered,
  waitlist,
}: {
  config: EventConfig;
  profile: RiderProfile;
  cat: Category;
  offered: boolean;
  waitlist: ReactNode;
  today: string;
  selected: boolean;
  remaining: number | null;
  window: WindowState;
  enforceWindows: boolean;
  result: EligibilityResult | null;
  conflicts: ReturnType<typeof findConflicts>;
  onToggle: () => void;
}) {
  const price = quote(config, [cat.id], today, null, profile).lines[0];
  // A waitlist offer reserves this rider's place, so the category is open to them even when it reads as full.
  const full = remaining === 0 && !offered;
  const outside = enforceWindows && window !== 'open';
  const closed = cat.status !== 'active';
  const disabled = !selected && (full || closed || outside || result?.status === 'ineligible');
  const status = closed
    ? { cls: 'muted', text: 'Closed' }
    : outside && window === 'not_yet'
      ? { cls: 'muted', text: `Opens ${formatLocalDateTime(cat.registration.opensAt!)}` }
      : outside
        ? { cls: 'muted', text: 'Registration closed' }
    : offered
      ? { cls: 'eligible', text: 'Place offered to you' }
    : full
      ? { cls: 'muted', text: waitlist ? 'Full · waitlist' : 'Full' }
      : result?.status === 'ineligible'
        ? { cls: 'ineligible', text: 'Not eligible' }
        : result?.status === 'needs_review'
          ? { cls: 'needs_review', text: 'Organizer review' }
          : result
            ? { cls: 'eligible', text: 'You qualify' }
            : null;
  return (
    <div className={`opt ${selected ? 'is-selected' : ''} ${disabled ? 'is-disabled' : ''}`}>
      <button id={`opt-${cat.id}`} className="opt__main" role="checkbox" aria-checked={selected} aria-disabled={disabled || undefined} onClick={() => !disabled && onToggle()} aria-describedby={`opt-${cat.id}-why`}>
        <span className="opt__box" aria-hidden="true">
          {selected && <Icon name="check" size={14} />}
        </span>
        <span className="opt__text">
          <span className="opt__name">
            <code className="code">{cat.classifications[0]?.code || cat.timingCode}</code>
            {cat.name}
          </span>
          <span className="opt__elig">{summarizeEligibility(cat)}</span>
          <span className="opt__facts">
            {formatLength(cat.length)} · {offered ? 'Your place is held' : remaining === null ? 'Places open' : full ? 'No places left' : `${remaining} places left`}
          </span>
        </span>
        <span className="opt__price num">
          {formatCents(price.priceCents)}
          {price.dayOfSurcharge && <span className="opt__sub">incl. race-day fee</span>}
        </span>
      </button>
      <div className="opt__status" id={`opt-${cat.id}-why`}>
        {status && <span className={`status status--${status.cls}`}>{status.text}</span>}
        {full && !waitlist && <span className="opt__reason">{MESSAGES.full}</span>}
        {full && waitlist}
        {!outside && cat.registration.closesAt && window === 'open' && <span className="opt__reason">Registration closes {formatLocalDateTime(cat.registration.closesAt)}</span>}
        {result && result.status === 'ineligible' && <span className="opt__reason">{result.reasons.join('; ')}</span>}
        {result && result.status === 'needs_review' && <span className="opt__reason">{result.reasons.join('; ')}</span>}
        {cat.eligibility.guardianRequired && <span className="opt__reason">A parent or guardian signs for this entry.</span>}
        {conflicts.map((c) => (
          <span key={`${c.a}-${c.b}`} className={`opt__reason ${c.level === 'block' ? 'text-error' : 'text-warn'}`}>
            {c.message}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Explains when windows apply, and says plainly when a demo lets testers register outside them. */
function WindowBanner({ ev }: { ev: PublicEvent }) {
  const cats = ev.config.categories.filter((c) => c.status === 'active');
  const outside = cats.filter((c) => windowState(c, ev.nowLocal) !== 'open');
  if (outside.length === 0) return null;
  const opens = cats.map((c) => c.registration.opensAt).filter((x): x is string => !!x).sort()[0];
  const tz = ev.config.event.timeZone;
  if (!ev.enforceWindows) {
    return (
      <p className="note note--warn" role="note">
        <strong>Demo mode:</strong> {opens && ev.nowLocal < opens ? `registration for this event opens ${formatLocalDateTime(opens)} (${tz})` : 'some registration windows are not open right now'}. This demo lets you try it anyway. A real event refuses entries outside each category’s window.
      </p>
    );
  }
  return (
    <p className="note" role="note">
      {outside.length === cats.length
        ? opens && ev.nowLocal < opens
          ? `Registration opens ${formatLocalDateTime(opens)} (${tz}).`
          : 'Registration is closed for every category.'
        : `${outside.length} of ${cats.length} categories are outside their registration window right now.`}
    </p>
  );
}

/** The event's refund rules and notes, one sentence per line. */
function RefundLines({ lines }: { lines: string[] }) {
  return (
    <ul className="tray__policy-lines">
      {lines.map((l) => (
        <li key={l}>{l}</li>
      ))}
    </ul>
  );
}

function QuoteTable({ q, raceName, onRemove }: { q: Quote; raceName: (raceId: string) => string; onRemove?: (id: string) => void }) {
  return (
    <div className="quote">
      <ul className="quote__lines">
        {q.lines.map((l) => (
          <li key={l.categoryId} className="quote__line">
            <span className="quote__tag">
              <code className="code">{l.code}</code>
              <span>
                {l.name}
                <span className="quote__race">{raceName(l.raceId)}</span>
              </span>
            </span>
            <span className="num">{formatCents(l.priceCents)}</span>
            {onRemove && (
              <button className="icon-btn" aria-label={`Remove ${l.name}`} onClick={() => onRemove(l.categoryId)}>
                <Icon name="trash" size={14} />
              </button>
            )}
            {l.discountCents > 0 && (
              <span className="quote__discount">
                {l.discountReason} <span className="num">−{formatCents(l.discountCents)}</span>
              </span>
            )}
          </li>
        ))}
      </ul>
      {q.fees.length > 0 && (
        <ul className="quote__fees">
          {q.fees.map((f) => (
            <li key={f.key}>
              <span>{f.label}</span>
              <span className="num">{formatCents(f.cents)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="quote__total">
        <span>Total</span>
        <span className="num">{formatCents(q.totalCents)}</span>
      </p>
      {q.discountCents > 0 && <p className="quote__saved">You save {formatCents(q.discountCents)}. Each entry gets at most one discount.</p>}
    </div>
  );
}

/** One coupon code per order. The server checks the code; the shared pricing rule shows its effect here. */
function CouponField({ eventId, draft, update, q }: { eventId: string; draft: Draft; update: Update; q: Quote }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const applied = draft.coupon ?? null;
  const session = useSession();
  const apply = async (e: FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return setError('Enter a code.');
    setBusy(true);
    setError(null);
    try {
      const terms = await api.checkCoupon(eventId, code.trim());
      update((d) => ({ ...d, coupon: terms }));
      setCode('');
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  };
  if (applied) {
    const warn = q.coupon?.unappliedReason;
    return (
      <div className="coupon" id="f-coupon" tabIndex={-1}>
        <p className="coupon__applied">
          <span>
            Code <code className="code">{applied.code}</code> · {applied.kind === 'percent' ? `${applied.percent}% off eligible entries` : `${formatCents(applied.amountCents)} off eligible entries`}
          </span>
          <button className="btn btn--ghost btn--small" onClick={() => update((d) => ({ ...d, coupon: null }))}>
            Remove
          </button>
        </p>
        {warn ? (
          <p className="small text-warn" role="status">
            {warn}
          </p>
        ) : (
          <p className="muted small">A coupon only applies to entries without another discount.</p>
        )}
      </div>
    );
  }
  // Codes are checked only for signed-in riders, so they cannot be guessed anonymously.
  if (session.status !== 'signed-in') {
    return (
      <p className="coupon muted small">
        Have a coupon code?{' '}
        <button type="button" className="link-btn" onClick={session.signIn}>
          Sign in to use it
        </button>
      </p>
    );
  }
  return (
    <form className="coupon" onSubmit={apply} noValidate>
      <Field label="Coupon code" id="f-coupon" error={error ?? undefined}>
        {(id, describedBy) => (
          <span className="coupon__row">
            <input
              id={id}
              className="input"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              value={code}
              aria-invalid={!!error}
              aria-describedby={describedBy}
              onChange={(e) => setCode(e.target.value)}
            />
            <button className="btn btn--secondary" type="submit" disabled={busy}>
              {busy ? 'Checking…' : 'Apply'}
            </button>
          </span>
        )}
      </Field>
    </form>
  );
}

function packageRates(config: EventConfig, bundle: Bundle) {
  if (!bundle.omnium || bundle.priceCents === null) return [];
  return (config.registration.riderRates ?? []).filter((rate) => bundle.raceIds.every((id) => rate.racePrices.some((price) => price.raceId === id)));
}

function BundleHint({ config, selected, q }: { config: EventConfig; selected: string[]; q: Quote }) {
  if (q.bundle || selected.length === 0) return null;
  const races = new Set(selected.map((id) => config.categories.find((c) => c.id === id)?.raceId));
  const near = config.registration.bundles.find((b) => b.raceIds.some((r) => races.has(r)) && b.raceIds.some((r) => !races.has(r)));
  if (!near) return null;
  const missing = near.raceIds.filter((r) => !races.has(r)).map((r) => config.races.find((x) => x.id === r)?.name ?? 'another race');
  return (
    <p className="note">
      Add an entry in {missing.join(' and ')} to get the {near.name}
      {near.priceCents !== null ? packageRates(config, near).length ? ' at your lowest eligible rate in the Omnium pricing comparison' : ` for ${formatCents(near.priceCents)}` : ` and save ${formatCents(near.discountCents)}`}.
    </p>
  );
}

/* Step 2: racer details --------------------------------------------------- */

const FIELD_IDS: Record<string, string> = {
  firstName: 'f-first-name',
  lastName: 'f-last-name',
  email: 'f-email',
  phone: 'f-phone',
  'emergencyContact.name': 'f-ec-name',
  'emergencyContact.phone': 'f-ec-phone',
  'guardian.name': 'f-g-name',
  'guardian.email': 'f-g-email',
  'guardian.phone': 'f-g-phone',
};

function riderFrom(draft: Draft, needsGuardian: boolean): Record<string, unknown> {
  return {
    ...draft.details,
    ...draft.profile,
    racingAge: draft.profile.racingAge ?? -1,
    guardian: needsGuardian ? (draft.details.guardian ?? { name: '', relationship: '', email: '', phone: '' }) : null,
  };
}

function DetailsStep({ config, draft, update, goTo }: { config: EventConfig; draft: Draft; update: Update; goTo: (s: Step) => void }) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const needsGuardian = guardianNeeded(config, draft.selected, draft.profile.racingAge);
  const d = draft.details;
  const set = (p: Partial<Details>) => update((x) => ({ ...x, details: { ...x.details, ...p } }));
  const g = d.guardian ?? { name: '', relationship: '', email: '', phone: '' };
  const setG = (p: Partial<typeof g>) => set({ guardian: { ...g, ...p } });

  const extras = draft.extras ?? EMPTY_EXTRAS;
  const questionCats = draft.selected.map((id) => config.categories.find((c) => c.id === id)).filter((c): c is NonNullable<typeof c> => !!c && (c.questions ?? []).length > 0);
  const setAnswer = (catId: string, qId: string, value: string) =>
    update((x) => {
      const ex = x.extras ?? EMPTY_EXTRAS;
      return { ...x, extras: { ...ex, answers: { ...ex.answers, [catId]: { ...(ex.answers[catId] ?? {}), [qId]: value } } } };
    });

  const submit = () => {
    const parsed = riderDetailsSchema.safeParse(riderFrom(draft, needsGuardian));
    const errs: Record<string, string> = {};
    if (!parsed.success) {
      for (const i of parsed.error.issues) {
        const k = i.path.join('.');
        if (!errs[k]) errs[k] = i.message;
      }
    }
    for (const p of checkExtras(config, draft.selected, extras).filter((x) => x.field.startsWith('q-'))) if (!errs[p.field]) errs[p.field] = p.message;
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setErrors({});
    update((x) => ({ ...x, step: 'waiver', reached: Math.max(x.reached, 2) }));
  };

  const summary = useMemo(() => Object.entries(errors).map(([k, message]) => ({ id: FIELD_IDS[k] ?? (k.startsWith('q-') ? k : 'f-first-name'), message })), [errors]);

  return (
    <form
      className="reg__panel"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <ErrorSummary errors={summary} />
      <h2>Racer details</h2>
      <p className="muted">Entered once for every race in this order. Required fields are marked.</p>
      {d.demoRiderId && <p className="note">Prefilled from a demo rider. These details are fictional fixtures.</p>}
      <div className="form-row">
        <Field label="First name (required)" id={FIELD_IDS.firstName} error={errors.firstName}>
          {(id, dsc) => <input id={id} aria-describedby={dsc} aria-invalid={!!errors.firstName || undefined} className="input" autoComplete="given-name" value={d.firstName} onChange={(e) => set({ firstName: e.target.value })} />}
        </Field>
        <Field label="Last name (required)" id={FIELD_IDS.lastName} error={errors.lastName}>
          {(id, dsc) => <input id={id} aria-describedby={dsc} aria-invalid={!!errors.lastName || undefined} className="input" autoComplete="family-name" value={d.lastName} onChange={(e) => set({ lastName: e.target.value })} />}
        </Field>
      </div>
      <div className="form-row">
        <Field label={needsGuardian ? 'Rider email (optional for a minor)' : 'Email for the receipt (required)'} id={FIELD_IDS.email} error={errors.email} hint="No email is sent yet.">
          {(id, dsc) => <input id={id} aria-describedby={dsc} aria-invalid={!!errors.email || undefined} type="email" className="input" autoComplete="email" value={d.email} onChange={(e) => set({ email: e.target.value })} />}
        </Field>
        <Field label="Phone (optional)" id={FIELD_IDS.phone} error={errors.phone}>
          {(id, dsc) => <input id={id} aria-describedby={dsc} aria-invalid={!!errors.phone || undefined} type="tel" className="input" autoComplete="tel" value={d.phone} onChange={(e) => set({ phone: e.target.value })} />}
        </Field>
      </div>
      <div className="form-row">
        <Field label="Team (optional)">{(id) => <input id={id} className="input" value={d.team} onChange={(e) => set({ team: e.target.value })} />}</Field>
        <Field label="License number (optional)" hint="Not checked against USA Cycling.">
          {(id, dsc) => <input id={id} aria-describedby={dsc} className="input input--code" value={d.licenseNumber} onChange={(e) => set({ licenseNumber: e.target.value })} />}
        </Field>
      </div>
      {questionCats.map((cat) => (
        <fieldset className="subfields" key={cat.id}>
          <legend>Questions for {cat.name}</legend>
          {(cat.questions ?? []).map((q) => {
            const fid = `q-${cat.id}-${q.id}`;
            const value = extras.answers[cat.id]?.[q.id] ?? '';
            return (
              <Field key={q.id} label={`${q.label}${q.required ? ' (required)' : ' (optional)'}`} id={fid} error={errors[fid]}>
                {(id, dsc) =>
                  q.options.length > 0 ? (
                    <select id={id} aria-describedby={dsc} aria-invalid={!!errors[fid] || undefined} className="input" value={value} onChange={(e) => setAnswer(cat.id, q.id, e.target.value)}>
                      <option value="">Choose…</option>
                      {q.options.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input id={id} aria-describedby={dsc} aria-invalid={!!errors[fid] || undefined} className="input" maxLength={500} value={value} onChange={(e) => setAnswer(cat.id, q.id, e.target.value)} />
                  )
                }
              </Field>
            );
          })}
        </fieldset>
      ))}
      <div className="summary-line">
        <p>
          Racing age <strong className="num">{draft.profile.racingAge}</strong> · License{' '}
          <strong>{draft.profile.licenseCategory ? licenseLabel(draft.profile.licenseCategory) : 'not known'}</strong>
        </p>
        <button type="button" className="link-btn" onClick={() => goTo('races')}>
          Change
        </button>
      </div>
      <fieldset className="subfields guardian">
        <legend>Emergency contact (required)</legend>
        <p className="muted small">Kept separate and shown only to people who need it on race day.</p>
        <div className="form-row">
          <Field label="Contact name" id={FIELD_IDS['emergencyContact.name']} error={errors['emergencyContact.name']}>
            {(id, dsc) => <input id={id} aria-describedby={dsc} aria-invalid={!!errors['emergencyContact.name'] || undefined} className="input" value={d.emergencyContact.name} onChange={(e) => set({ emergencyContact: { ...d.emergencyContact, name: e.target.value } })} />}
          </Field>
          <Field label="Contact phone" id={FIELD_IDS['emergencyContact.phone']} error={errors['emergencyContact.phone']}>
            {(id, dsc) => <input id={id} aria-describedby={dsc} aria-invalid={!!errors['emergencyContact.phone'] || undefined} type="tel" className="input" value={d.emergencyContact.phone} onChange={(e) => set({ emergencyContact: { ...d.emergencyContact, phone: e.target.value } })} />}
          </Field>
        </div>
      </fieldset>
      {needsGuardian && (
        <fieldset className="subfields guardian">
          <legend>Parent or guardian (required)</legend>
          <p className="muted small">The rider's racing age is 18 or under, or a junior entry is in this order, so a parent or guardian signs the waiver for the rider.</p>
          <div className="form-row">
            <Field label="Guardian name" id={FIELD_IDS['guardian.name']} error={errors['guardian.name']}>
              {(id, dsc) => <input id={id} aria-describedby={dsc} aria-invalid={!!errors['guardian.name'] || undefined} className="input" value={g.name} onChange={(e) => setG({ name: e.target.value })} />}
            </Field>
            <Field label="Relationship (optional)">{(id) => <input id={id} className="input" placeholder="Parent, legal guardian" value={g.relationship} onChange={(e) => setG({ relationship: e.target.value })} />}</Field>
          </div>
          <div className="form-row">
            <Field label="Guardian email" id={FIELD_IDS['guardian.email']} error={errors['guardian.email']}>
              {(id, dsc) => <input id={id} aria-describedby={dsc} aria-invalid={!!errors['guardian.email'] || undefined} type="email" className="input" value={g.email} onChange={(e) => setG({ email: e.target.value })} />}
            </Field>
            <Field label="Guardian phone (optional)" id={FIELD_IDS['guardian.phone']} error={errors['guardian.phone']}>
              {(id, dsc) => <input id={id} aria-describedby={dsc} aria-invalid={!!errors['guardian.phone'] || undefined} type="tel" className="input" value={g.phone} onChange={(e) => setG({ phone: e.target.value })} />}
            </Field>
          </div>
        </fieldset>
      )}
      <div className="form-actions">
        <button type="button" className="btn btn--ghost" onClick={() => goTo('races')}>
          <Icon name="arrow-left" /> Back to races
        </button>
        <button className="btn btn--primary" type="submit">
          Continue to the waiver
        </button>
      </div>
    </form>
  );
}

/* Step 3: waiver, typed signature, then hold places ----------------------- */

function Waiver({ ev, draft, update, goTo, setEvent }: { ev: PublicEvent; draft: Draft; update: Update; goTo: (s: Step) => void; setEvent: (event: PublicEvent) => void }) {
  const { config } = ev;
  const pending = draft.pendingReservation;
  const needsGuardian = pending ? pending.request.waiver.signerRole === 'guardian' : guardianNeeded(config, draft.selected, draft.profile.racingAge);
  const signer = needsGuardian ? (draft.details.guardian?.name ?? '') : `${draft.details.firstName} ${draft.details.lastName}`.trim();
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<{ id: string; message: string }[]>([]);
  const w = draft.waiver;
  const setW = (p: Partial<Draft['waiver']>) => update((x) => ({ ...x, waiver: { ...x.waiver, ...p } }));
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = boxRef.current;
    if (el && el.scrollHeight <= el.clientHeight + 4) setW({ read: true }); // nothing to scroll
  }, []);

  const extras = draft.extras ?? EMPTY_EXTRAS;
  const addendumCats = pending ? [] : draft.selected.map((id) => config.categories.find((c) => c.id === id)).filter((c): c is NonNullable<typeof c> => !!c?.addendum);
  const toggleAddendum = (catId: string, on: boolean) =>
    update((x) => {
      const ex = x.extras ?? EMPTY_EXTRAS;
      return { ...x, extras: { ...ex, addenda: on ? [...new Set([...ex.addenda, catId])] : ex.addenda.filter((a) => a !== catId) } };
    });

  const hold = async () => {
    if (busy) return;
    // Recovery must reach server idempotency before validating newly published requirements.
    if (!pending) {
      const errs: { id: string; message: string }[] = [];
      for (const p of checkExtras(config, draft.selected, extras).filter((x) => x.field.startsWith('addendum-'))) errs.push({ id: p.field, message: p.message });
      if (!w.read) errs.push({ id: 'f-waiver-read', message: MESSAGES.waiverRead });
      if (!w.signatureName.trim()) errs.push({ id: 'f-signature', message: MESSAGES.waiverSignature });
      else if (checkSignature(draft.details, { signatureName: w.signatureName, signerRole: needsGuardian ? 'guardian' : 'rider' }, needsGuardian)) errs.push({ id: 'f-signature', message: MESSAGES.signatureMismatch });
      if (!w.agreed) errs.push({ id: 'f-agree', message: MESSAGES.waiverAgree });
      setErrors(errs);
      if (errs.length) return;
    } else setErrors([]);
    const submission = pending ?? {
      request: {
        clientRequestId: draft.clientRequestId,
        categoryIds: draft.selected,
        rider: riderFrom(draft, needsGuardian) as RiderDetails,
        waiver: { version: config.registration.waiverVersion, read: true as const, agreed: true as const, signatureName: w.signatureName.trim(), signerRole: needsGuardian ? 'guardian' as const : 'rider' as const },
        offerToken: draft.offerToken ?? null,
        extras,
        couponCode: draft.coupon?.code ?? null,
      },
      waiverText: config.registration.waiverText,
    };
    setBusy(true);
    update((x) => ({ ...x, pendingReservation: submission }));
    try {
      const order = await api.createOrder(ev.eventId, submission.request);
      const changedWaiver = submission.request.waiver.version !== config.registration.waiverVersion || submission.waiverText !== config.registration.waiverText;
      update((x) => ({ ...x, orderId: order.id, pendingReservation: null, step: 'review', reached: Math.max(x.reached, 3), waiver: changedWaiver ? { ...x.waiver, read: false, agreed: false } : x.waiver }));
    } catch (e) {
      setErrors([{ id: 'reservation-status', message: (e as ApiError).message }]);
      if (e instanceof ApiError && e.status >= 400 && e.status < 500 && ![401, 403, 408, 425, 429].includes(e.status)) {
        const latest = await api.publicEvent(ev.eventId).catch(() => null);
        if (latest) setEvent(latest);
        else setErrors([{ id: 'reservation-status', message: `${(e as ApiError).message} Reload this page to get the latest event information before trying again.` }]);
        const changedWaiver = !latest || submission.request.waiver.version !== latest.config.registration.waiverVersion || submission.waiverText !== latest.config.registration.waiverText;
        update((x) => ({ ...x, pendingReservation: null, clientRequestId: crypto.randomUUID(), waiver: changedWaiver ? { ...x.waiver, read: false, agreed: false } : x.waiver }));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="reg__panel" aria-labelledby="waiver-title">
      <ErrorSummary errors={errors} />
      <h2 id="waiver-title">Waiver</h2>
      {draft.pendingReservation && <p className="note" role="status">Your reservation request is pending. Retry to recover the same order before changing your entries. Your original details, waiver and signature are saved. If retries keep failing, contact the event organizer before starting another registration.</p>}
      <p className="muted small">
        Version <code className="code">{(pending?.request.waiver.version ?? config.registration.waiverVersion) || 'none'}</code>.{config.event.isDemo ? ' Sample text for the demo: a signature here has no legal effect.' : ''}
      </p>
      <div
        ref={boxRef}
        className="waiver"
        tabIndex={0}
        aria-label="Waiver text. Scroll to the end to enable signing."
        onScroll={(e) => {
          const el = e.currentTarget;
          if (!draft.pendingReservation && !w.read && el.scrollTop + el.clientHeight >= el.scrollHeight - 8) setW({ read: true });
        }}
      >
        {(pending?.waiverText ?? config.registration.waiverText) || 'The organizer has not added waiver text.'}
      </div>
      <label className="check">
        <input id="f-waiver-read" type="checkbox" disabled={busy || !!draft.pendingReservation} checked={w.read} onChange={(e) => setW({ read: e.target.checked })} />I have read the whole waiver
      </label>
      {addendumCats.map((cat) => (
        <fieldset className="subfields" key={cat.id}>
          <legend>
            {cat.addendum!.title} ({cat.name})
          </legend>
          <p className="small addendum-text">{cat.addendum!.text}</p>
          <label className="check">
            <input id={`addendum-${cat.id}`} type="checkbox" disabled={busy || !!draft.pendingReservation} checked={extras.addenda.includes(cat.id)} onChange={(e) => toggleAddendum(cat.id, e.target.checked)} />
            {needsGuardian ? 'As parent or guardian, I accept this for the rider' : 'I accept this'}
          </label>
        </fieldset>
      ))}
      <fieldset className="subfields" disabled={!w.read || busy || !!draft.pendingReservation}>
        <legend>{needsGuardian ? 'Signature of parent or guardian' : 'Your signature'}</legend>
        {!w.read && <p className="muted small">Scroll to the end of the waiver, or tick the box above, to sign.</p>}
        <Field label={`Type your full name to sign${signer ? `: ${signer}` : ''}`} id="f-signature">
          {(id) => <input id={id} className="input input--signature" autoComplete="off" value={w.signatureName} onChange={(e) => setW({ signatureName: e.target.value })} />}
        </Field>
        <label className="check">
          <input id="f-agree" type="checkbox" checked={w.agreed} onChange={(e) => setW({ agreed: e.target.checked })} />
          {needsGuardian ? 'As parent or guardian, I agree to this waiver for the rider' : 'I agree to this waiver'}
        </label>
      </fieldset>
      <div className="form-actions">
        <button className="btn btn--ghost" disabled={busy || !!draft.pendingReservation} onClick={() => goTo('details')}>
          <Icon name="arrow-left" /> Back
        </button>
        <button className="btn btn--primary" disabled={busy} onClick={hold}>
          {busy ? 'Holding your places…' : draft.pendingReservation ? 'Retry reservation' : 'Sign and review the order'}
        </button>
      </div>
      <p id="reservation-status" tabIndex={-1} className="muted small">{pending ? 'Your reservation outcome is not confirmed. Retry to recover the same order before making changes.' : `Places will be held for ${ev.holdMinutes} minutes after the reservation is confirmed.`}</p>
    </section>
  );
}

/* Step 4: review, held places, payment ------------------------------------ */

function useCountdown(until: string | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  return until ? Math.max(0, Math.floor((new Date(until).getTime() - now) / 1000)) : 0;
}

function orderRaceName(order: OrderView) {
  return (raceId: string) => order.entries.find((e) => order.quote.lines.find((l) => l.categoryId === e.categoryId)?.raceId === raceId)?.raceName ?? '';
}

function Review({ orderId, eventId, goTo, paymentMode }: { orderId: string; eventId: string; goTo: (s: Step) => void; paymentMode: PublicEvent['paymentMode'] }) {
  const [order, setOrder] = useState<OrderView | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const left = useCountdown(order?.holdExpiresAt ?? null);
  useEffect(() => {
    api.order(orderId).then(setOrder).catch((e: ApiError) => setErr(e.message));
  }, [orderId]);

  useEffect(() => {
    if (order?.status === 'confirmed' || order?.status === 'needs_attention') {
      clearStoredDraft(eventId);
      navigate({ page: 'order', orderId });
    }
  }, [order?.status, orderId, eventId]);

  if (!order) return err ? <p className="note note--error">{err}</p> : <div className="skeleton" aria-label="Loading your order" />;

  const cancelled = order.status === 'cancelled';
  const expired = cancelled || order.status === 'expired' || (left === 0 && (order.status === 'held' || order.status === 'payment_failed'));
  const pay = async (outcome: 'success' | 'failure') => {
    setBusy(true);
    setErr(null);
    try {
      setOrder(await api.pay(order.id, crypto.randomUUID(), outcome));
    } catch (e) {
      setErr((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  };
  const payWithStripe = async () => {
    setBusy(true);
    setErr(null);
    try {
      const next = await api.startCheckout(order.id);
      if (next.kind === 'redirect') window.location.assign(next.url);
      else setOrder(await api.order(order.id));
    } catch (e) {
      setErr((e as ApiError).message);
      setBusy(false);
    }
  };
  const stripe = paymentMode === 'stripe_test';
  const mm = Math.floor(left / 60);
  const ss = String(left % 60).padStart(2, '0');

  return (
    <section className="reg__panel" aria-labelledby="review-title">
      <h2 id="review-title">Review your order</h2>
      <PaymentNote mode={paymentMode} />
      {!expired ? (
        <p className="hold" role="timer" aria-live="off">
          <Icon name="clip" /> Your places are held for <span className="num">{mm}:{ss}</span>
        </p>
      ) : (
        <p className="note note--warn" role="alert">
          {cancelled ? 'Your reservation was cancelled. Change your entries to start again.' : stripe
            ? 'Your hold has ended and the places were released. Start a new registration to pay.'
            : 'Your hold has ended and the places were released. You can still complete the simulated payment: if every place is still free, your entry is confirmed. Otherwise nothing is charged and the organizer is told.'}
        </p>
      )}
      <p className="muted small">
        {order.rider.firstName} {order.rider.lastName}
        {order.rider.team ? ` · ${order.rider.team}` : ''} · racing age {order.rider.racingAge} · waiver signed by {order.waiver.signatureName}
      </p>
      <QuoteTable q={order.quote} raceName={orderRaceName(order)} />
      {order.refundPolicy.length > 0 && (
        <details className="tray__policy" open>
          <summary>Refund policy</summary>
          <RefundLines lines={order.refundPolicy} />
        </details>
      )}
      {order.status === 'payment_failed' && !expired && (
        <p className="note note--error" role="alert">
          {stripe ? 'The payment did not go through.' : 'The simulated payment was declined.'} Your places are still held. Try again before the timer runs out.
        </p>
      )}
      {err && (
        <p className="note note--error" role="alert">
          {err}
        </p>
      )}
      {stripe ? (
        <div className="paybox">
          <p className="paybox__title">Pay on Stripe (test mode)</p>
          <p className="muted small">You will pay on Stripe’s page and come back here. Card details never reach CycleReg. This is test mode: only Stripe test cards work and no real money moves.</p>
          <div className="form-actions">
            <button className="btn btn--primary" disabled={busy || expired} onClick={payWithStripe}>
              {busy ? 'Opening Stripe…' : `Pay ${formatCents(order.totalCents)} on Stripe`}
            </button>
          </div>
        </div>
      ) : (
      <div className="paybox">
        <p className="paybox__title">Simulated payment</p>
        <p className="muted small">A real event would open the payment provider’s page here. This simulated payment asks for no card details and contacts no provider.</p>
        <PaymentNote mode="simulated" />
        <div className="form-actions">
          <button className="btn btn--primary" disabled={busy || cancelled} onClick={() => pay('success')}>
            {busy ? 'Processing…' : `Complete simulated payment (${formatCents(order.totalCents)})`}
          </button>
          <button className="btn btn--secondary" disabled={busy || cancelled} onClick={() => pay('failure')}>
            Simulate a declined payment
          </button>
        </div>
      </div>
      )}
      <button className="btn btn--ghost" disabled={busy} onClick={() => goTo('races')}>
        <Icon name="arrow-left" /> {cancelled ? 'Change my entries' : 'Change my entries (releases the hold)'}
      </button>
    </section>
  );
}

/* Confirmation and receipt ------------------------------------------------ */

export function OrderPage({ orderId }: { orderId: string }) {
  const [order, setOrder] = useState<OrderView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // Back from Stripe: the payment notification can arrive a few seconds after the rider does.
  // Read once for this order, then taken out of the address so an order opened later in this tab does not look like a return.
  const [returned] = useState(() => new URLSearchParams(window.location.search).get('checkout') === 'returned');
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('checkout')) return;
    url.searchParams.delete('checkout');
    window.history.replaceState(window.history.state, '', url);
  }, []);
  const waiting = returned && (order?.status === 'held' || order?.status === 'payment_failed');
  const [polls, setPolls] = useState(0);
  useEffect(() => {
    api.order(orderId).then(setOrder).catch((e: ApiError) => setErr(e.message));
  }, [orderId, polls]);
  useEffect(() => {
    if (!waiting || polls >= 30) return;
    const t = window.setTimeout(() => setPolls((n) => n + 1), 2000);
    return () => window.clearTimeout(t);
  }, [waiting, polls]);
  // A Stripe payment never passes through the review step again, so the finished registration is forgotten here.
  const confirmedEventId = order?.status === 'confirmed' ? order.eventId : null;
  useEffect(() => {
    if (confirmedEventId) clearStoredDraft(confirmedEventId, orderId);
  }, [confirmedEventId, orderId]);
  if (err) return <div className="state-page"><p className="alert alert--error">{err}</p></div>;
  if (!order) return <div className="state-page"><div className="skeleton skeleton--page" /></div>;

  const confirmed = order.status === 'confirmed';
  // How this order was paid; before payment, only a return from Stripe tells us the mode.
  const mode: PaymentMode | null = order.paidWith ?? (returned ? 'stripe_test' : null);
  // Display only: money returned or on its way back. Entries and readiness do not change with a refund.
  const refunded = confirmed ? refundedCents(order.totalCents, order.refunds) : 0;
  return (
    <div className="reg">
      <RegHeader demo={order.isDemo} mode={mode} />
      <main className="reg__main reg__main--narrow">
        {confirmed ? (
          <>
            <h1 className="done__title">You’re entered</h1>
            <p className="reg__meta">
              {order.eventName} · {order.rider.firstName} {order.rider.lastName} · order <span className="num">{order.orderNumber}</span>
            </p>
            <PaymentNote mode={mode} />
            <div className="ticket">
              <p className="ticket__label">Check-in code{order.isDemo ? ' (demo)' : ''}</p>
              <p className="ticket__code num">{order.checkInCode}</p>
              {order.checkInCode && <CheckInQr code={order.checkInCode} />}
              <p className="muted small">Show this at check-in. It identifies your entry and contains no personal details.</p>
            </div>
            {order.entries.some((e) => e.status !== 'withdrawn' && e.readiness.some((r) => r.state !== 'done')) ? (
              <p className="note note--warn">Not cleared to race yet. Paying does not clear you; each entry below shows what is still needed.</p>
            ) : (
              <p className="note">Everything below is done. Bring your check-in code on race morning to collect your bib.</p>
            )}
          </>
        ) : waiting && polls < 30 ? (
          <>
            <h1 className="done__title">Confirming your payment</h1>
            <PaymentNote mode="stripe_test" />
            <p className="note" role="status">Stripe is telling us about your payment. This page updates on its own in a few seconds.</p>
          </>
        ) : order.status === 'needs_attention' ? (
          <>
            <h1 className="done__title">We could not confirm your entry</h1>
            <PaymentNote mode={mode} />
            <p className="note note--warn" role="alert">
              Your payment arrived after your hold ended or after you left the order, or did not match the order total, and a place could not be confirmed. The organizer sees this in their exception queue and will contact you.
            </p>
          </>
        ) : (
          <>
            <h1 className="done__title">Registration not finished</h1>
            <p className="note">This order is {order.status.replace('_', ' ')}.</p>
            <a className="btn btn--secondary" href={href({ page: 'register', eventId: order.eventId })}>
              Back to registration
            </a>
          </>
        )}

        <ul className="done__entries">
          {order.entries.map((e) => (
            <li key={e.id} className="done__entry">
              <p className="done__entry-name">
                <code className="code">{e.code}</code> {e.categoryName}
              </p>
              <p className="muted small">
                {e.raceName}
                {e.startTime ? ` · starts ${formatTime(e.startTime)}` : ''}
              </p>
              {confirmed && e.status === 'withdrawn' && <p className="small">Withdrawn by the organizer. This entry no longer races.</p>}
              {confirmed && e.status !== 'withdrawn' && (
                <ul className="readiness">
                  {e.readiness.map((r) => (
                    <li key={r.key} className={`readiness__item readiness__item--${r.state}`}>
                      <Icon name={r.state === 'done' ? 'check' : 'warn'} size={14} /> {r.label}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
        <section className="receipt" aria-labelledby="receipt-title" data-watermark={order.isDemo ? 'DEMO' : undefined}>
          <h2 id="receipt-title">{order.isDemo ? 'Demo receipt' : 'Receipt'}</h2>
          <p className="muted small">
            Order <span className="num">{order.orderNumber}</span>
            {order.isDemo ? ' · not a real receipt' : ''}
            {refunded > 0 && <span className="status status--muted receipt__refunded">{refunded === order.totalCents ? 'Refunded' : 'Partly refunded'}</span>}
          </p>
          <ul className="receipt__lines">
            {order.quote.lines.map((l) => (
              <li key={l.categoryId}>
                <span>{l.name}</span>
                <span className="num">{formatCents(l.priceCents)}</span>
                {l.discountCents > 0 && (
                  <>
                    <span className="muted">{l.discountReason}</span>
                    <span className="num">−{formatCents(l.discountCents)}</span>
                  </>
                )}
              </li>
            ))}
            {order.quote.fees.map((f) => (
              <li key={f.key}>
                <span>{f.label}</span>
                <span className="num">{formatCents(f.cents)}</span>
              </li>
            ))}
          </ul>
          {order.refunds.length > 0 && (
            <ul className="small" aria-label="Refunds">
              {order.refunds.map((r) => (
                <li key={r.id}>
                  {REFUND_STATUS_LABEL[r.status]}: <span className="num">{formatCents(r.amountCents)}</span>
                  {r.entryId ? ` for ${order.entries.find((e) => e.id === r.entryId)?.categoryName ?? 'an entry'}` : ''} · {formatDate(r.at.slice(0, 10))}
                </li>
              ))}
            </ul>
          )}
          {refunded > 0 && (
            <ul className="receipt__lines">
              <li>
                <span>{order.paidWith === 'stripe_test' ? 'Total paid (Stripe test mode)' : 'Total paid (simulated, not charged)'}</span>
                <span className="num">{formatCents(order.totalCents)}</span>
              </li>
              <li>
                <span>Refunded</span>
                <span className="num">−{formatCents(refunded)}</span>
              </li>
            </ul>
          )}
          <p className="quote__total">
            <span>{!confirmed ? 'Not charged' : refunded > 0 ? 'Net paid' : order.paidWith === 'stripe_test' ? 'Total paid (Stripe test mode)' : 'Total (simulated, not charged)'}</span>
            <span className="num">{refunded > 0 && refunded === order.totalCents ? '$0' : formatCents(confirmed ? order.totalCents - refunded : 0)}</span>
          </p>
          <PaymentNote mode={mode} />
          {order.refundPolicy.length > 0 && (
            <details className="tray__policy">
              <summary>Refund policy you accepted</summary>
              <RefundLines lines={order.refundPolicy} />
            </details>
          )}
        </section>
      </main>
    </div>
  );
}

/** Shown when a rider opens a waitlist offer link. */
function OfferBanner({ offer }: { offer: WaitlistOffer }) {
  const until = offer.offerExpiresAt ? formatDateTime(offer.offerExpiresAt) : null;
  if (offer.status === 'offered') {
    return (
      <p className="note note--ok" role="note">
        <strong>Waitlist offer:</strong> a place in {offer.categoryName} is held for you until {until}. Finish registering and pay before then, or it goes to the next rider.
      </p>
    );
  }
  const why = offer.status === 'expired' ? 'has expired' : offer.status === 'accepted' ? 'has already been used' : 'was withdrawn';
  return (
    <p className="note note--warn" role="alert">
      This waitlist offer for {offer.categoryName} {why}. Contact the organizer if you still want a place.
    </p>
  );
}

/** Join a full category's waitlist with the "About you" answers and a name and email the organizer can use. */
function JoinWaitlist({ ev, cat, draft }: { ev: PublicEvent; cat: Category; draft: Draft }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ firstName: draft.details.firstName, lastName: draft.details.lastName, email: draft.details.email });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState<{ position: number | null } | null>(null);
  const waiting = ev.waitlist[cat.id]?.waiting ?? 0;
  const p = draft.profile;
  const session = useSession();

  if (joined) {
    return (
      <span className="opt__reason" role="status">
        You are number {joined.position ?? '?'} on the waitlist for {cat.name}. If a place opens, the organizer sends you a private link and you have {OFFER_HOURS} hours to register. No email is sent yet.
      </span>
    );
  }
  if (!open) {
    return (
      <span className="opt__reason waitlist-join">
        Full. {waiting > 0 ? `${waiting} ${waiting === 1 ? 'rider is' : 'riders are'} waiting. ` : ''}Freed places go to the waitlist first.
        <button type="button" className="btn btn--secondary btn--small" onClick={() => (session.status === 'signed-in' ? setOpen(true) : session.signIn())}>
          {session.status === 'signed-in' ? 'Join the waitlist' : 'Sign in to join the waitlist'}
        </button>
      </span>
    );
  }
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const racingAge = p.racingAge;
    if (racingAge === null) {
      setError('Answer "About you" above first, so the organizer knows you can enter this category.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await api.joinWaitlist(ev.eventId, { categoryId: cat.id, ...form, ...p, racingAge });
      setJoined({ position: r.position });
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  };
  const id = (k: string) => `wl-${cat.id}-${k}`;
  return (
    <form className="waitlist-form" onSubmit={submit} aria-label={`Join the waitlist for ${cat.name}`}>
      <div className="waitlist-form__row">
        <label htmlFor={id('first')}>
          First name
          <input id={id('first')} className="input" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} autoComplete="given-name" />
        </label>
        <label htmlFor={id('last')}>
          Last name
          <input id={id('last')} className="input" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} autoComplete="family-name" />
        </label>
        <label htmlFor={id('email')}>
          Email
          <input id={id('email')} className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="email" />
        </label>
      </div>
      {error && (
        <span className="text-error small" role="alert">
          {error}
        </span>
      )}
      <div className="waitlist-form__actions">
        <button type="submit" className="btn btn--primary btn--small" disabled={busy}>
          {busy ? 'Joining…' : 'Join the waitlist'}
        </button>
        <button type="button" className="btn btn--ghost btn--small" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/** The check-in code as a QR image, for scanning at the check-in table. The text code above stays for typing. */
function CheckInQr({ code }: { code: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    QRCode.toDataURL(code, { errorCorrectionLevel: 'M', margin: 2, width: 200, color: { dark: '#000000', light: '#ffffff' } })
      .then((url) => live && setSrc(url))
      .catch(() => live && setSrc(null));
    return () => {
      live = false;
    };
  }, [code]);
  if (!src) return null;
  return <img className="ticket__qr" src={src} width={200} height={200} alt={`QR code for check-in code ${code}`} />;
}
