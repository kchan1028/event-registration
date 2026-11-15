import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { formatLocalDateTime } from '../shared/checkout';
import { formatCents, sortCategories } from '../shared/format';
import type { Category } from '../shared/schema';
import { api, ApiError, type CouponView } from './api';
import { Field, IntInput, MoneyInput } from './ui';

/**
 * Organizer coupon codes for one event (product.md: Promotions). A code works only inside its
 * window, on its eligible categories, and up to its redemption cap. Orders keep the discount
 * they accepted, so turning a code off never reprices them.
 */

interface Form {
  code: string;
  kind: 'fixed' | 'percent';
  amountCents: number;
  percent: number | null;
  validFrom: string;
  validUntil: string;
  maxRedemptions: number | null;
  categoryIds: string[];
}

const EMPTY: Form = { code: '', kind: 'percent', amountCents: 1000, percent: 10, validFrom: '', validUntil: '', maxRedemptions: null, categoryIds: [] };

function windowText(c: CouponView): string {
  if (c.validFrom && c.validUntil) return `${formatLocalDateTime(c.validFrom)} to ${formatLocalDateTime(c.validUntil)}`;
  if (c.validFrom) return `From ${formatLocalDateTime(c.validFrom)}`;
  if (c.validUntil) return `Until ${formatLocalDateTime(c.validUntil)}`;
  return 'Any time';
}

export function Coupons({ eventId, categories, races }: { eventId: string; categories: Category[]; races: { id: string; name: string }[] }) {
  const [list, setList] = useState<CouponView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => {
    api
      .coupons(eventId)
      .then(setList)
      .catch((e: ApiError) => setError(e.message));
  }, [eventId]);
  useEffect(load, [load]);

  const name = (id: string) => {
    const c = categories.find((x) => x.id === id);
    return c ? `${c.name} (${races.find((r) => r.id === c.raceId)?.name ?? ''})` : 'Removed category';
  };
  const set = (p: Partial<Form>) => setForm((f) => ({ ...f, ...p }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (form.kind === 'percent' && form.percent === null) return setFormError('Enter a percentage from 1 to 100.');
    setBusy(true);
    setFormError(null);
    try {
      await api.createCoupon(eventId, {
        code: form.code,
        kind: form.kind,
        ...(form.kind === 'fixed' ? { amountCents: form.amountCents } : { percent: form.percent }),
        validFrom: form.validFrom || null,
        validUntil: form.validUntil || null,
        maxRedemptions: form.maxRedemptions,
        categoryIds: form.categoryIds,
      });
      setForm(EMPTY);
      setAdding(false);
      load();
    } catch (err) {
      const ae = err as ApiError;
      const details = (ae.details as { message: string }[] | undefined)?.map((d) => d.message).join(' ');
      setFormError(details ? `${ae.message} ${details}` : ae.message);
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (c: CouponView) => {
    setError(null);
    try {
      const next = await api.setCouponActive(eventId, c.id, !c.active);
      setList((l) => (l ?? []).map((x) => (x.id === next.id ? next : x)));
    } catch (err) {
      setError((err as ApiError).message);
    }
  };

  return (
    <section className="settings__section" aria-labelledby="coupons-title">
      <h3 id="coupons-title">Coupon codes</h3>
      <p className="muted small">
        A rider enters one code per order. It applies only to eligible entries with no bundle or additional-race discount, and never below zero. A place held with a code counts toward the cap until the hold ends; paid orders keep the discount they accepted.
      </p>
      {error && (
        <p className="alert alert--error" role="alert">
          {error}
        </p>
      )}
      {list && list.length > 0 && (
        <div className="table-wrap coupon-table" tabIndex={0} role="region" aria-label="Coupon codes">
          <table className="mini-table">
            <thead>
              <tr>
                <th scope="col">Code</th>
                <th scope="col">Discount</th>
                <th scope="col">Eligible</th>
                <th scope="col">Valid</th>
                <th scope="col">Used</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id}>
                  <td>
                    <code className="code">{c.code}</code>
                    {!c.active && <span className="status status--muted coupon-table__off">Off</span>}
                  </td>
                  <td className="num">{c.kind === 'percent' ? `${c.percent}%` : formatCents(c.amountCents)}</td>
                  <td>{c.categoryIds.length === 0 ? 'All categories' : c.categoryIds.map(name).join(', ')}</td>
                  <td>{windowText(c)}</td>
                  <td>
                    <span className="num">{c.redemptions.confirmed}</span> paid
                    {c.redemptions.reserved > 0 && (
                      <>
                        , <span className="num">{c.redemptions.reserved}</span> held
                      </>
                    )}
                    {c.maxRedemptions !== null && (
                      <span className="muted">
                        {' '}
                        of <span className="num">{c.maxRedemptions}</span>
                      </span>
                    )}
                  </td>
                  <td>
                    <button className="btn btn--ghost btn--small" onClick={() => toggle(c)} aria-label={`${c.active ? 'Turn off' : 'Turn on'} ${c.code}`}>
                      {c.active ? 'Turn off' : 'Turn on'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {list && list.length === 0 && !adding && <p className="small">No coupon codes yet.</p>}
      {!adding ? (
        <button className="btn btn--secondary btn--small" onClick={() => setAdding(true)}>
          Add a coupon code
        </button>
      ) : (
        <form className="coupon-form" onSubmit={submit} noValidate aria-labelledby="coupon-form-title">
          <h4 id="coupon-form-title">New coupon code</h4>
          {formError && (
            <p className="alert alert--error" role="alert">
              {formError}
            </p>
          )}
          <div className="form-row">
            <Field label="Code" hint="Letters, numbers, hyphens. Riders can type it in any case.">
              {(id, d) => <input id={id} className="input coupon-form__code" autoComplete="off" spellCheck={false} aria-describedby={d} value={form.code} onChange={(e) => set({ code: e.target.value })} />}
            </Field>
            <fieldset className="coupon-form__kind">
              <legend>Discount type</legend>
              <div className="segmented" role="radiogroup" aria-label="Discount type">
                {(
                  [
                    ['percent', 'Percentage'],
                    ['fixed', 'Fixed amount'],
                  ] as const
                ).map(([k, label]) => (
                  <label key={k} className={`segmented__opt ${form.kind === k ? 'is-on' : ''}`}>
                    <input type="radio" name="coupon-kind" checked={form.kind === k} onChange={() => set({ kind: k })} />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
            {form.kind === 'percent' ? (
              <Field label="Percent off each eligible entry">
                {(id, d) => <IntInput id={id} describedBy={d} value={form.percent} min={1} max={100} onCommit={(v) => set({ percent: v })} />}
              </Field>
            ) : (
              <Field label="Amount off the order" hint="Split across eligible entries, never more than their price.">
                {(id, d) => <MoneyInput id={id} describedBy={d} cents={form.amountCents} onCommit={(v) => set({ amountCents: v })} />}
              </Field>
            )}
          </div>
          <div className="form-row">
            <Field label="Starts (optional)" hint="Event local time.">
              {(id, d) => <input id={id} aria-describedby={d} type="datetime-local" className="input" value={form.validFrom} onChange={(e) => set({ validFrom: e.target.value })} />}
            </Field>
            <Field label="Ends (optional)" hint="Stops working at this time.">
              {(id, d) => <input id={id} aria-describedby={d} type="datetime-local" className="input" value={form.validUntil} onChange={(e) => set({ validUntil: e.target.value })} />}
            </Field>
            <Field label="Total uses (optional)" hint="Blank means no cap.">
              {(id, d) => <IntInput id={id} describedBy={d} value={form.maxRedemptions} min={1} max={100000} onCommit={(v) => set({ maxRedemptions: v })} />}
            </Field>
          </div>
          <fieldset className="subfields">
            <legend>Eligible categories</legend>
            <p className="muted small">Leave all unticked to allow every category.</p>
            <div className="coupon-form__cats">
              {sortCategories(categories.filter((c) => c.status === 'active')).map((c) => (
                <label key={c.id} className="check">
                  <input
                    type="checkbox"
                    checked={form.categoryIds.includes(c.id)}
                    onChange={(e) => set({ categoryIds: e.target.checked ? [...form.categoryIds, c.id] : form.categoryIds.filter((x) => x !== c.id) })}
                  />
                  <span>
                    {c.name} <span className="muted">· {races.find((r) => r.id === c.raceId)?.name ?? ''}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="form-actions">
            <button className="btn btn--primary btn--small" type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Save coupon code'}
            </button>
            <button
              className="btn btn--ghost btn--small"
              type="button"
              onClick={() => {
                setAdding(false);
                setForm(EMPTY);
                setFormError(null);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
