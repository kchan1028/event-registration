import { useState } from 'react';
import { addDays, newId } from '../shared/factory';
import type { EventConfig } from '../shared/schema';
import { ApiError } from './api';
import type { Draft } from './Builder';
import { dayHue, Field, Icon, IntInput } from './ui';

const TIME_ZONES = ['America/Los_Angeles', 'America/Denver', 'America/Phoenix', 'America/Chicago', 'America/New_York', 'America/Anchorage', 'Pacific/Honolulu'];

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
          {draft.data.entries.length} simulated {draft.data.entries.length === 1 ? 'entry' : 'entries'} in this event. They hold places so you can check limits. They contain no rider data
          and no payment.
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
          Remove all test entries
        </button>
        {clearMsg && (
          <p className="note" role="status">
            {clearMsg}
          </p>
        )}
      </section>
    </div>
  );
}
