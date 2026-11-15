import { useState } from 'react';
import { copyDay } from '../shared/bulk';
import { addDays, newId } from '../shared/factory';
import type { EventConfig } from '../shared/schema';
import { ApiError } from './api';
import type { Draft } from './Builder';
import { TIME_ZONES } from './format';
import { dayHue, Field, Icon, IntInput, MoneyInput } from './ui';

export function EventSettings({ draft }: { draft: Draft }) {
  const { config, update } = draft;
  const setEvent = (p: Partial<EventConfig['event']>) => update((c) => ({ ...c, event: { ...c.event, ...p } }));
  const [clearMsg, setClearMsg] = useState<string | null>(null);

  const addRace = (dayId: string) =>
    update((c) => {
      const name = `Race ${c.races.length + 1}`;
      return { ...c, races: [...c.races, { id: newId('race'), dayId, name, discipline: 'criterium', course: '' }] };
    });

  const addDay = () =>
    update((c) => {
      const last = c.days[c.days.length - 1];
      return { ...c, days: [...c.days, { id: newId('day'), date: addDays(last.date, 1), label: `Day ${c.days.length + 1}` }] };
    });

  return (
    <div className="settings">
      <h2 className="page-title">Event setup</h2>

      <section className="settings__section">
        <h3>Event details</h3>
        <div className="form-row">
          <Field label="Event name">{(id) => <input id={id} className="input" value={config.event.name} onChange={(e) => setEvent({ name: e.target.value })} maxLength={120} />}</Field>
          <Field label="Venue">{(id) => <input id={id} className="input" value={config.event.venue} onChange={(e) => setEvent({ venue: e.target.value })} maxLength={200} />}</Field>
        </div>
        <Field label="Time zone" hint="All start times and registration windows use this zone.">
          {(id, d) => (
            <select id={id} aria-describedby={d} className="input input--auto" value={config.event.timeZone} onChange={(e) => setEvent({ timeZone: e.target.value })}>
              {TIME_ZONES.map((z) => (
                <option key={z}>{z}</option>
              ))}
            </select>
          )}
        </Field>
      </section>

      <section className="settings__section">
        <h3>Eligibility rule source</h3>
        <p className="muted">Record where the eligibility rules come from and for which season, so last year's rules are not reused without review.</p>
        <div className="form-row">
          <Field label="Source" hint="For example, the federation rulebook edition and date checked">
            {(id, d) => <input id={id} aria-describedby={d} className="input" value={config.ruleSet.source} onChange={(e) => update((c) => ({ ...c, ruleSet: { ...c.ruleSet, source: e.target.value } }))} maxLength={200} />}
          </Field>
          <Field label="Season">
            {(id) => <IntInput id={id} value={config.ruleSet.season} min={2000} max={2100} allowEmpty={false} onCommit={(v) => v && update((c) => ({ ...c, ruleSet: { ...c.ruleSet, season: v } }))} />}
          </Field>
        </div>
      </section>

      <section className="settings__section">
        <h3>Race days and races</h3>
        {config.days.map((day, di) => {
          const races = config.races.filter((r) => r.dayId === day.id);
          return (
            <div className="day-block" key={day.id} style={{ ['--day' as string]: dayHue(di) }}>
              <div className="form-row">
                <Field label="Day label">{(id) => <input id={id} className="input" value={day.label} onChange={(e) => update((c) => ({ ...c, days: c.days.map((d) => (d.id === day.id ? { ...d, label: e.target.value } : d)) }))} maxLength={60} />}</Field>
                <Field label="Date">
                  {(id) => <input id={id} type="date" className="input" value={day.date} onChange={(e) => e.target.value && update((c) => ({ ...c, days: c.days.map((d) => (d.id === day.id ? { ...d, date: e.target.value } : d)) }))} />}
                </Field>
              </div>
              <table className="mini-table">
                <thead>
                  <tr>
                    <th scope="col">Race</th>
                    <th scope="col">Type</th>
                    <th scope="col">Course</th>
                    <th scope="col">
                      <span className="sr-only">Remove</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {races.map((r) => {
                    const used = config.categories.some((c) => c.raceId === r.id) || config.startGroups.some((g) => g.raceId === r.id);
                    const patch = (p: Partial<typeof r>) => update((c) => ({ ...c, races: c.races.map((x) => (x.id === r.id ? { ...x, ...p } : x)) }));
                    return (
                      <tr key={r.id}>
                        <td>
                          <input className="input" aria-label="Race name" value={r.name} onChange={(e) => patch({ name: e.target.value })} maxLength={120} />
                        </td>
                        <td>
                          <select className="input" aria-label={`Type of ${r.name}`} value={r.discipline} onChange={(e) => patch({ discipline: e.target.value as 'road_race' | 'criterium' })}>
                            <option value="road_race">Road race</option>
                            <option value="criterium">Criterium</option>
                          </select>
                        </td>
                        <td>
                          <input className="input" aria-label={`Course for ${r.name}`} value={r.course} onChange={(e) => patch({ course: e.target.value })} maxLength={200} />
                        </td>
                        <td>
                          <button className="icon-btn" disabled={used} title={used ? 'Remove its categories and start groups first' : undefined} aria-label={`Remove ${r.name}`} onClick={() => update((c) => ({ ...c, races: c.races.filter((x) => x.id !== r.id) }))}>
                            <Icon name="trash" size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="row-actions">
                <button className="btn btn--ghost btn--small" onClick={() => addRace(day.id)}>
                  <Icon name="plus" /> Add race to {day.label}
                </button>
                {races.length > 0 && config.days.length > 1 && <CopyDay draft={draft} fromDayId={day.id} />}
                {races.length === 0 && config.days.length > 1 && (
                  <button className="btn btn--ghost btn--small btn--danger" onClick={() => update((c) => ({ ...c, days: c.days.filter((d) => d.id !== day.id) }))}>
                    <Icon name="trash" /> Remove day
                  </button>
                )}
              </div>
            </div>
          );
        })}
        <button className="btn btn--secondary btn--small" onClick={addDay} disabled={config.days.length >= 7}>
          <Icon name="plus" /> Add race day
        </button>
      </section>

      <section className="settings__section">
        <h3>Bundles, discounts, and rider policies</h3>
        <p className="muted">
          A bundle discounts an order that has an entry in each of its races, such as a road race and criterium weekend. Entries outside a bundle after the first get the additional-race
          discount. An entry never gets two discounts.
        </p>
        {config.registration.bundles.map((b) => {
          const patch = (p: Partial<typeof b>) => update((c) => ({ ...c, registration: { ...c.registration, bundles: c.registration.bundles.map((x) => (x.id === b.id ? { ...x, ...p } : x)) } }));
          return (
            <fieldset className="day-block bundle" key={b.id}>
              <legend className="sr-only">Bundle {b.name}</legend>
              <div className="form-row">
                <Field label="Bundle name">{(id) => <input id={id} className="input" value={b.name} onChange={(e) => patch({ name: e.target.value })} maxLength={80} />}</Field>
                <Field label="Discount" hint={b.priceCents !== null ? 'Not used while a fixed price is set' : undefined}>
                  {(id, d) => <MoneyInput id={id} describedBy={d} cents={b.discountCents} onCommit={(v) => patch({ discountCents: v })} />}
                </Field>
                <Field label="Or a fixed bundle price" hint="Leave blank to use the discount">
                  {(id, d) => <MoneyInput id={id} describedBy={d} cents={b.priceCents} onCommit={(v) => patch({ priceCents: v })} onClear={() => patch({ priceCents: null })} />}
                </Field>
              </div>
              <div className="chips" role="group" aria-label={`Races in ${b.name}`}>
                {config.races.map((r) => (
                  <label key={r.id} className={`chip ${b.raceIds.includes(r.id) ? 'is-on' : ''}`}>
                    <input type="checkbox" checked={b.raceIds.includes(r.id)} onChange={() => patch({ raceIds: b.raceIds.includes(r.id) ? b.raceIds.filter((x) => x !== r.id) : [...b.raceIds, r.id] })} />
                    {r.name}
                  </label>
                ))}
              </div>
              <button className="btn btn--ghost btn--small btn--danger" onClick={() => update((c) => ({ ...c, registration: { ...c.registration, bundles: c.registration.bundles.filter((x) => x.id !== b.id) } }))}>
                <Icon name="trash" /> Remove bundle
              </button>
            </fieldset>
          );
        })}
        <button
          className="btn btn--ghost btn--small"
          onClick={() =>
            update((c) => ({ ...c, registration: { ...c.registration, bundles: [...c.registration.bundles, { id: newId('bundle'), name: 'Weekend entry', raceIds: c.races.map((r) => r.id), discountCents: 1000, priceCents: null }] } }))
          }
        >
          <Icon name="plus" /> Add bundle
        </button>
        <div className="form-row">
          <Field label="Additional-race discount" hint="Per extra entry outside a bundle">
            {(id, d) => <MoneyInput id={id} describedBy={d} cents={config.registration.additionalRaceDiscountCents} onCommit={(v) => update((c) => ({ ...c, registration: { ...c.registration, additionalRaceDiscountCents: v } }))} />}
          </Field>
          <Field label="Additional-race discount applies">
            {(id) => (
              <select
                id={id}
                className="input"
                value={config.registration.additionalRaceDiscountMode}
                onChange={(e) => update((c) => ({ ...c, registration: { ...c.registration, additionalRaceDiscountMode: e.target.value as 'each_additional_entry' | 'once_same_day' } }))}
              >
                <option value="each_additional_entry">To every entry after the first</option>
                <option value="once_same_day">Once per order, when two entries share a day</option>
              </select>
            )}
          </Field>
          <Field label="Extra entry in the same race" hint="Flat price for each entry after the first in one race; 0 for none">
            {(id, d) => (
              <MoneyInput
                id={id}
                describedBy={d}
                cents={config.registration.sameRaceExtraEntryCents ?? 0}
                onCommit={(v) => update((c) => ({ ...c, registration: { ...c.registration, sameRaceExtraEntryCents: v > 0 ? v : null } }))}
              />
            )}
          </Field>
          <Field label="Recovery between races (minutes)" hint="Shorter gaps warn the rider">
            {(id, d) => <IntInput id={id} describedBy={d} value={config.registration.recoveryMinutes} min={0} max={180} allowEmpty={false} onCommit={(v) => v !== null && update((c) => ({ ...c, registration: { ...c.registration, recoveryMinutes: v } }))} />}
          </Field>
        </div>
        <div className="form-row">
          <Field label="Platform fee per order">
            {(id) => <MoneyInput id={id} cents={config.registration.platformFeeCents} onCommit={(v) => update((c) => ({ ...c, registration: { ...c.registration, platformFeeCents: v } }))} />}
          </Field>
          <Field label="Platform fee label">
            {(id) => <input id={id} className="input" value={config.registration.platformFeeLabel} onChange={(e) => update((c) => ({ ...c, registration: { ...c.registration, platformFeeLabel: e.target.value } }))} maxLength={60} />}
          </Field>
          <Field label="Processing fee (% after discounts)" hint="Whole or decimal percent, for example 3">
            {(id, d) => (
              <input
                id={id}
                aria-describedby={d}
                inputMode="decimal"
                className="input input--num"
                defaultValue={config.registration.processingFeeBasisPoints / 100}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (e.target.value.trim() !== '' && n >= 0 && n <= 20) update((c) => ({ ...c, registration: { ...c.registration, processingFeeBasisPoints: Math.round(n * 100) } }));
                }}
              />
            )}
          </Field>
          <Field label="Processing fee label">
            {(id) => <input id={id} className="input" value={config.registration.processingFeeLabel} onChange={(e) => update((c) => ({ ...c, registration: { ...c.registration, processingFeeLabel: e.target.value } }))} maxLength={60} />}
          </Field>
        </div>
        {config.event.isDemo && (
          <label className="check">
            <input type="checkbox" checked={config.registration.demoIgnoreWindows} onChange={(e) => update((c) => ({ ...c, registration: { ...c.registration, demoIgnoreWindows: e.target.checked } }))} />
            Demo event: let testers register outside the registration windows (real events always enforce them)
          </label>
        )}
        <Field label="Refund policy shown before payment">
          {(id) => <textarea id={id} className="input" rows={3} value={config.registration.refundPolicy} onChange={(e) => update((c) => ({ ...c, registration: { ...c.registration, refundPolicy: e.target.value } }))} maxLength={1000} />}
        </Field>
        <div className="form-row">
          <Field label="Waiver version" hint="Change it whenever the text changes">
            {(id, d) => <input id={id} aria-describedby={d} className="input input--code" value={config.registration.waiverVersion} onChange={(e) => update((c) => ({ ...c, registration: { ...c.registration, waiverVersion: e.target.value } }))} maxLength={40} />}
          </Field>
        </div>
        <Field label="Waiver text" hint="A sanctioned event must use the federation's approved waiver; that connection is not built.">
          {(id, d) => <textarea id={id} aria-describedby={d} className="input" rows={6} value={config.registration.waiverText} onChange={(e) => update((c) => ({ ...c, registration: { ...c.registration, waiverText: e.target.value } }))} maxLength={4000} />}
        </Field>
      </section>

      <section className="settings__section">
        <h3>Display groups</h3>
        <p className="muted">Headings that arrange categories on the rider schedule. They never create a start, price, or limit.</p>
        <ul className="dg-list">
          {[...config.displayGroups]
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((g, i, arr) => {
              const used = config.categories.filter((c) => c.displayGroupId === g.id).length;
              const swap = (dir: -1 | 1) => {
                const other = arr[i + dir];
                update((c) => ({ ...c, displayGroups: c.displayGroups.map((x) => (x.id === g.id ? { ...x, sortOrder: other.sortOrder } : x.id === other.id ? { ...x, sortOrder: g.sortOrder } : x)) }));
              };
              return (
                <li key={g.id}>
                  <input className="input" aria-label="Display group name" value={g.name} onChange={(e) => update((c) => ({ ...c, displayGroups: c.displayGroups.map((x) => (x.id === g.id ? { ...x, name: e.target.value } : x)) }))} maxLength={80} />
                  <span className="muted small">{used} {used === 1 ? 'category' : 'categories'}</span>
                  <button className="icon-btn" disabled={i === 0} aria-label={`Move ${g.name} up`} onClick={() => swap(-1)}>
                    <Icon name="up" size={14} />
                  </button>
                  <button className="icon-btn" disabled={i === arr.length - 1} aria-label={`Move ${g.name} down`} onClick={() => swap(1)}>
                    <Icon name="down" size={14} />
                  </button>
                  <button
                    className="icon-btn"
                    aria-label={`Remove ${g.name}`}
                    onClick={() =>
                      update((c) => ({ ...c, displayGroups: c.displayGroups.filter((x) => x.id !== g.id), categories: c.categories.map((x) => (x.displayGroupId === g.id ? { ...x, displayGroupId: null } : x)) }))
                    }
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </li>
              );
            })}
        </ul>
        <button
          className="btn btn--ghost btn--small"
          onClick={() => update((c) => ({ ...c, displayGroups: [...c.displayGroups, { id: newId('dg'), name: 'New display group', sortOrder: Math.max(-1, ...c.displayGroups.map((g) => g.sortOrder)) + 1 }] }))}
        >
          <Icon name="plus" /> Add display group
        </button>
      </section>

      <section className="settings__section">
        <h3>Test entries</h3>
        <p className="muted">
          {draft.data.entries.length} {draft.data.entries.length === 1 ? 'place is' : 'places are'} taken in this event, counting test entries, registrations, held places, and waitlist offers.
          Test entries hold places so you can check limits. They contain no rider data and no payment.
        </p>
        <button
          className="btn btn--secondary btn--small"
          disabled={draft.data.entries.length === 0}
          onClick={async () => {
            try {
              const n = await draft.clearTestEntries();
              setClearMsg(`Removed ${n} test ${n === 1 ? 'entry' : 'entries'}.`);
            } catch (e) {
              setClearMsg((e as ApiError).message);
            }
          }}
        >
          Remove test entries only
        </button>
        <p className="muted small">This removes test entries only. Registrations, held places, and waitlist offers stay.</p>
        {clearMsg && (
          <p className="note" role="status">
            {clearMsg}
          </p>
        )}
      </section>
    </div>
  );
}

/** Copy a day's races, start groups, and categories to another day. Copies are flagged for review. */
function CopyDay({ draft, fromDayId }: { draft: Draft; fromDayId: string }) {
  const { config, update } = draft;
  const others = config.days.filter((d) => d.id !== fromDayId);
  const [to, setTo] = useState(others[0]?.id ?? '');
  const [done, setDone] = useState<string | null>(null);
  const from = config.days.find((d) => d.id === fromDayId)!;
  const copy = () => {
    const target = config.days.find((d) => d.id === to);
    if (!target) return;
    const preview = copyDay(config, fromDayId, to);
    update((c) => copyDay(c, fromDayId, to).config);
    setDone(`Copied ${preview.races} ${preview.races === 1 ? 'race' : 'races'} and ${preview.categories} ${preview.categories === 1 ? 'category' : 'categories'} to ${target.label}. Each copy is marked "Review copy": check times, prices, windows, codes, and capacity.`);
  };
  return (
    <span className="copy-day">
      <label className="small" htmlFor={`copy-${fromDayId}`}>
        Copy {from.label}’s races to
      </label>
      <select id={`copy-${fromDayId}`} className="input" value={to} onChange={(e) => (setTo(e.target.value), setDone(null))}>
        {others.map((d) => (
          <option key={d.id} value={d.id}>
            {d.label} ({d.date})
          </option>
        ))}
      </select>
      <button className="btn btn--ghost btn--small" onClick={copy} disabled={!to}>
        Copy
      </button>
      {done && (
        <span className="small text-ok" role="status">
          {done}
        </span>
      )}
    </span>
  );
}
