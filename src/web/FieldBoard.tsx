import { useState } from 'react';
import { distinctRiders, entryCountsByCategory, poolCategoryIds, startGroupCategoryIds, usageForLimit, type LimitUsage } from '../shared/capacity';
import { newId } from '../shared/factory';
import { formatTime, sortCategories } from '../shared/format';
import type { CapacityPool, Category, EventConfig, StartGroup, CapacityEntry } from '../shared/schema';
import type { Draft } from './Builder';
import { dayHue, Field, Icon, IntInput } from './ui';

/**
 * The field board: each start group is a clip holding the category tags that
 * start together, with one tally for the shared field. A rider counts once.
 */
export function FieldBoard({ draft, raceId, onSelect, selectedId }: { draft: Draft; raceId: string; onSelect: (id: string) => void; selectedId: string | null }) {
  const { config, update, readOnly } = draft;
  const race = config.races.find((r) => r.id === raceId)!;
  const dayIndex = config.days.findIndex((d) => d.id === race.dayId);
  const groups = [...config.startGroups.filter((g) => g.raceId === raceId)].sort((a, b) => (a.startTime ?? '99').localeCompare(b.startTime ?? '99'));
  const cats = sortCategories(config.categories.filter((c) => c.raceId === raceId && c.status !== 'archived'));
  const unassigned = cats.filter((c) => !c.startGroupId || !groups.some((g) => g.id === c.startGroupId));
  const [editing, setEditing] = useState<string | null>(null);
  // Editors read race problems in the publishing checks, which view-only roles do not have.
  const raceIssues = readOnly ? draft.issues.filter((i) => i.target.kind === 'race' && i.target.id === raceId) : [];

  const addGroup = () => {
    const g: StartGroup = { id: newId('sg'), raceId, name: `Start group ${groups.length + 1}`, startTime: null, stagingTime: null, fieldLimit: null };
    update((c) => ({ ...c, startGroups: [...c.startGroups, g] }));
    setEditing(g.id);
  };

  return (
    <section className="board" aria-labelledby="board-title" style={{ ['--day' as string]: dayHue(dayIndex) }}>
      <div className="section-head">
        <h3 id="board-title">Start groups and shared field limits</h3>
        <p className="section-head__note">
          Categories in one start group start together. Each keeps its own classification and cap, and a rider counts once toward the shared limit.
        </p>
        {!readOnly && (
          <button className="btn btn--secondary btn--small" onClick={addGroup}>
            <Icon name="plus" /> Add start group
          </button>
        )}
      </div>

      {raceIssues.length > 0 && (
        <ul className="editor__issues" role="list" aria-label="Problems in this race">
          {raceIssues.map((i) => (
            <li key={i.key} className={`issue issue--${i.level}`}>
              <Icon name={i.level === 'error' ? 'error' : 'warn'} size={14} />
              {i.message}
            </li>
          ))}
        </ul>
      )}
      <div className="board__grid">
        {groups.map((g) => (
          <Clip key={g.id} group={g} draft={draft} cats={cats.filter((c) => c.startGroupId === g.id)} groups={groups} editing={editing === g.id} setEditing={setEditing} onSelect={onSelect} selectedId={selectedId} />
        ))}
        {unassigned.length > 0 && (
          <article className="clip clip--loose" aria-label="Categories not in a start group">
            <header className="clip__head">
              <span className="clip__time num">--:--</span>
              <h4 className="clip__name">Not in a start group</h4>
            </header>
            <p className="clip__hint">These categories have no start time yet.{!readOnly && ' Add each one to a start group.'}</p>
            <TagList cats={unassigned} groups={groups} draft={draft} onSelect={onSelect} selectedId={selectedId} />
          </article>
        )}
        {groups.length === 0 && unassigned.length === 0 && (
          <div className="empty">
            <p>{readOnly ? 'No start groups yet.' : 'Add a start group, give it a start time, then add categories to it.'}</p>
          </div>
        )}
      </div>
    </section>
  );
}

function Clip({ group, draft, cats, groups, editing, setEditing, onSelect, selectedId }: { group: StartGroup; draft: Draft; cats: Category[]; groups: StartGroup[]; editing: boolean; setEditing: (id: string | null) => void; onSelect: (id: string) => void; selectedId: string | null }) {
  const { config, update } = draft;
  const patch = (p: Partial<StartGroup>) => update((c) => ({ ...c, startGroups: c.startGroups.map((g) => (g.id === group.id ? { ...g, ...p } : g)) }));
  const remove = () =>
    update((c) => ({
      ...c,
      startGroups: c.startGroups.filter((g) => g.id !== group.id),
      capacityPools: c.capacityPools.map((p) => ({ ...p, memberStartGroupIds: p.memberStartGroupIds.filter((id) => id !== group.id) })),
    }));
  const errors = draft.issues.filter((i) => i.target.kind === 'startGroup' && i.target.id === group.id && i.level === 'error');

  return (
    <article className={`clip ${errors.length ? 'clip--error' : ''}`} aria-labelledby={`clip-${group.id}`}>
      <header className="clip__head">
        <span className="clip__time num">{group.startTime ? formatTime(group.startTime).replace(' ', ' ') : '--:--'}</span>
        <h4 className="clip__name" id={`clip-${group.id}`}>
          {group.name || 'Unnamed start group'}
        </h4>
        {!draft.readOnly && (
          <button className="btn btn--ghost btn--small" aria-expanded={editing} onClick={() => setEditing(editing ? null : group.id)}>
            {editing ? 'Done' : 'Edit'}
          </button>
        )}
      </header>
      {editing && !draft.readOnly && (
        <div className="clip__form">
          <Field label="Name">{(id) => <input id={id} className="input" value={group.name} onChange={(e) => patch({ name: e.target.value })} maxLength={80} />}</Field>
          <div className="form-row form-row--3">
            <Field label="Start time">{(id) => <input id={id} type="time" className="input" value={group.startTime ?? ''} onChange={(e) => patch({ startTime: e.target.value || null })} />}</Field>
            <Field label="Staging">{(id) => <input id={id} type="time" className="input" value={group.stagingTime ?? ''} onChange={(e) => patch({ stagingTime: e.target.value || null })} />}</Field>
            <Field label="Field limit" hint="Blank: no shared limit">
              {(id, d) => <IntInput id={id} describedBy={d} value={group.fieldLimit} min={1} onCommit={(v) => patch({ fieldLimit: v })} />}
            </Field>
          </div>
          <button className="btn btn--ghost btn--small btn--danger" disabled={cats.length > 0} onClick={remove} title={cats.length ? 'Move its categories out first' : undefined}>
            <Icon name="trash" /> Remove start group
          </button>
        </div>
      )}
      {errors.map((e) => (
        <p key={e.key} className="clip__error">
          <Icon name="error" size={14} /> {e.message}
        </p>
      ))}
      {cats.length > 0 ? <TagList cats={cats} groups={groups} draft={draft} onSelect={onSelect} selectedId={selectedId} /> : <p className="clip__hint">{draft.readOnly ? 'Empty.' : "Empty. Choose this start group in a category tag's start group menu to add it here."}</p>}
      <Tally config={config} entries={draft.data.entries} group={group} cats={cats} />
    </article>
  );
}

function TagList({ cats, groups, draft, onSelect, selectedId }: { cats: Category[]; groups: StartGroup[]; draft: Draft; onSelect: (id: string) => void; selectedId: string | null }) {
  const counts = entryCountsByCategory(draft.data.entries);
  const move = (catId: string, sgId: string) =>
    draft.update((c) => ({ ...c, categories: c.categories.map((x) => (x.id === catId ? { ...x, startGroupId: sgId || null } : x)) }));
  return (
    <ul className="tags">
      {cats.map((cat) => (
        <li key={cat.id} className={`tagchip ${selectedId === cat.id ? 'is-selected' : ''}`}>
          <button className="tagchip__main" onClick={() => onSelect(cat.id)}>
            <code className="code">{cat.classifications[0]?.code || cat.timingCode || '?'}</code>
            <span className="tagchip__name">{cat.name || 'Unnamed'}</span>
            <span className="tagchip__count num" aria-label={`${counts[cat.id] ?? 0} places taken${cat.cap ? ` of ${cat.cap}` : ''}`}>
              {counts[cat.id] ?? 0}
              {cat.cap ? <span className="tagchip__cap">/{cat.cap}</span> : null}
            </span>
          </button>
          {!draft.readOnly && (
            <select className="tagchip__move" aria-label={`Start group for ${cat.name || 'category'}`} value={cat.startGroupId ?? ''} onChange={(e) => move(cat.id, e.target.value)}>
              <option value="">Start group: none</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  Start group: {g.startTime ? `${formatTime(g.startTime)} · ` : ''}
                  {g.name || 'Unnamed'}
                </option>
              ))}
            </select>
          )}
        </li>
      ))}
    </ul>
  );
}

/** A pool's shared limit with how many distinct riders use it, counted by the shared capacity rule. */
export function poolUsage(config: EventConfig, pool: CapacityPool, entries: readonly CapacityEntry[]): LimitUsage {
  return usageForLimit({ kind: 'pool', id: pool.id, name: pool.name, limit: pool.limit, categoryIds: poolCategoryIds(config, pool.id) }, entries);
}

/** The shared tally: one bar per start group, segmented by category, scaled to the binding limit. */
export function Tally({ config, entries, group, cats }: { config: EventConfig; entries: CapacityEntry[]; group: StartGroup; cats: Category[] }) {
  const memberIds = startGroupCategoryIds(config, group.id);
  const used = distinctRiders(entries, memberIds).size;
  const pools = config.capacityPools.filter((p) => poolCategoryIds(config, p.id).some((id) => memberIds.includes(id)));
  const coveringPool = pools.find((p) => {
    const ids = poolCategoryIds(config, p.id);
    return memberIds.length > 0 && memberIds.every((id) => ids.includes(id));
  });
  const caps = cats.map((c) => c.cap);
  let limit: number | null = null;
  let remaining: number | null = null;
  let basis = '';
  if (group.fieldLimit !== null) {
    const u = usageForLimit({ kind: 'start_group', id: group.id, name: group.name, limit: group.fieldLimit, categoryIds: memberIds }, entries);
    limit = u.limit;
    remaining = u.remaining;
    basis = 'shared field limit';
  } else if (coveringPool) {
    // The pool can reach beyond this start group, so the places left come from everyone counted in the pool.
    const u = poolUsage(config, coveringPool, entries);
    limit = u.limit;
    remaining = u.remaining;
    basis = `shared pool: ${coveringPool.name}`;
  } else if (cats.length > 0 && caps.every((c) => c !== null)) {
    limit = (caps as number[]).reduce((a, b) => a + b, 0);
    remaining = Math.max(0, limit - used);
    basis = cats.length > 1 ? 'category caps added up; no shared limit' : 'category cap';
  }
  const scale = limit ?? Math.max(used, 1);
  let left = 0;
  const segments = cats.map((c, i) => {
    const n = distinctRiders(entries, [c.id]).size;
    const seg = { id: c.id, code: c.classifications[0]?.code || c.timingCode || '?', n, left: (left / scale) * 100, width: (n / scale) * 100, shade: i % 4 };
    left += n;
    return seg;
  });
  const summary =
    limit === null ? `${used} riders entered. No field limit applies.` : `${used} of ${limit} places taken, ${remaining} left (${basis}).`;

  return (
    <div className="tally">
      <div className="tally__track" role="img" aria-label={summary}>
        {segments.map((s) => (
          <span key={s.id} className={`tally__seg tally__seg--${s.shade}`} style={{ ['--l' as string]: s.left, ['--w' as string]: Math.min(1, s.width / 100) }} />
        ))}
      </div>
      <p className="tally__text">
        <span className="num tally__used">{used}</span>
        {limit !== null && (
          <>
            {' '}
            of <span className="num">{limit}</span> · <span className="num">{remaining}</span> left
          </>
        )}
        <span className="tally__basis">{limit === null ? 'No field limit' : basis}</span>
      </p>
      {cats.length > 1 && (
        <ul className="tally__legend">
          {segments.map((s) => (
            <li key={s.id}>
              <span className={`tally__key tally__seg--${s.shade}`} aria-hidden="true" />
              {s.code} <span className="num">{s.n}</span>
            </li>
          ))}
        </ul>
      )}
      {pools
        .filter((p) => p !== coveringPool || group.fieldLimit !== null)
        .map((p) => {
          const pu = poolUsage(config, p, entries).used;
          return (
            <p key={p.id} className="tally__pool">
              <Icon name="users" size={14} /> Also limited by pool <strong>{p.name}</strong>: <span className="num">{pu}</span> of <span className="num">{p.limit}</span>
            </p>
          );
        })}
    </div>
  );
}
