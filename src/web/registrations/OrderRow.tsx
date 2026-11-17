import { useState, type ReactNode } from 'react';
import { licenseLabel } from '../../shared/eligibility';
import { formatCents } from '../../shared/format';
import { applyCorrection, CORRECTABLE_FIELDS, correctableValue, type CorrectableField, type RiderCorrection } from '../../shared/lookup';
import { refundableCents } from '../../shared/refunds';
import type { Category } from '../../shared/schema';
import { api, type OrderStatus, type OrderView } from '../api';
import { href } from '../App';
import { useSession } from '../auth';
import { formatDateTime, refundedCents } from '../format';
import { Field, Icon, ReasonForm } from '../ui';
import { RefundPanel } from './RefundPanel';

const STATUS_LABEL: Record<OrderStatus, string> = {
  held: 'Places held, unpaid',
  payment_failed: 'Payment declined',
  confirmed: 'Paid',
  expired: 'Hold expired',
  cancelled: 'Cancelled by rider',
  needs_attention: 'Needs attention',
};

const STATUS_TONE: Record<OrderStatus, string> = {
  held: 'needs_review',
  payment_failed: 'ineligible',
  confirmed: 'eligible',
  expired: 'muted',
  cancelled: 'muted',
  needs_attention: 'ineligible',
};

/**
 * One order in the registrations list. `canManage` (entries.manage) shows transfers, withdrawals,
 * license reviews, and corrections; `canRefund` (payments.refund) shows Refund. Others see the record only.
 */
export function OrderRow({ order, categories, canManage, canRefund, onChange }: { order: OrderView; categories: Category[]; canManage: boolean; canRefund: boolean; onChange: (o: OrderView) => void }) {
  // Display only: money returned or on its way back. Readiness and entry status do not change with a refund.
  const session = useSession();
  const refunded = refundedCents(order.totalCents, order.refunds);
  return (
    <li className="order">
      <div className="order__head">
        <p className="order__name">
          {order.rider.firstName} {order.rider.lastName}
          {order.rider.team && <span className="muted"> · {order.rider.team}</span>}
        </p>
        <span className={`status status--${STATUS_TONE[order.status]}`}>{STATUS_LABEL[order.status]}</span>
        {refunded > 0 && <span className="status status--muted">{refundableCents(order.totalCents, order.refunds) === 0 ? 'Refunded' : 'Partly refunded'}</span>}
        <span className="num order__total">{formatCents(order.totalCents)}</span>
      </div>
      {refunded > 0 && (
        <p className="muted small">
          Refunded <span className="num">{formatCents(refunded)}</span> · net paid <span className="num">{order.totalCents - refunded === 0 ? '$0' : formatCents(order.totalCents - refunded)}</span>
        </p>
      )}
      <p className="muted small">
        Racing age {order.rider.racingAge} · license {order.rider.licenseCategory ? licenseLabel(order.rider.licenseCategory) : 'not known'}
        {order.rider.guardian ? ` · guardian ${order.rider.guardian.name}` : ''} · waiver {order.waiver.version} signed by {order.waiver.signatureName} · emergency contact on file · order {order.orderNumber}
      </p>
      {order.checkInCode && (
        <p className="small order__checkin">
          Check-in code <code className="code">{order.checkInCode}</code> ·{' '}
          <a href={href({ page: 'order', orderId: order.id })}>Rider confirmation</a>
        </p>
      )}
      {(order.answers.length > 0 || order.addenda.length > 0) && (
        <ul className="small order__answers">
          {order.answers.map((a) => (
            <li key={`${a.categoryId}-${a.label}`}>
              {a.category}: {a.label}: <strong>{a.answer}</strong>
            </li>
          ))}
          {order.addenda.map((a) => (
            <li key={`add-${a.categoryId}`}>Accepted: {a.title}</li>
          ))}
        </ul>
      )}
      <RiderCorrections order={order} canManage={canManage} onChange={onChange} />
      {order.status === 'needs_attention' && (
        <p className="note note--error">Payment arrived but no place was confirmed (the hold had ended and a place filled, the rider had cancelled, or the amount did not match). Refund the rider or offer another race.</p>
      )}
      {(order.status === 'confirmed' || order.status === 'needs_attention') && <RefundPanel key={`${session.email?.toLowerCase()}:${order.id}`} order={order} canRefund={canRefund} onChange={onChange} />}
      <ul className="order__entries">
        {order.entries.map((e) => (
          <EntryLine key={e.id} entry={e} confirmed={order.status === 'confirmed'} canManage={canManage} onChange={onChange}>
            {canManage && order.status === 'confirmed' && e.status === 'confirmed' && (
              <EntryChange entry={e} categories={categories} taken={order.entries.filter((x) => x.status === 'confirmed').map((x) => x.categoryId)} onChange={onChange} />
            )}
          </EntryLine>
        ))}
      </ul>
      <ul className="order__entries">
        {order.entries.flatMap((e) => e.changes.map((c, i) => <ChangeLine key={`${e.id}-${i}`} change={c} />))}
      </ul>
    </li>
  );
}

function EntryLine({ entry, confirmed, canManage, onChange, children }: { entry: OrderView['entries'][number]; confirmed: boolean; canManage: boolean; onChange: (o: OrderView) => void; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="order__entry">
      <span className="order__entry-name">
        <code className="code">{entry.code}</code> {entry.categoryName}
      </span>
      {entry.status === 'withdrawn' ? (
        <span className="muted small">Withdrawn</span>
      ) : confirmed ? (
        entry.licenseReviewed ? (
          <span className="readiness__item readiness__item--done">
            <Icon name="check" size={14} /> License reviewed: {entry.licenseReviewNote}
          </span>
        ) : open ? (
          <ReasonForm
            variant="inline"
            label={`Review the license for ${entry.categoryName}`}
            reasonLabel={`How was the license for ${entry.categoryName} checked?`}
            placeholder="How you checked it, for example: license card seen"
            submitLabel="Mark reviewed"
            missing={'Write how you checked the license, for example "license card seen".'}
            onSubmit={async (note) => {
              onChange(await api.reviewLicense(entry.id, note));
              setOpen(false);
            }}
            onCancel={() => setOpen(false)}
          />
        ) : (
          <span className="order__entry-actions">
            <span className="readiness__item readiness__item--needs_review">
              <Icon name="warn" size={14} /> License not verified
            </span>
            {canManage && (
              <button className="btn btn--secondary btn--small" onClick={() => setOpen(true)}>
                Review license
              </button>
            )}
          </span>
        )
      ) : (
        <span className="muted small">{entry.status === 'held' ? 'Place held' : 'Place released'}</span>
      )}
      {children}
    </li>
  );
}

type EntryView = OrderView['entries'][number];

const FIELDS = Object.keys(CORRECTABLE_FIELDS) as CorrectableField[];

/**
 * Correct a rider's contact and identity details with a reason. Prices, entries, eligibility
 * answers, and the waiver signature are not editable here. Every correction is listed below the form.
 */
function RiderCorrections({ order, canManage, onChange }: { order: OrderView; canManage: boolean; onChange: (o: OrderView) => void }) {
  const initial = () => Object.fromEntries(FIELDS.map((f) => [f, correctableValue(order.rider, f)])) as Record<CorrectableField, string>;
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(initial);
  const name = `${order.rider.firstName} ${order.rider.lastName}`;
  const patch = () => {
    const p: RiderCorrection = {};
    for (const f of FIELDS) if (values[f].trim() !== correctableValue(order.rider, f)) p[f] = values[f].trim();
    return p;
  };
  return (
    <>
      {open ? (
        <ReasonForm
          variant="block"
          label={`Correct details for ${name}`}
          intro="Contact and identity details only. Racing age, license category, and race choices decide eligibility, so change those with a transfer or a new registration. The waiver signature and the price paid are never changed."
          reasonLabel="Reason for the correction (required)"
          hint="For example: rider emailed to fix a misspelled name."
          submitLabel="Save correction"
          busyLabel="Saving…"
          missing="Write why the details are being corrected."
          validate={() => (applyCorrection(order.rider, patch()).changes.length === 0 ? 'Nothing changed. Edit a field before saving.' : null)}
          onSubmit={async (reason) => {
            onChange(await api.correctRider(order.id, patch(), reason));
            setOpen(false);
          }}
          onCancel={() => setOpen(false)}
        >
          <div className="form-row">
            {FIELDS.map((f) => (
              <Field key={f} label={CORRECTABLE_FIELDS[f]}>
                {(id) => <input id={id} className="input" autoComplete="off" value={values[f]} onChange={(e) => setValues((v) => ({ ...v, [f]: e.target.value }))} />}
              </Field>
            ))}
          </div>
        </ReasonForm>
      ) : (
        canManage && (
          <p className="row-actions">
            <button
              className="btn btn--ghost btn--small"
              aria-label={`Correct details for ${name}`}
              onClick={() => {
                setValues(initial());
                setOpen(true);
              }}
            >
              Correct details
            </button>
          </p>
        )
      )}
      {order.corrections.length > 0 && (
        <ul className="order__entries" aria-label={`Corrections to ${name}`}>
          {order.corrections.map((c, i) => (
            <li key={i} className="order__entry order__change">
              <span className="small">
                <strong>Details corrected</strong> · {formatDateTime(c.at)}{c.by && ` · by ${c.by}`} · Reason: {c.reason}
                <br />
                {c.changes.map((x) => `${x.label}: “${x.before || 'blank'}” to “${x.after || 'blank'}”`).join('; ')}.
                {c.licenseReviewsCleared > 0 && ' The license number changed, so the earlier license review was cleared and the license needs review again.'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** One logged transfer or withdrawal, with the money difference stated plainly. Neither one moves money by itself. */
function ChangeLine({ change: c }: { change: EntryView['changes'][number] }) {
  const money =
    c.kind === 'withdraw'
      ? `Paid ${formatCents(c.amountPaidCents)} for this entry. A withdrawal does not refund by itself: use Refund on this order to return money.`
      : c.differenceCents === null || c.differenceCents === 0
        ? `Paid ${formatCents(c.amountPaidCents)}; the new category costs the same. Nothing to settle.`
        : c.differenceCents > 0
          ? `Paid ${formatCents(c.amountPaidCents)}; the new category costs ${formatCents(c.newPriceCents ?? 0)}. The rider owes ${formatCents(c.differenceCents)}. A transfer does not collect it: collect the difference from the rider directly. The price paid was not changed.`
          : `Paid ${formatCents(c.amountPaidCents)}; the new category costs ${formatCents(c.newPriceCents ?? 0)}. A refund of ${formatCents(-c.differenceCents)} is due. A transfer does not refund by itself: use Refund on this order to return it.`;
  return (
    <li className="order__entry order__change">
      <span className="small">
        <strong>{c.kind === 'withdraw' ? `Withdrawn from ${c.fromCategoryName}` : `Transferred from ${c.fromCategoryName} to ${c.toCategoryName}`}</strong> · {formatDateTime(c.at)} · Reason: {c.reason}
        <br />
        {money}
      </span>
    </li>
  );
}

/** Transfer or withdraw a paid entry. The server rechecks eligibility, capacity, the waitlist, and conflicts. */
function EntryChange({ entry, categories, taken, onChange }: { entry: EntryView; categories: Category[]; taken: string[]; onChange: (o: OrderView) => void }) {
  const [mode, setMode] = useState<'none' | 'transfer' | 'withdraw'>('none');
  const [target, setTarget] = useState('');
  const options = categories.filter((c) => c.status === 'active' && !taken.includes(c.id));
  const close = () => {
    setMode('none');
    setTarget('');
  };
  if (mode === 'none') {
    return (
      <span className="order__entry-actions">
        <button className="btn btn--secondary btn--small" aria-label={`Transfer ${entry.code} ${entry.categoryName}`} onClick={() => setMode('transfer')}>
          Transfer
        </button>
        <button className="btn btn--ghost btn--small" aria-label={`Withdraw ${entry.code} ${entry.categoryName}`} onClick={() => setMode('withdraw')}>
          Withdraw
        </button>
      </span>
    );
  }
  const transfer = mode === 'transfer';
  return (
    <ReasonForm
      variant="inline"
      label={transfer ? `Transfer ${entry.categoryName}` : `Withdraw ${entry.categoryName}`}
      reasonLabel={transfer ? 'Reason for the transfer' : 'Reason for the withdrawal'}
      placeholder={transfer ? 'Reason, for example: upgraded to Cat 3' : 'Reason, for example: injured, asked to withdraw'}
      submitLabel={transfer ? 'Transfer entry' : 'Withdraw entry'}
      missing={transfer ? 'Write why the entry is moving.' : 'Write why the entry is withdrawn.'}
      validate={() => (transfer && !target ? 'Choose the category to move to.' : null)}
      onSubmit={async (reason) => {
        onChange(transfer ? await api.transferEntry(entry.id, target, reason) : await api.withdrawEntry(entry.id, reason));
        close();
      }}
      onCancel={close}
    >
      {transfer && (
        <select className="input" aria-label={`Move ${entry.categoryName} to`} value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="">Move to…</option>
          {options.map((c) => (
            <option key={c.id} value={c.id}>
              {c.timingCode} {c.name}
            </option>
          ))}
        </select>
      )}
    </ReasonForm>
  );
}
