import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { findConflicts, riderDetailsSchema, type RiderDetails } from '../shared/checkout';
import { evaluateCategory, summarizeEligibility, type EligibilityResult, type RiderProfile } from '../shared/eligibility';
import { formatCents, formatDate, formatLength, formatTime, sortCategories } from '../shared/format';
import { categoryPrice, quote, type Quote } from '../shared/pricing';
import { COLLEGIATE_DIVISIONS, LICENSE_CATEGORIES, type Category, type EventConfig } from '../shared/schema';
import { api, ApiError, type OrderView, type PublicEvent } from './api';
import { href, navigate } from './App';
import { dayHue, Field, Icon, IntInput, Pending } from './ui';

type Step = 'races' | 'details' | 'waiver' | 'review';
const STEPS: { key: Step; label: string }[] = [
  { key: 'races', label: 'Races' },
  { key: 'details', label: 'Your details' },
  { key: 'waiver', label: 'Waiver' },
  { key: 'review', label: 'Review and pay' },
];

interface Draft {
  step: Step;
  profile: RiderProfile;
  selected: string[];
  details: Omit<RiderDetails, 'racingAge' | 'licenseCategory' | 'licenseType' | 'competitionClass' | 'collegiateDivision'>;
  waiver: { riderAccepted: boolean; guardianAccepted: boolean };
  orderId: string | null;
  clientRequestId: string;
}

const EMPTY_PROFILE: RiderProfile = { racingAge: null, licenseCategory: null, licenseType: null, competitionClass: null, collegiateDivision: null };

function freshDraft(): Draft {
  return {
    step: 'races',
    profile: EMPTY_PROFILE,
    selected: [],
    details: { firstName: '', lastName: '', email: '', team: '', guardian: null },
    waiver: { riderAccepted: false, guardianAccepted: false },
    orderId: null,
    clientRequestId: crypto.randomUUID(),
  };
}

/** Keeps an unfinished registration in this tab only, so a refresh does not lose it. */
function useStoredDraft(eventId: string): [Draft, (fn: (d: Draft) => Draft) => void] {
  const key = `cyclereg.register.${eventId}`;
  const [draft, setDraft] = useState<Draft>(() => {
    try {
      const raw = sessionStorage.getItem(key);
      if (raw) return { ...freshDraft(), ...(JSON.parse(raw) as Draft) };
    } catch {
      /* storage unavailable */
    }
    return freshDraft();
  });
  const update = (fn: (d: Draft) => Draft) =>
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

export function Register({ eventId }: { eventId: string }) {
  const [ev, setEv] = useState<PublicEvent | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [draft, update] = useStoredDraft(eventId);

  useEffect(() => {
    api.publicEvent(eventId).then(setEv).catch(setError);
  }, [eventId]);

  if (error) {
    return (
      <div className="state-page">
        <p className="alert alert--warn" role="alert">
          {error.message}
        </p>
        <a className="btn btn--secondary" href={href({ page: 'event', eventId, view: 'publish' })}>
          Open the organizer workspace
        </a>
      </div>
    );
  }
  if (!ev) return <div className="state-page"><div className="skeleton skeleton--page" aria-label="Loading registration" /></div>;

  const { config } = ev;
  const stepIndex = STEPS.findIndex((s) => s.key === draft.step);

  return (
    <div className="reg">
      <header className="reg__bar">
        <span className="brand">CycleReg</span>
        <span className="reg__bar-note">Rider registration · prototype</span>
      </header>
      <main className="reg__main">
        <section className="reg__event" aria-labelledby="reg-title">
          <h1 id="reg-title">{config.event.name}</h1>
          <p className="reg__meta">
            {config.days.map((d) => formatDate(d.date)).join(' and ')}
            {config.event.venue ? ` · ${config.event.venue}` : ''} · {ev.organizationName}
          </p>
          {config.event.isDemo && (
            <p className="demo-banner demo-banner--inline" role="note">
              <strong>Example data.</strong> {config.event.demoNotice}
            </p>
          )}
          <div className="pending-stack">
            <Pending>Payment is simulated. No card is asked for and no money moves.</Pending>
            <Pending>USA Cycling license checks are not connected. The organizer reviews every license.</Pending>
            <Pending>Prototype: use made-up details. Everything stays on this computer.</Pending>
          </div>
        </section>

        <ol className="stepper" aria-label="Registration steps">
          {STEPS.map((s, i) => (
            <li key={s.key} className={i === stepIndex ? 'is-current' : i < stepIndex ? 'is-done' : ''} aria-current={i === stepIndex ? 'step' : undefined}>
              <span className="stepper__num num" aria-hidden="true">
                {i < stepIndex ? <Icon name="check" size={14} /> : i + 1}
              </span>
              {s.label}
            </li>
          ))}
        </ol>

        {draft.step === 'races' && <ChooseRaces ev={ev} draft={draft} update={update} />}
        {draft.step === 'details' && <Details config={config} draft={draft} update={update} />}
        {draft.step === 'waiver' && <Waiver ev={ev} draft={draft} update={update} />}
        {draft.step === 'review' && draft.orderId && <Review orderId={draft.orderId} eventId={eventId} update={update} />}
      </main>
    </div>
  );
}

/* Step 1: about you and the schedule ------------------------------------ */

function ChooseRaces({ ev, draft, update }: { ev: PublicEvent; draft: Draft; update: (fn: (d: Draft) => Draft) => void }) {
  const { config } = ev;
  const [trayOpen, setTrayOpen] = useState(false);
  const checking = Object.values(draft.profile).some((v) => v !== null);
  const q = useMemo(() => quote(config, draft.selected, ev.today), [config, draft.selected, ev.today]);
  const conflicts = useMemo(() => findConflicts(config, draft.selected), [config, draft.selected]);
  const blocking = conflicts.filter((c) => c.level === 'block');
  const setProfile = (p: Partial<RiderProfile>) => update((d) => ({ ...d, profile: { ...d.profile, ...p } }));
  const toggle = (id: string) => update((d) => ({ ...d, selected: d.selected.includes(id) ? d.selected.filter((x) => x !== id) : [...d.selected, id] }));

  const result = (cat: Category): EligibilityResult | null => (checking ? evaluateCategory(cat, draft.profile) : null);
  const ineligibleSelected = draft.selected.filter((id) => {
    const cat = config.categories.find((c) => c.id === id);
    return cat && checking && evaluateCategory(cat, draft.profile).status === 'ineligible';
  });
  const canContinue = draft.selected.length > 0 && blocking.length === 0 && ineligibleSelected.length === 0 && draft.profile.racingAge !== null;

  return (
    <div className="reg__grid">
      <div className="reg__col">
        <section className="about" aria-labelledby="about-title">
          <h2 id="about-title">About you</h2>
          <p className="muted">Four answers show which races you can enter. You can still see every race.</p>
          <div className="about__fields">
            <Field label="Racing age">{(id) => <IntInput id={id} value={draft.profile.racingAge} min={5} max={110} onCommit={(v) => setProfile({ racingAge: v })} />}</Field>
            <Field label="License category">
              {(id) => (
                <select id={id} className="input" value={draft.profile.licenseCategory ?? ''} onChange={(e) => setProfile({ licenseCategory: (e.target.value || null) as RiderProfile['licenseCategory'] })}>
                  <option value="">I don’t know</option>
                  {LICENSE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c === 'PRO' ? 'Pro' : `Cat ${c}`}
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
          <p className="muted small">Racing age is the age your federation uses for the season. This prototype does not calculate it from a birth date.</p>
        </section>

        {config.days.map((day, di) => {
          const races = config.races.filter((r) => r.dayId === day.id);
          return (
            <section key={day.id} className="sched-day" style={{ ['--day' as string]: dayHue(di) }} aria-labelledby={`day-${day.id}`}>
              <h2 className="sched-day__title" id={`day-${day.id}`}>
                {day.label} <span>{formatDate(day.date)}</span>
              </h2>
              {races.map((race) => {
                const groups = [...config.startGroups.filter((g) => g.raceId === race.id)].sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''));
                return (
                  <div key={race.id} className="sched-race">
                    <h3 className="sched-race__title">
                      {race.name}
                      {race.course && <span>{race.course}</span>}
                    </h3>
                    <ol className="sched-list">
                      {groups.map((sg) => {
                        const cats = sortCategories(config.categories.filter((c) => c.startGroupId === sg.id && c.status !== 'archived'));
                        if (cats.length === 0) return null;
                        return (
                          <li key={sg.id} className="start">
                            <div className="start__time">
                              <span className="num">{formatTime(sg.startTime)}</span>
                              {sg.stagingTime && <span className="start__staging">Staging {formatTime(sg.stagingTime)}</span>}
                            </div>
                            <div className="start__cats">
                              {cats.length > 1 && (
                                <p className="start__shared">
                                  <Icon name="clip" size={14} /> {cats.length} categories start together and are scored separately
                                </p>
                              )}
                              {cats.map((cat) => (
                                <RaceOption
                                  key={cat.id}
                                  config={config}
                                  cat={cat}
                                  today={ev.today}
                                  selected={draft.selected.includes(cat.id)}
                                  remaining={ev.remaining[cat.id] ?? null}
                                  result={result(cat)}
                                  conflicts={conflicts.filter((c) => c.a === cat.id || c.b === cat.id).filter(() => draft.selected.includes(cat.id))}
                                  onToggle={() => toggle(cat.id)}
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
          );
        })}
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
          <h2 id="tray-title" className="tray__title">
            Your entries
          </h2>
          {draft.selected.length === 0 ? (
            <p className="muted small">Pick a race to add it here. Prices, discounts, and the total update as you go.</p>
          ) : (
            <QuoteTable q={q} raceName={(id) => config.races.find((r) => r.id === id)?.name ?? ''} onRemove={(id) => toggle(id)} />
          )}
          <BundleHint config={config} selected={draft.selected} q={q} />
          {blocking.map((c) => (
            <p key={`${c.a}-${c.b}`} className="note note--error" role="alert">
              {c.message}
            </p>
          ))}
          {ineligibleSelected.length > 0 && <p className="note note--error">Remove races you are not eligible for before you continue.</p>}
          {draft.selected.length > 0 && draft.profile.racingAge === null && <p className="note">Enter your racing age above to continue.</p>}
          <button className="btn btn--primary tray__cta" disabled={!canContinue} onClick={() => update((d) => ({ ...d, step: 'details' }))}>
            Continue to your details
          </button>
          {config.registration.refundPolicy && (
            <details className="tray__policy">
              <summary>Refund policy</summary>
              <p>{config.registration.refundPolicy}</p>
            </details>
          )}
        </div>
      </aside>
    </div>
  );
}

function RaceOption({
  config,
  cat,
  today,
  selected,
  remaining,
  result,
  conflicts,
  onToggle,
}: {
  config: EventConfig;
  cat: Category;
  today: string;
  selected: boolean;
  remaining: number | null;
  result: EligibilityResult | null;
  conflicts: ReturnType<typeof findConflicts>;
  onToggle: () => void;
}) {
  const race = config.races.find((r) => r.id === cat.raceId);
  const day = config.days.find((d) => d.id === race?.dayId);
  const price = categoryPrice(cat, today, day?.date ?? '');
  const full = remaining === 0;
  const closed = cat.status !== 'active';
  const blockedByEligibility = result?.status === 'ineligible';
  const disabled = !selected && (full || closed || blockedByEligibility);
  const status = closed
    ? { cls: 'muted', text: 'Closed' }
    : full
      ? { cls: 'muted', text: 'Full' }
      : result?.status === 'ineligible'
        ? { cls: 'ineligible', text: 'Not eligible' }
        : result?.status === 'needs_review'
          ? { cls: 'needs_review', text: 'Organizer review' }
          : result
            ? { cls: 'eligible', text: 'You qualify' }
            : null;
  return (
    <div className={`opt ${selected ? 'is-selected' : ''} ${disabled ? 'is-disabled' : ''}`}>
      <button className="opt__main" role="checkbox" aria-checked={selected} aria-disabled={disabled || undefined} onClick={() => !disabled && onToggle()} aria-describedby={`opt-${cat.id}-why`}>
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
            {formatLength(cat.length)} · {remaining === null ? 'Places open' : full ? 'No places left' : `${remaining} places left`}
          </span>
        </span>
        <span className="opt__price num">
          {formatCents(price.cents)}
          {price.dayOf && <span className="opt__sub">incl. race-day fee</span>}
        </span>
      </button>
      <div className="opt__status" id={`opt-${cat.id}-why`}>
        {status && <span className={`status status--${status.cls}`}>{status.text}</span>}
        {result && result.status !== 'eligible' && result.reasons.length > 0 && <span className="opt__reason">{result.reasons.join('; ')}</span>}
        {cat.eligibility.guardianRequired && <span className="opt__reason">Parent or guardian completes this entry.</span>}
        {conflicts.map((c) => (
          <span key={`${c.a}-${c.b}`} className={`opt__reason ${c.level === 'block' ? 'text-error' : 'text-warn'}`}>
            {c.message}
          </span>
        ))}
      </div>
    </div>
  );
}

function QuoteTable({ q, raceName, onRemove }: { q: Quote; raceName: (raceId: string) => string; onRemove?: (id: string) => void }) {
  return (
    <div className="quote">
      <ul className="quote__lines">
        {q.lines.map((l) => {
          return (
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
          );
        })}
      </ul>
      <p className="quote__total">
        <span>Total</span>
        <span className="num">{formatCents(q.totalCents)}</span>
      </p>
      {q.discountCents > 0 && <p className="quote__saved">You save {formatCents(q.discountCents)}. Each entry gets at most one discount.</p>}
    </div>
  );
}

function BundleHint({ config, selected, q }: { config: EventConfig; selected: string[]; q: Quote }) {
  if (q.bundle || selected.length === 0) return null;
  const races = new Set(selected.map((id) => config.categories.find((c) => c.id === id)?.raceId));
  const near = config.registration.bundles.find((b) => b.raceIds.some((r) => races.has(r)) && b.raceIds.some((r) => !races.has(r)));
  if (!near) return null;
  const missing = near.raceIds.filter((r) => !races.has(r)).map((r) => config.races.find((x) => x.id === r)?.name ?? 'another race');
  return (
    <p className="note">
      Add an entry in {missing.join(' and ')} to get the {near.name} and save {formatCents(near.discountCents)}.
    </p>
  );
}

/* Step 2: details --------------------------------------------------------- */

function Details({ config, draft, update }: { config: EventConfig; draft: Draft; update: (fn: (d: Draft) => Draft) => void }) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const needsGuardian = draft.selected.some((id) => config.categories.find((c) => c.id === id)?.eligibility.guardianRequired);
  const d = draft.details;
  const set = (p: Partial<Draft['details']>) => update((x) => ({ ...x, details: { ...x.details, ...p } }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const candidate = { ...d, ...draft.profile, racingAge: draft.profile.racingAge ?? -1, guardian: needsGuardian ? (d.guardian ?? { name: '', relationship: '' }) : null };
    const parsed = riderDetailsSchema.safeParse(candidate);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) errs[i.path.join('.')] = i.message;
      setErrors(errs);
      return;
    }
    setErrors({});
    update((x) => ({ ...x, step: 'waiver' }));
  };

  return (
    <form className="reg__panel" onSubmit={submit} noValidate>
      <h2>Your details</h2>
      <p className="muted">Entered once for every race in this order.</p>
      <div className="form-row">
        <Field label="First name" error={errors.firstName}>
          {(id, dsc) => <input id={id} aria-describedby={dsc} className="input" autoComplete="given-name" value={d.firstName} onChange={(e) => set({ firstName: e.target.value })} />}
        </Field>
        <Field label="Last name" error={errors.lastName}>
          {(id, dsc) => <input id={id} aria-describedby={dsc} className="input" autoComplete="family-name" value={d.lastName} onChange={(e) => set({ lastName: e.target.value })} />}
        </Field>
      </div>
      <div className="form-row">
        <Field label="Email for your receipt" error={errors.email} hint="No email is sent in this prototype.">
          {(id, dsc) => <input id={id} aria-describedby={dsc} type="email" className="input" autoComplete="email" value={d.email} onChange={(e) => set({ email: e.target.value })} />}
        </Field>
        <Field label="Team (optional)">{(id) => <input id={id} className="input" value={d.team} onChange={(e) => set({ team: e.target.value })} />}</Field>
      </div>
      <div className="summary-line">
        <p>
          Racing age <strong className="num">{draft.profile.racingAge}</strong> · License{' '}
          <strong>{draft.profile.licenseCategory ? (draft.profile.licenseCategory === 'PRO' ? 'Pro' : `Cat ${draft.profile.licenseCategory}`) : 'not known'}</strong>
        </p>
        <button type="button" className="link-btn" onClick={() => update((x) => ({ ...x, step: 'races' }))}>
          Change
        </button>
      </div>
      {needsGuardian && (
        <fieldset className="subfields guardian">
          <legend>Parent or guardian</legend>
          <p className="muted small">A junior entry is in this order, so a parent or guardian completes it and accepts the waiver.</p>
          <div className="form-row">
            <Field label="Guardian name" error={errors['guardian.name']}>
              {(id, dsc) => (
                <input id={id} aria-describedby={dsc} className="input" value={d.guardian?.name ?? ''} onChange={(e) => set({ guardian: { name: e.target.value, relationship: d.guardian?.relationship ?? '' } })} />
              )}
            </Field>
            <Field label="Relationship to rider" error={errors['guardian.relationship']}>
              {(id, dsc) => (
                <input id={id} aria-describedby={dsc} className="input" placeholder="Parent, legal guardian" value={d.guardian?.relationship ?? ''} onChange={(e) => set({ guardian: { name: d.guardian?.name ?? '', relationship: e.target.value } })} />
              )}
            </Field>
          </div>
        </fieldset>
      )}
      <div className="form-actions">
        <button type="button" className="btn btn--ghost" onClick={() => update((x) => ({ ...x, step: 'races' }))}>
          <Icon name="arrow-left" /> Back to races
        </button>
        <button className="btn btn--primary" type="submit">
          Continue to the waiver
        </button>
      </div>
    </form>
  );
}

/* Step 3: waiver, then hold places --------------------------------------- */

function Waiver({ ev, draft, update }: { ev: PublicEvent; draft: Draft; update: (fn: (d: Draft) => Draft) => void }) {
  const { config } = ev;
  const needsGuardian = draft.selected.some((id) => config.categories.find((c) => c.id === id)?.eligibility.guardianRequired);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ready = draft.waiver.riderAccepted && (!needsGuardian || draft.waiver.guardianAccepted);

  const hold = async () => {
    setBusy(true);
    setErr(null);
    try {
      const rider: RiderDetails = { ...draft.details, ...draft.profile, racingAge: draft.profile.racingAge!, guardian: needsGuardian ? draft.details.guardian : null };
      const order = await api.createOrder(ev.eventId, {
        clientRequestId: draft.clientRequestId,
        categoryIds: draft.selected,
        rider,
        waiver: { version: config.registration.waiverVersion, riderAccepted: true, guardianAccepted: draft.waiver.guardianAccepted },
      });
      update((x) => ({ ...x, orderId: order.id, step: 'review' }));
    } catch (e) {
      setErr((e as ApiError).message);
      // A refused order held nothing; the next attempt is a new request.
      update((x) => ({ ...x, clientRequestId: crypto.randomUUID() }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="reg__panel" aria-labelledby="waiver-title">
      <h2 id="waiver-title">Waiver</h2>
      <p className="muted small">
        Version <code className="code">{config.registration.waiverVersion || 'none'}</code>
      </p>
      <div className="waiver" tabIndex={0} aria-label="Waiver text">
        {config.registration.waiverText || 'The organizer has not added waiver text.'}
      </div>
      <label className="check">
        <input type="checkbox" checked={draft.waiver.riderAccepted} onChange={(e) => update((x) => ({ ...x, waiver: { ...x.waiver, riderAccepted: e.target.checked } }))} />I have read and accept this waiver
      </label>
      {needsGuardian && (
        <label className="check">
          <input type="checkbox" checked={draft.waiver.guardianAccepted} onChange={(e) => update((x) => ({ ...x, waiver: { ...x.waiver, guardianAccepted: e.target.checked } }))} />
          As parent or guardian ({draft.details.guardian?.name || 'named on the previous step'}), I accept this waiver for the rider
        </label>
      )}
      {err && (
        <p className="note note--error" role="alert">
          {err}
        </p>
      )}
      <div className="form-actions">
        <button className="btn btn--ghost" onClick={() => update((x) => ({ ...x, step: 'details' }))}>
          <Icon name="arrow-left" /> Back
        </button>
        <button className="btn btn--primary" disabled={!ready || busy} onClick={hold}>
          {busy ? 'Holding your places…' : 'Hold my places and review'}
        </button>
      </div>
      <p className="muted small">Your places are held for {ev.holdMinutes} minutes while you review and pay.</p>
    </section>
  );
}

/* Step 4: review, held places, simulated payment ------------------------- */

function useCountdown(until: string | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  return until ? Math.max(0, Math.floor((new Date(until).getTime() - now) / 1000)) : 0;
}

function Review({ orderId, eventId, update }: { orderId: string; eventId: string; update: (fn: (d: Draft) => Draft) => void }) {
  const [order, setOrder] = useState<OrderView | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const left = useCountdown(order?.holdExpiresAt ?? null);
  useEffect(() => {
    api.order(orderId).then(setOrder).catch((e: ApiError) => setErr(e.message));
  }, [orderId]);

  useEffect(() => {
    if (order?.status === 'confirmed' || order?.status === 'needs_attention') {
      try {
        sessionStorage.removeItem(`cyclereg.register.${eventId}`);
      } catch {
        /* ignore */
      }
      navigate({ page: 'order', orderId });
    }
  }, [order?.status, orderId, eventId]);

  if (!order) return err ? <p className="note note--error">{err}</p> : <div className="skeleton" aria-label="Loading your order" />;

  const expired = order.status === 'expired' || (left === 0 && (order.status === 'held' || order.status === 'payment_failed'));
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
  const changeEntries = async () => {
    setBusy(true);
    try {
      await api.cancelOrder(order.id);
    } catch {
      /* the hold expires on its own */
    }
    update((x) => ({ ...x, orderId: null, clientRequestId: crypto.randomUUID(), step: 'races' }));
  };

  const mm = Math.floor(left / 60);
  const ss = String(left % 60).padStart(2, '0');

  return (
    <section className="reg__panel" aria-labelledby="review-title">
      <h2 id="review-title">Review and pay</h2>
      {!expired ? (
        <p className="hold" role="timer" aria-live="off">
          <Icon name="clip" /> Your places are held for <span className="num">{mm}:{ss}</span>
        </p>
      ) : (
        <p className="note note--warn" role="alert">
          Your hold has ended and the places were released. You can still try to pay: if every place is still free, your entry is confirmed. Otherwise nothing is charged and the organizer is told.
        </p>
      )}
      <p className="muted small">
        {order.rider.firstName} {order.rider.lastName}
        {order.rider.team ? ` · ${order.rider.team}` : ''} · racing age {order.rider.racingAge}
      </p>
      <QuoteTable q={order.quote} raceName={(raceId) => order.entries.find((e) => order.quote.lines.find((l) => l.categoryId === e.categoryId)?.raceId === raceId)?.raceName ?? ''} />
      {order.refundPolicy && (
        <details className="tray__policy" open>
          <summary>Refund policy</summary>
          <p>{order.refundPolicy}</p>
        </details>
      )}
      {order.status === 'payment_failed' && !expired && (
        <p className="note note--error" role="alert">
          The simulated payment was declined. Your places are still held. Try again before the timer runs out.
        </p>
      )}
      {err && (
        <p className="note note--error" role="alert">
          {err}
        </p>
      )}
      <div className="paybox">
        <p className="paybox__title">Simulated payment</p>
        <p className="muted small">A real event would open the payment provider’s page here. No card is asked for and nothing is charged.</p>
        <div className="form-actions">
          <button className="btn btn--primary" disabled={busy} onClick={() => pay('success')}>
            {busy ? 'Processing…' : `Pay ${formatCents(order.totalCents)} (simulated)`}
          </button>
          <button className="btn btn--secondary" disabled={busy} onClick={() => pay('failure')}>
            Simulate a declined payment
          </button>
        </div>
      </div>
      <button className="btn btn--ghost" disabled={busy} onClick={changeEntries}>
        <Icon name="arrow-left" /> Change my entries (releases the hold)
      </button>
    </section>
  );
}

/* Confirmation ------------------------------------------------------------ */

export function OrderPage({ orderId }: { orderId: string }) {
  const [order, setOrder] = useState<OrderView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api.order(orderId).then(setOrder).catch((e: ApiError) => setErr(e.message));
  }, [orderId]);
  if (err) return <div className="state-page"><p className="alert alert--error">{err}</p></div>;
  if (!order) return <div className="state-page"><div className="skeleton skeleton--page" /></div>;

  const confirmed = order.status === 'confirmed';
  return (
    <div className="reg">
      <header className="reg__bar">
        <span className="brand">CycleReg</span>
        <span className="reg__bar-note">Rider registration · prototype</span>
      </header>
      <main className="reg__main reg__main--narrow">
        {confirmed ? (
          <>
            <h1 className="done__title">You’re entered</h1>
            <p className="reg__meta">
              {order.eventName} · {order.rider.firstName} {order.rider.lastName}
            </p>
            <div className="ticket">
              <p className="ticket__label">Check-in code</p>
              <p className="ticket__code num">{order.checkInCode}</p>
              <p className="muted small">Show this at check-in. It identifies your entry and contains no personal details.</p>
            </div>
            <p className="note note--warn">Paying does not clear you to race. Each entry below lists what is still needed.</p>
          </>
        ) : order.status === 'needs_attention' ? (
          <>
            <h1 className="done__title">We could not confirm your entry</h1>
            <p className="note note--warn" role="alert">
              Your simulated payment arrived after your hold ended, and a place you chose has filled. Nothing was confirmed. The organizer sees this in their exception queue and will contact you
              about a refund or another race.
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
              {confirmed && (
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
        <section className="receipt" aria-labelledby="receipt-title">
          <h2 id="receipt-title">Receipt</h2>
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
          </ul>
          <p className="quote__total">
            <span>{confirmed ? 'Paid (simulated)' : 'Not charged'}</span>
            <span className="num">{formatCents(confirmed ? order.totalCents : 0)}</span>
          </p>
        </section>
      </main>
    </div>
  );
}
