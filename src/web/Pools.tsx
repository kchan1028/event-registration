import { distinctRiders, poolCategoryIds } from '../shared/capacity';
import { newId } from '../shared/factory';
import { sortCategories } from '../shared/format';
import type { CapacityPool } from '../shared/schema';
import type { Draft } from './Builder';
import { Field, Icon, IntInput } from './ui';

export function Pools({ draft }: { draft: Draft }) {
  const { config, update } = draft;
  const patch = (id: string, p: Partial<CapacityPool>) => update((c) => ({ ...c, capacityPools: c.capacityPools.map((x) => (x.id === id ? { ...x, ...p } : x)) }));

  return (
    <div className="settings">
      <h2 className="page-title">Shared capacity pools</h2>
      <p className="lede">
        A pool is an explicit limit shared by the categories or start groups you choose. Use it for an approved combined cap, such as two masters age groups with 40 places each but
        60 in total. A rider counts once in a pool, and every other cap still applies.
      </p>

      {config.capacityPools.length === 0 && (
        <div className="empty">
          <p>No pools yet. Start group field limits already cover riders who start together; add a pool when a limit spans categories that a start group does not.</p>
        </div>
      )}

      {config.capacityPools.map((pool) => {
        const members = poolCategoryIds(config, pool.id);
        const used = distinctRiders(draft.data.entries, members).size;
        const issues = draft.issues.filter((i) => i.target.kind === 'pool' && i.target.id === pool.id);
        return (
          <section className="pool" key={pool.id} aria-label={pool.name || 'Capacity pool'}>
            <div className="form-row">
              <Field label="Pool name">{(id) => <input id={id} className="input" value={pool.name} onChange={(e) => patch(pool.id, { name: e.target.value })} maxLength={80} />}</Field>
              <Field label="Shared limit">{(id) => <IntInput id={id} value={pool.limit} min={Math.max(1, used)} allowEmpty={false} onCommit={(v) => v && patch(pool.id, { limit: v })} />}</Field>
            </div>
            <p className="pool__usage">
              <span className="num">{used}</span> of <span className="num">{pool.limit}</span> places taken · <span className="num">{Math.max(0, pool.limit - used)}</span> left
            </p>
            {issues.map((i) => (
              <p key={i.key} className={`issue issue--${i.level}`}>
                <Icon name={i.level === 'error' ? 'error' : 'warn'} size={14} /> {i.message}
              </p>
            ))}
            {config.races.map((race) => {
              const cats = sortCategories(config.categories.filter((c) => c.raceId === race.id && c.status !== 'archived'));
              const groups = config.startGroups.filter((g) => g.raceId === race.id);
              if (cats.length === 0) return null;
              return (
                <fieldset className="pool__race" key={race.id}>
                  <legend>{race.name}</legend>
                  <div className="pool__cols">
                    <div>
                      <p className="path__label">Categories</p>
                      {cats.map((c) => (
                        <label className="check" key={c.id}>
                          <input
                            type="checkbox"
                            checked={pool.memberCategoryIds.includes(c.id)}
                            onChange={(e) =>
                              patch(pool.id, { memberCategoryIds: e.target.checked ? [...pool.memberCategoryIds, c.id] : pool.memberCategoryIds.filter((x) => x !== c.id) })
                            }
                          />
                          {c.name} {c.cap !== null && <span className="muted small">(cap {c.cap})</span>}
                        </label>
                      ))}
                    </div>
                    {groups.length > 0 && (
                      <div>
                        <p className="path__label">Whole start groups</p>
                        {groups.map((g) => (
                          <label className="check" key={g.id}>
                            <input
                              type="checkbox"
                              checked={pool.memberStartGroupIds.includes(g.id)}
                              onChange={(e) =>
                                patch(pool.id, { memberStartGroupIds: e.target.checked ? [...pool.memberStartGroupIds, g.id] : pool.memberStartGroupIds.filter((x) => x !== g.id) })
                              }
                            />
                            {g.name}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                </fieldset>
              );
            })}
            <button className="btn btn--ghost btn--small btn--danger" onClick={() => update((c) => ({ ...c, capacityPools: c.capacityPools.filter((x) => x.id !== pool.id) }))}>
              <Icon name="trash" /> Remove pool
            </button>
          </section>
        );
      })}

      <button
        className="btn btn--primary btn--small"
        onClick={() => update((c) => ({ ...c, capacityPools: [...c.capacityPools, { id: newId('pool'), name: 'New shared limit', limit: 60, memberCategoryIds: [], memberStartGroupIds: [] }] }))}
      >
        <Icon name="plus" /> Add capacity pool
      </button>
    </div>
  );
}
