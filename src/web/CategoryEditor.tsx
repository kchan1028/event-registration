import { useEffect, useId, useRef, useState } from 'react';
import { usageForCategory } from '../shared/capacity';
import { licenseLabel, summarizePath } from '../shared/eligibility';
import { blankPath, newId, updateCategory } from '../shared/factory';
import { formatTime } from '../shared/format';
import { COLLEGIATE_DIVISIONS, LICENSE_CATEGORIES, type Category, type EligibilityPath, type RaceLength } from '../shared/schema';
import { OFFER_HOURS } from '../shared/waitlist';
import { ApiError } from './api';
import type { Draft } from './Builder';
import { duplicateAndSelect } from './CategoryTable';
import { Field, Icon, IntInput, MoneyInput, Pending } from './ui';

export function CategoryEditor({ draft, categoryId, onClose, onSelect, drawer = false }: { draft: Draft; categoryId: string; onClose: () => void; onSelect: (id: string) => void; drawer?: boolean }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  // As a drawer over the page (narrow screens), move focus into it and give it back on close.
  useEffect(() => {
    if (!drawer) return;
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => opener?.focus?.();
  }, [drawer]);
  const { config, update } = draft;
  const cat = config.categories.find((c) => c.id === categoryId)!;
  const race = config.races.find((r) => r.id === cat.raceId)!;
  const groups = config.startGroups.filter((g) => g.raceId === cat.raceId);
  // Every place in use in this category: test entries, confirmed and held order entries, and live waitlist offers.
  const entries = draft.data.entries.filter((e) => e.categoryId === cat.id).length;
  const issues = draft.issues.filter((i) => i.target.kind === 'category' && i.target.id === cat.id);
  const set = (fn: (c: Category) => Category) => update((cfg) => updateCategory(cfg, cat.id, fn));

  const remove = () => {
    if (entries > 0) {
      set((c) => ({ ...c, status: 'archived' }));
      onClose();
      return;
    }
    update((cfg) => ({
      ...cfg,
      categories: cfg.categories.filter((c) => c.id !== cat.id),
      capacityPools: cfg.capacityPools.map((p) => ({ ...p, memberCategoryIds: p.memberCategoryIds.filter((id) => id !== cat.id) })),
    }));
    onClose();
  };

  return (
    <div className="editor">
      <header className="editor__head">
        <p className="editor__context">{draft.readOnly ? `A category in ${race.name} (view only)` : `Editing a category in ${race.name}`}</p>
        <button ref={closeRef} className="icon-btn editor__close" onClick={onClose} aria-label={draft.readOnly ? 'Close category details' : 'Close category editor'}>
          <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </header>

      {/* View only: the values below are switched off together and the buttons that change them are hidden. The wrapper takes no space of its own. */}
      <fieldset className="editor__fields" disabled={draft.readOnly} style={{ display: 'contents' }}>
      <Field label="Category name" className="field--title">
        {(id) => <input id={id} className="input input--title" value={cat.name} onChange={(e) => set((c) => ({ ...c, name: e.target.value }))} maxLength={120} />}
      </Field>

      {cat.needsReview && (
        <div className="alert alert--warn">
          <p>{draft.readOnly ? 'An organizer has not finished reviewing this copied category.' : cat.reviewReason}</p>
          <button className="btn btn--small btn--secondary" onClick={() => set((c) => ({ ...c, needsReview: false, reviewReason: '' }))}>
            <Icon name="check" /> I have reviewed this copy
          </button>
        </div>
      )}
      {cat.status === 'archived' && (
        <div className="alert alert--warn">
          <p>This category is archived. It keeps its {entries} {entries === 1 ? 'entry' : 'entries'} and is hidden from the schedule.</p>
          <button className="btn btn--small btn--secondary" onClick={() => set((c) => ({ ...c, status: 'active' }))}>
            Restore category
          </button>
        </div>
      )}
      {!draft.readOnly && issues.length > 0 && (
        <ul className="editor__issues" aria-label="Problems in this category">
          {issues.map((i) => (
            <li key={i.key} className={`issue issue--${i.level}`}>
              <Icon name={i.level === 'error' ? 'error' : 'warn'} size={14} />
              {i.message}
            </li>
          ))}
        </ul>
      )}

      <section className="editor__section" aria-labelledby={`${cat.id}-id`}>
        <h3 id={`${cat.id}-id`}>Identity and listing</h3>
        <div className="form-row form-row--start">
          <Field label="Timing code" hint="Short code on start lists">
            {(id, d) => <input id={id} aria-describedby={d} className="input input--code" value={cat.timingCode} onChange={(e) => set((c) => ({ ...c, timingCode: e.target.value.toUpperCase() }))} maxLength={24} />}
          </Field>
          <Field label="Status">
            {(id) => (
              <select id={id} className="input" value={cat.status} onChange={(e) => set((c) => ({ ...c, status: e.target.value as Category['status'] }))}>
                <option value="active">Open for entries</option>
                <option value="closed">Closed to new entries</option>
                {cat.status === 'archived' && <option value="archived">Archived</option>}
              </select>
            )}
          </Field>
        </div>
        <Field label="Display group" hint="Only changes where it is listed. Never sets a limit.">
          {(id, d) => (
            <select id={id} aria-describedby={d} className="input" value={cat.displayGroupId ?? ''} onChange={(e) => set((c) => ({ ...c, displayGroupId: e.target.value || null }))}>
              <option value="">No display group</option>
              {[...config.displayGroups]
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
            </select>
          )}
        </Field>
        <Field label="Description for riders">
          {(id) => <textarea id={id} className="input" rows={2} value={cat.description} onChange={(e) => set((c) => ({ ...c, description: e.target.value }))} maxLength={1000} />}
        </Field>
      </section>

      <section className="editor__section" aria-labelledby={`${cat.id}-elig`}>
        <h3 id={`${cat.id}-elig`}>Who can enter</h3>
        <p className="editor__help">A rider qualifies if they meet every condition in at least one path. Category numbers are not treated as a ladder{draft.readOnly ? '.' : ': list each allowed category.'}</p>
        {cat.eligibility.paths.map((p, i) => (
          <PathEditor
            key={p.id}
            path={p}
            index={i}
            total={cat.eligibility.paths.length}
            onChange={(np) => set((c) => ({ ...c, eligibility: { ...c.eligibility, paths: c.eligibility.paths.map((x) => (x.id === p.id ? np : x)) } }))}
            onRemove={() => set((c) => ({ ...c, eligibility: { ...c.eligibility, paths: c.eligibility.paths.filter((x) => x.id !== p.id) } }))}
          />
        ))}
        <button className="btn btn--ghost btn--small" onClick={() => set((c) => ({ ...c, eligibility: { ...c.eligibility, paths: [...c.eligibility.paths, blankPath()] } }))} disabled={cat.eligibility.paths.length >= 10}>
          <Icon name="plus" /> Add another way to qualify (OR)
        </button>
        <div className="checks">
          <label className="check">
            <input type="checkbox" checked={cat.eligibility.organizerReview} onChange={(e) => set((c) => ({ ...c, eligibility: { ...c.eligibility, organizerReview: e.target.checked } }))} />
            Organizer reviews every entry before it is cleared
          </label>
          <label className="check">
            <input type="checkbox" checked={cat.eligibility.guardianRequired} onChange={(e) => set((c) => ({ ...c, eligibility: { ...c.eligibility, guardianRequired: e.target.checked } }))} />
            Parent or guardian must complete the entry
          </label>
        </div>
        <Pending>License data is unverified until USA Cycling checks are connected. Riders are marked for review, never cleared.</Pending>
      </section>

      <section className="editor__section" aria-labelledby={`${cat.id}-start`}>
        <h3 id={`${cat.id}-start`}>Start and race length</h3>
        <Field label="Start group" hint="The start group sets the start and staging times.">
          {(id, d) => (
            <select id={id} aria-describedby={d} className="input" value={cat.startGroupId ?? ''} onChange={(e) => set((c) => ({ ...c, startGroupId: e.target.value || null }))}>
              <option value="">Not in a start group</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.startTime ? `${formatTime(g.startTime)} · ` : ''}
                  {g.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <LengthEditor readOnly={draft.readOnly} length={cat.length} discipline={race.discipline} onChange={(l) => set((c) => ({ ...c, length: l }))} />
      </section>

      <section className="editor__section" aria-labelledby={`${cat.id}-price`}>
        <h3 id={`${cat.id}-price`}>Price and registration window</h3>
        <div className="form-row form-row--start">
          <Field label="Entry price" hint="0 means free">
            {(id, d) => <MoneyInput id={id} describedBy={d} cents={cat.pricing.baseCents} onCommit={(v) => set((c) => ({ ...c, pricing: { ...c.pricing, baseCents: v } }))} />}
          </Field>
          <Field label="Day-of surcharge">
            {(id) => <MoneyInput id={id} cents={cat.pricing.dayOfSurchargeCents} onCommit={(v) => set((c) => ({ ...c, pricing: { ...c.pricing, dayOfSurchargeCents: v } }))} />}
          </Field>
        </div>
        <fieldset className="subfields">
          <legend>Scheduled price changes</legend>
          {cat.pricing.priceChanges.length === 0 && <p className="muted small">None. The entry price applies until registration closes.</p>}
          {cat.pricing.priceChanges.map((pc, i) => (
            <div className="form-row form-row--tight" key={i}>
              <Field label="From">
                {(id) => (
                  <input
                    id={id}
                    type="date"
                    className="input"
                    value={pc.effectiveFrom}
                    onChange={(e) => e.target.value && set((c) => ({ ...c, pricing: { ...c.pricing, priceChanges: c.pricing.priceChanges.map((x, j) => (j === i ? { ...x, effectiveFrom: e.target.value } : x)) } }))}
                  />
                )}
              </Field>
              <Field label="New price">
                {(id) => <MoneyInput id={id} cents={pc.cents} onCommit={(v) => set((c) => ({ ...c, pricing: { ...c.pricing, priceChanges: c.pricing.priceChanges.map((x, j) => (j === i ? { ...x, cents: v } : x)) } }))} />}
              </Field>
              <button className="icon-btn" aria-label="Remove price change" onClick={() => set((c) => ({ ...c, pricing: { ...c.pricing, priceChanges: c.pricing.priceChanges.filter((_, j) => j !== i) } }))}>
                <Icon name="trash" size={14} />
              </button>
            </div>
          ))}
          <button
            className="btn btn--ghost btn--small"
            onClick={() => {
              const day = config.days.find((d) => d.id === race.dayId);
              set((c) => ({ ...c, pricing: { ...c.pricing, priceChanges: [...c.pricing.priceChanges, { effectiveFrom: day?.date ?? '2027-01-01', cents: c.pricing.baseCents }] } }));
            }}
          >
            <Icon name="plus" /> Add price change
          </button>
        </fieldset>
        <div className="form-row">
          <Field label="Registration opens" hint={config.event.timeZone}>
            {(id, d) => <input id={id} aria-describedby={d} type="datetime-local" className="input" value={cat.registration.opensAt ?? ''} onChange={(e) => set((c) => ({ ...c, registration: { ...c.registration, opensAt: e.target.value || null } }))} />}
          </Field>
          <Field label="Registration closes" hint={config.event.timeZone}>
            {(id, d) => <input id={id} aria-describedby={d} type="datetime-local" className="input" value={cat.registration.closesAt ?? ''} onChange={(e) => set((c) => ({ ...c, registration: { ...c.registration, closesAt: e.target.value || null } }))} />}
          </Field>
        </div>
        <Pending>{draft.data.pending.payments}</Pending>
      </section>

      <section className="editor__section" aria-labelledby={`${cat.id}-cap`}>
        <h3 id={`${cat.id}-cap`}>Capacity</h3>
        <Field label="Category cap" hint={`Blank: no cap of its own.${draft.readOnly ? '' : ` Cannot go below the ${entries} ${entries === 1 ? 'place' : 'places'} already taken.`}`}>
          {(id, d) => <IntInput id={id} describedBy={d} value={cat.cap} min={Math.max(1, entries)} onCommit={(v) => set((c) => ({ ...c, cap: v }))} />}
        </Field>
        <label className="check">
          <input type="checkbox" checked={!!cat.waitlistEnabled} onChange={(e) => set((c) => ({ ...c, waitlistEnabled: e.target.checked }))} />
          Offer a waitlist when this category is full ({draft.readOnly ? 'freed places are offered in order' : 'you offer freed places in order'}; each offer holds the place for {OFFER_HOURS} hours)
        </label>
        <CapacityUsage draft={draft} categoryId={cat.id} />
        {!draft.readOnly && <TestEntries draft={draft} categoryId={cat.id} disabled={cat.status !== 'active'} />}
      </section>

      <section className="editor__section" aria-labelledby={`${cat.id}-extras`}>
        <h3 id={`${cat.id}-extras`}>Rider questions, waiver addendum, bib range</h3>
        <p className="editor__help">Asked or applied only for riders entering this category.</p>
        {(cat.questions ?? []).map((q, i) => (
          <div className="extra-q" key={q.id}>
            <Field label={`Question ${i + 1}`}>
              {(id) => (
                <input id={id} className="input" value={q.label} maxLength={120} placeholder={draft.readOnly ? undefined : 'For example: Club or school'} onChange={(e) => set((c) => ({ ...c, questions: (c.questions ?? []).map((x) => (x.id === q.id ? { ...x, label: e.target.value } : x)) }))} />
              )}
            </Field>
            <Field label="Answers to choose from" hint={draft.readOnly ? 'Blank: a free-text answer.' : 'Comma-separated. Leave blank for a free-text answer.'}>
              {(id, d) => (
                <input
                  id={id}
                  aria-describedby={d}
                  className="input"
                  defaultValue={q.options.join(', ')}
                  onBlur={(e) => {
                    const options = [...new Set(e.target.value.split(',').map((x) => x.trim()).filter(Boolean))].slice(0, 10);
                    set((c) => ({ ...c, questions: (c.questions ?? []).map((x) => (x.id === q.id ? { ...x, options } : x)) }));
                  }}
                />
              )}
            </Field>
            <label className="check">
              <input type="checkbox" checked={q.required} onChange={(e) => set((c) => ({ ...c, questions: (c.questions ?? []).map((x) => (x.id === q.id ? { ...x, required: e.target.checked } : x)) }))} />
              Required
            </label>
            <button className="btn btn--ghost btn--small" onClick={() => set((c) => ({ ...c, questions: (c.questions ?? []).filter((x) => x.id !== q.id) }))}>
              <Icon name="trash" /> Remove question
            </button>
          </div>
        ))}
        {(cat.questions ?? []).length < 5 && (
          <button className="btn btn--ghost btn--small" onClick={() => set((c) => ({ ...c, questions: [...(c.questions ?? []), { id: newId('q'), label: '', required: false, options: [] }] }))}>
            <Icon name="plus" /> Add a rider question
          </button>
        )}

        <label className="check">
          <input
            type="checkbox"
            checked={!!cat.addendum}
            onChange={(e) => set((c) => ({ ...c, addendum: e.target.checked ? { title: 'Category rules', text: 'Riders in this category agree to the following:' } : null }))}
          />
          Riders must accept a waiver addendum for this category
        </label>
        {cat.addendum && (
          <>
            <Field label="Addendum title">
              {(id) => <input id={id} className="input" value={cat.addendum!.title} maxLength={80} onChange={(e) => set((c) => ({ ...c, addendum: { ...c.addendum!, title: e.target.value } }))} />}
            </Field>
            <Field label="Addendum text" hint="Shown on the waiver step; the rider ticks a box to accept it.">
              {(id, d) => <textarea id={id} aria-describedby={d} className="input" rows={4} maxLength={4000} value={cat.addendum!.text} onChange={(e) => set((c) => ({ ...c, addendum: { ...c.addendum!, text: e.target.value } }))} />}
            </Field>
          </>
        )}

        <div className="form-row form-row--tight form-row--start">
          <Field label="Bib range: first" hint="Blank: use the event or day range.">
            {(id, d) => (
              <IntInput id={id} describedBy={d} value={cat.bibRange?.first ?? null} min={1} max={99999} onCommit={(v) => set((c) => ({ ...c, bibRange: v === null ? null : { first: v, last: c.bibRange?.last ?? v + 99 } }))} />
            )}
          </Field>
          <Field label="Bib range: last">
            {(id) => <IntInput id={id} value={cat.bibRange?.last ?? null} min={1} max={99999} onCommit={(v) => set((c) => ({ ...c, bibRange: v === null ? null : { first: c.bibRange?.first ?? Math.max(1, v - 99), last: v } }))} />}
          </Field>
        </div>
      </section>

      <section className="editor__section" aria-labelledby={`${cat.id}-class`}>
        <h3 id={`${cat.id}-class`}>Timer classification</h3>
        <p className="editor__help">The code the timer scores this category under. Sharing a start never merges classifications.</p>
        {cat.classifications.map((k, i) => (
          <div className="form-row form-row--tight" key={i}>
            <Field label="Code">
              {(id) => <input id={id} className="input input--code" value={k.code} onChange={(e) => set((c) => ({ ...c, classifications: c.classifications.map((x, j) => (j === i ? { ...x, code: e.target.value.toUpperCase() } : x)) }))} maxLength={24} />}
            </Field>
            <Field label="Label">
              {(id) => <input id={id} className="input" value={k.label} onChange={(e) => set((c) => ({ ...c, classifications: c.classifications.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) }))} maxLength={80} />}
            </Field>
            {cat.classifications.length > 1 && (
              <button className="icon-btn" aria-label="Remove classification" onClick={() => set((c) => ({ ...c, classifications: c.classifications.filter((_, j) => j !== i) }))}>
                <Icon name="trash" size={14} />
              </button>
            )}
          </div>
        ))}
        <div className="row-actions">
          <button className="btn btn--ghost btn--small" onClick={() => set((c) => ({ ...c, classifications: [{ code: c.timingCode, label: c.name }, ...c.classifications.slice(1)] }))}>
            Use timing code and name
          </button>
          <button className="btn btn--ghost btn--small" disabled={cat.classifications.length >= 4} onClick={() => set((c) => ({ ...c, classifications: [...c.classifications, { code: '', label: '' }] }))}>
            <Icon name="plus" /> Add classification
          </button>
        </div>
        {cat.classifications.length > 1 && (
          <label className="check">
            <input type="checkbox" checked={cat.dualScoringApproved} onChange={(e) => set((c) => ({ ...c, dualScoringApproved: e.target.checked }))} />
            Dual scoring is approved for this category
          </label>
        )}
      </section>

      <section className="editor__section" aria-labelledby={`${cat.id}-prize`}>
        <h3 id={`${cat.id}-prize`}>Prizes</h3>
        <Field label="Prize or purse text" hint="Shown to riders as written.">
          {(id, d) => <input id={id} aria-describedby={d} className="input" value={cat.prizeText} onChange={(e) => set((c) => ({ ...c, prizeText: e.target.value }))} maxLength={500} />}
        </Field>
      </section>

      </fieldset>

      {!draft.readOnly && (
        <footer className="editor__foot">
          <button className="btn btn--secondary" onClick={() => duplicateAndSelect(draft, cat.id, onSelect)}>
            <Icon name="copy" /> Duplicate
          </button>
          {cat.status !== 'archived' && (
            <button className="btn btn--ghost btn--danger" onClick={remove}>
              <Icon name="trash" /> {entries > 0 ? 'Archive (has entries)' : 'Delete category'}
            </button>
          )}
        </footer>
      )}
    </div>
  );
}

function PathEditor({ path, index, total, onChange, onRemove }: { path: EligibilityPath; index: number; total: number; onChange: (p: EligibilityPath) => void; onRemove: () => void }) {
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  return (
    <fieldset className="path">
      <legend>
        {total > 1 ? `Way to qualify ${index + 1}` : 'Conditions'} <span className="path__summary">{summarizePath(path)}</span>
      </legend>
      {total > 1 && (
        <button className="icon-btn path__remove" aria-label={`Remove way to qualify ${index + 1}`} onClick={onRemove}>
          <Icon name="trash" size={14} />
        </button>
      )}
      <div className="path__group" role="group" aria-label="Allowed license categories">
        <span className="path__label">License categories</span>
        <div className="chips">
          {LICENSE_CATEGORIES.map((c) => (
            <label key={c} className={`chip ${path.licenseCategories.includes(c) ? 'is-on' : ''}`}>
              <input type="checkbox" checked={path.licenseCategories.includes(c)} onChange={() => onChange({ ...path, licenseCategories: toggle(path.licenseCategories, c) })} />
              {licenseLabel(c)}
            </label>
          ))}
        </div>
        <span className="path__note">{path.licenseCategories.length === 0 ? 'None selected: any license category' : null}</span>
      </div>
      <div className="form-row form-row--3">
        <Field label="Min racing age">{(id) => <IntInput id={id} value={path.minAge} max={120} onCommit={(v) => onChange({ ...path, minAge: v })} />}</Field>
        <Field label="Max racing age">{(id) => <IntInput id={id} value={path.maxAge} max={120} onCommit={(v) => onChange({ ...path, maxAge: v })} />}</Field>
        <Field label="Competition class">
          {(id) => (
            <select id={id} className="input" value={path.genderClass} onChange={(e) => onChange({ ...path, genderClass: e.target.value as EligibilityPath['genderClass'] })}>
              <option value="any">Any</option>
              <option value="women">Women</option>
              <option value="men">Men</option>
            </select>
          )}
        </Field>
      </div>
      <div className="path__group" role="group" aria-label="Allowed license types">
        <span className="path__label">License types</span>
        <div className="chips">
          <label className={`chip ${path.licenseTypes.includes('annual') ? 'is-on' : ''}`}>
            <input type="checkbox" checked={path.licenseTypes.includes('annual')} onChange={() => onChange({ ...path, licenseTypes: toggle(path.licenseTypes, 'annual') })} />
            Annual
          </label>
          <label className={`chip ${path.licenseTypes.includes('one_day') ? 'is-on' : ''}`}>
            <input type="checkbox" checked={path.licenseTypes.includes('one_day')} onChange={() => onChange({ ...path, licenseTypes: toggle(path.licenseTypes, 'one_day') })} />
            One-day
          </label>
        </div>
      </div>
      <div className="path__group">
        <label className="check">
          <input type="checkbox" checked={path.collegiateRequired} onChange={(e) => onChange({ ...path, collegiateRequired: e.target.checked })} />
          Collegiate eligibility required
        </label>
        {path.collegiateRequired && (
          <div className="chips" role="group" aria-label="Collegiate divisions (none selected means any division)">
            {COLLEGIATE_DIVISIONS.map((d) => (
              <label key={d} className={`chip ${path.collegiateDivisions.includes(d) ? 'is-on' : ''}`}>
                <input type="checkbox" checked={path.collegiateDivisions.includes(d)} onChange={() => onChange({ ...path, collegiateDivisions: toggle(path.collegiateDivisions, d) })} />
                Division {d}
              </label>
            ))}
          </div>
        )}
      </div>
    </fieldset>
  );
}

function LengthEditor({ readOnly, length, discipline, onChange }: { readOnly: boolean; length: RaceLength; discipline: string; onChange: (l: RaceLength) => void }) {
  const kinds: { value: RaceLength['kind']; label: string }[] = [
    { value: 'distance', label: 'Distance' },
    { value: 'duration', label: 'Minutes (+ laps)' },
    { value: 'laps', label: 'Laps only' },
  ];
  const groupName = useId();
  const switchKind = (k: RaceLength['kind']) => {
    if (k === 'distance') onChange({ kind: 'distance', distance: 50, unit: 'km', laps: null, partialFinalLap: false });
    else if (k === 'duration') onChange({ kind: 'duration', minutes: discipline === 'criterium' ? 40 : 60, plusLaps: null });
    else if (k === 'laps') onChange({ kind: 'laps', laps: 10 });
  };
  return (
    <fieldset className="subfields">
      <legend>Race length</legend>
      <div className="segmented" role="radiogroup" aria-label="Measure race length by">
        {kinds.map((k) => (
          <label key={k.value} className={`segmented__opt ${length.kind === k.value ? 'is-on' : ''}`}>
            <input type="radio" name={groupName} checked={length.kind === k.value} onChange={() => switchKind(k.value)} />
            {k.label}
          </label>
        ))}
      </div>
      {length.kind === 'unset' && <p className="text-error small">Not set yet.{!readOnly && ' Choose how this race is measured.'}</p>}
      {length.kind === 'distance' && (
        <div className="form-row form-row--3">
          <Field label="Distance">
            {(id) => (
              <input
                id={id}
                inputMode="decimal"
                className="input input--num"
                defaultValue={length.distance}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (n > 0 && n <= 1000) onChange({ ...length, distance: n });
                }}
              />
            )}
          </Field>
          <Field label="Unit">
            {(id) => (
              <select id={id} className="input" value={length.unit} onChange={(e) => onChange({ ...length, unit: e.target.value as 'km' | 'mi' })}>
                <option value="km">km</option>
                <option value="mi">miles</option>
              </select>
            )}
          </Field>
          <Field label="Laps (optional)">{(id) => <IntInput id={id} value={length.laps} min={1} max={500} onCommit={(v) => onChange({ ...length, laps: v })} />}</Field>
          {length.laps !== null && (
            <label className="check">
              <input type="checkbox" checked={length.partialFinalLap} onChange={(e) => onChange({ ...length, partialFinalLap: e.target.checked })} />
              Ends with a partial lap
            </label>
          )}
        </div>
      )}
      {length.kind === 'duration' && (
        <div className="form-row form-row--start">
          <Field label="Minutes">{(id) => <IntInput id={id} value={length.minutes} min={1} max={600} allowEmpty={false} onCommit={(v) => v !== null && onChange({ ...length, minutes: v })} />}</Field>
          <Field label="Plus laps" hint={readOnly ? undefined : 'For example 45 min + 3 laps'}>
            {(id, d) => <IntInput id={id} describedBy={d} value={length.plusLaps} min={0} max={50} onCommit={(v) => onChange({ ...length, plusLaps: v })} />}
          </Field>
        </div>
      )}
      {length.kind === 'laps' && (
        <Field label="Laps">{(id) => <IntInput id={id} value={length.laps} min={1} max={500} allowEmpty={false} onCommit={(v) => v !== null && onChange({ ...length, laps: v })} />}</Field>
      )}
    </fieldset>
  );
}

function CapacityUsage({ draft, categoryId }: { draft: Draft; categoryId: string }) {
  const usage = usageForCategory(draft.config, draft.data.entries, categoryId);
  if (usage.length === 0) return <p className="muted small">No limits apply to this category.{!draft.readOnly && ' Set a cap, a start group field limit, or a shared pool.'}</p>;
  const kindLabel = { category: 'Category cap', start_group: 'Start group field limit', pool: 'Shared pool' } as const;
  const binding = Math.min(...usage.map((u) => u.remaining));
  return (
    <ul className="limits" aria-label="Limits that apply to a new entry">
      {usage.map((u) => (
        <li key={`${u.kind}-${u.id}`} className={u.remaining === binding ? 'is-binding' : ''}>
          <span className="limits__kind">{kindLabel[u.kind]}</span>
          <span className="limits__name">{u.kind === 'category' ? '' : u.name}</span>
          <span className="num">
            {u.used}/{u.limit}
          </span>
          <span className="limits__left">{u.remaining === 0 ? 'full' : `${u.remaining} left`}</span>
        </li>
      ))}
    </ul>
  );
}

function TestEntries({ draft, categoryId, disabled }: { draft: Draft; categoryId: string; disabled: boolean }) {
  const [count, setCount] = useState<number | null>(5);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'warn' | 'error'; text: string } | null>(null);
  const run = async () => {
    if (!count) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await draft.addTestEntries(categoryId, count);
      if (r.created === r.requested) setMsg({ tone: 'ok', text: `Added ${r.created} test ${r.created === 1 ? 'entry' : 'entries'}.` });
      else if (r.blockedBy) setMsg({ tone: 'warn', text: `Added ${r.created} of ${r.requested}. Stopped because ${r.blockedBy.name} is full (${r.blockedBy.used} of ${r.blockedBy.limit}).` });
      else setMsg({ tone: 'warn', text: `Added ${r.created} of ${r.requested}. ${r.reason === 'closed' ? 'The category is not open for entries.' : 'Entry was refused.'}` });
    } catch (e) {
      setMsg({ tone: 'error', text: (e as ApiError).message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="test-entries">
      <p className="test-entries__title">Add test entries</p>
      <p className="muted small">Test entries have no rider data and no payment. They check that caps and shared limits hold. The counts above also include real registrations and held places.</p>
      <div className="form-row form-row--tight">
        <IntInput value={count} min={1} max={500} onCommit={setCount} ariaLabel="Number of test entries" />
        <button className="btn btn--secondary btn--small" onClick={run} disabled={busy || disabled || !count}>
          {busy ? 'Adding…' : 'Add test entries'}
        </button>
      </div>
      {msg && (
        <p className={`note note--${msg.tone}`} role="status">
          {msg.text}
        </p>
      )}
    </div>
  );
}

