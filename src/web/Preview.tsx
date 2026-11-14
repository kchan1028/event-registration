import { useState } from 'react';
import { remainingForCategory, startGroupCategoryIds } from '../shared/capacity';
import { evaluateCategory, summarizeEligibility, type EligibilityResult, type RiderProfile } from '../shared/eligibility';
import { formatCents, formatDate, formatLength, formatTime, sortCategories, startGroupFor } from '../shared/format';
import { COLLEGIATE_DIVISIONS, LICENSE_CATEGORIES, type Category } from '../shared/schema';
import { countIssues } from '../shared/validation';
import { href } from './App';
import type { Draft } from './Builder';
import { Tally } from './FieldBoard';
import { dayHue, Field, Icon, IntInput, Pending } from './ui';

const EMPTY: RiderProfile = { racingAge: null, licenseCategory: null, licenseType: null, competitionClass: null, collegiateDivision: null };

function priceLine(cat: Category): string {
  const parts = [formatCents(cat.pricing.baseCents)];
  for (const pc of [...cat.pricing.priceChanges].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))) {
    const [, m, d] = pc.effectiveFrom.split('-').map(Number);
    parts.push(`${formatCents(pc.cents)} from ${new Date(Date.UTC(2000, m - 1, d)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}`);
  }
  return parts.join(', then ');
}

export function Preview({ draft }: { draft: Draft }) {
  const { config, data } = draft;
  const [rider, setRider] = useState<RiderProfile>(EMPTY);
  const checking = Object.values(rider).some((v) => v !== null);
  const { errors } = countIssues(draft.issues);
  const back = href({ page: 'event', eventId: data.id, view: 'race', raceId: null });

  return (
    <div className="preview">
      <header className="preview__bar">
        <a className="btn btn--ghost" href={back}>
          <Icon name="arrow-left" /> Back to builder
        </a>
        <p className="preview__mode">Rider preview of the current draft{errors ? ` · ${errors} ${errors === 1 ? 'error' : 'errors'} still to fix` : ''}</p>
      </header>

      <main className="preview__main">
        <h1 className="preview__title">{config.event.name}</h1>
        <p className="preview__meta">
          {config.days.map((d) => formatDate(d.date)).join(' and ')}
          {config.event.venue ? ` · ${config.event.venue}` : ''}
        </p>
        {config.event.isDemo && (
          <p className="demo-banner demo-banner--inline" role="note">
            <strong>Example data.</strong> {config.event.demoNotice}
          </p>
        )}
        <div className="pending-stack">
          <Pending>License checks with USA Cycling are not connected. Your license will be reviewed by the organizer.</Pending>
          <Pending>Online payment is not available in this preview.</Pending>
        </div>

        <section className="checker" aria-labelledby="checker-title">
          <h2 id="checker-title">Check which races you can enter</h2>
          <p className="muted">Organizer tool: enter a sample rider to see which categories they qualify for. Nothing is saved.</p>
          <div className="checker__fields">
            <Field label="Racing age">{(id) => <IntInput id={id} value={rider.racingAge} max={120} onCommit={(v) => setRider({ ...rider, racingAge: v })} />}</Field>
            <Field label="License category">
              {(id) => (
                <select id={id} className="input" value={rider.licenseCategory ?? ''} onChange={(e) => setRider({ ...rider, licenseCategory: (e.target.value || null) as RiderProfile['licenseCategory'] })}>
                  <option value="">Unknown</option>
                  {LICENSE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c === 'PRO' ? 'Pro' : `Cat ${c}`}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label="License type">
              {(id) => (
                <select id={id} className="input" value={rider.licenseType ?? ''} onChange={(e) => setRider({ ...rider, licenseType: (e.target.value || null) as RiderProfile['licenseType'] })}>
                  <option value="">Unknown</option>
                  <option value="annual">Annual</option>
                  <option value="one_day">One-day</option>
                </select>
              )}
            </Field>
            <Field label="Competition class">
              {(id) => (
                <select id={id} className="input" value={rider.competitionClass ?? ''} onChange={(e) => setRider({ ...rider, competitionClass: (e.target.value || null) as RiderProfile['competitionClass'] })}>
                  <option value="">Unknown</option>
                  <option value="women">Women</option>
                  <option value="men">Men</option>
                  <option value="other">Other, confirm with organizer</option>
                </select>
              )}
            </Field>
            <Field label="Collegiate">
              {(id) => (
                <select id={id} className="input" value={rider.collegiateDivision ?? ''} onChange={(e) => setRider({ ...rider, collegiateDivision: (e.target.value || null) as RiderProfile['collegiateDivision'] })}>
                  <option value="">Not a collegiate rider</option>
                  {COLLEGIATE_DIVISIONS.map((d) => (
                    <option key={d} value={d}>
                      Division {d}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            {checking && (
              <button className="btn btn--ghost btn--small checker__reset" onClick={() => setRider(EMPTY)}>
                Clear
              </button>
            )}
          </div>
          <p className="muted small">Racing age is entered directly. The federation's racing-age rule is not calculated in this prototype.</p>
        </section>

        {config.days.map((day, di) => (
          <section key={day.id} className="pv-day" style={{ ['--day' as string]: dayHue(di) }} aria-labelledby={`pv-${day.id}`}>
            <h2 className="pv-day__title" id={`pv-${day.id}`}>
              {day.label} <span>{formatDate(day.date)}</span>
            </h2>
            {config.races
              .filter((r) => r.dayId === day.id)
              .map((race) => {
                const cats = sortCategories(config.categories.filter((c) => c.raceId === race.id && c.status !== 'archived'));
                const groups = [...[...config.displayGroups].sort((a, b) => a.sortOrder - b.sortOrder).map((g) => ({ id: g.id as string | null, name: g.name })), { id: null, name: 'Other categories' }]
                  .map((g) => ({ ...g, cats: cats.filter((c) => c.displayGroupId === g.id) }))
                  .filter((g) => g.cats.length);
                return (
                  <div key={race.id} className="pv-race">
                    <h3 className="pv-race__title">
                      {race.name}
                      {race.course && <span>{race.course}</span>}
                    </h3>
                    {groups.map((g) => (
                      <div key={g.id ?? 'none'}>
                        <h4 className="pv-group">{g.name}</h4>
                        <ul className="pv-list">
                          {g.cats.map((cat) => (
                            <PreviewRow key={cat.id} draft={draft} cat={cat} result={checking ? evaluateCategory(cat, rider) : null} />
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                );
              })}
          </section>
        ))}
      </main>
    </div>
  );
}

function PreviewRow({ draft, cat, result }: { draft: Draft; cat: Category; result: EligibilityResult | null }) {
  const { config } = draft;
  const sg = startGroupFor(config, cat);
  const remaining = remainingForCategory(config, draft.data.entries, cat.id);
  const partners = sg ? startGroupCategoryIds(config, sg.id).filter((id) => id !== cat.id).map((id) => config.categories.find((c) => c.id === id)!.name) : [];
  const firstInGroup = sg ? sortCategories(config.categories.filter((c) => c.startGroupId === sg.id && c.status !== 'archived'))[0]?.id === cat.id : false;
  const statusLabel = { eligible: 'You qualify', needs_review: 'Needs organizer review', ineligible: 'Not eligible' } as const;
  return (
    <li className={`pv-row ${result ? `pv-row--${result.status}` : ''} ${cat.status === 'closed' ? 'is-closed' : ''}`}>
      <div className="pv-row__time num">{sg ? formatTime(sg.startTime) : 'TBA'}</div>
      <div className="pv-row__body">
        <p className="pv-row__name">
          <code className="code">{cat.classifications[0]?.code || cat.timingCode}</code>
          {cat.name}
          {result && <span className={`status status--${result.status}`}>{statusLabel[result.status]}</span>}
        </p>
        <p className="pv-row__elig">{summarizeEligibility(cat)}</p>
        {result && result.reasons.length > 0 && <p className="pv-row__reason">{result.reasons.join('; ')}</p>}
        {result?.status === 'eligible' && <p className="pv-row__reason">License not yet verified: entry will be marked for review.</p>}
        {partners.length > 0 && (
          <p className="pv-row__note">
            <Icon name="clip" size={12} /> Starts together with {partners.join(', ')}. Scored separately.
          </p>
        )}
        {sg && partners.length > 0 && firstInGroup && (
          <div className="pv-row__tally">
            <Tally config={config} entries={draft.data.entries} group={sg} cats={sortCategories(config.categories.filter((c) => c.startGroupId === sg.id && c.status !== 'archived'))} />
          </div>
        )}
        {cat.eligibility.guardianRequired && <p className="pv-row__note">A parent or guardian completes this entry.</p>}
        {cat.description && <p className="pv-row__desc">{cat.description}</p>}
        {cat.prizeText && <p className="pv-row__desc">{cat.prizeText}</p>}
      </div>
      <dl className="pv-row__facts">
        <div>
          <dt>Length</dt>
          <dd>{formatLength(cat.length)}</dd>
        </div>
        <div>
          <dt>Staging</dt>
          <dd className="num">{sg?.stagingTime ? formatTime(sg.stagingTime) : '·'}</dd>
        </div>
        <div>
          <dt>Price</dt>
          <dd>
            {priceLine(cat)}
            {cat.pricing.dayOfSurchargeCents > 0 && <span className="pv-row__sub">+{formatCents(cat.pricing.dayOfSurchargeCents)} on race day</span>}
          </dd>
        </div>
        <div>
          <dt>Places</dt>
          <dd>{cat.status === 'closed' ? 'Closed' : remaining === null ? 'Open' : remaining === 0 ? 'Full' : `${remaining} left`}</dd>
        </div>
      </dl>
    </li>
  );
}
