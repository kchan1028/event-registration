import { addDays } from './factory';
import { formatDate } from './format';
import type { RefundRules } from './schema';

/**
 * Refund and credit policy (product.md "Event and race cancellation"; owner decision,
 * November 15, 2026): each organizer sets the policy for their event, starting from a template.
 * The rules are part of the event configuration, so publishing versions them and every order
 * keeps the rules of the version it was sold under.
 *
 * A step returns `percent` of the entry amount paid when a rider withdraws on or before
 * `daysBefore` days ahead of the first race day. After the last step nothing is returned.
 * Fees are never returned.
 */

export type RefundTemplate = 'full_until_deadline' | 'tiered' | 'credit_only';

/** Nominal whole-order entitlement, before payment/refund reconciliation. Fees are excluded by the caller. */
export function refundPolicyEntitlement(rules: RefundRules | null, firstDay: string, onDate: string, entryCents: number, reason: 'withdrawal' | 'organizer_cancellation') {
  if (!rules) return null;
  if (reason === 'organizer_cancellation') return {
    returnAs: rules.organizerCancellation === 'full_refund' ? 'cash' as const : rules.organizerCancellation === 'credit' ? 'credit' as const : 'rider_choice' as const,
    percent: 100,
    amountCents: entryCents,
  };
  const tier = [...rules.tiers].sort((a, b) => b.daysBefore - a.daysBefore).find((t) => onDate <= addDays(firstDay, -t.daysBefore));
  const percent = tier?.percent ?? 0;
  return { returnAs: rules.returnAs, percent, amountCents: Math.round(entryCents * percent / 100) };
}

export interface RefundPolicyPreview {
  orderId: string;
  publishedVersion: number;
  reason: 'withdrawal' | 'organizer_cancellation';
  onDate: string;
  timeZone: string;
  entryCents: number;
  excludedFeesCents: number;
  entitlement: ReturnType<typeof refundPolicyEntitlement>;
  reviewReasons: string[];
  suggestedCashCents: number | null;
  scope: 'whole_order';
}

/** Starting points; the organizer edits every number after picking one. */
export const REFUND_TEMPLATES: Record<RefundTemplate, { label: string; rules: RefundRules }> = {
  full_until_deadline: {
    label: 'Full refund until a deadline',
    rules: { tiers: [{ daysBefore: 14, percent: 100 }], returnAs: 'cash', organizerCancellation: 'full_refund' },
  },
  tiered: {
    label: 'Tiered refund',
    rules: {
      tiers: [
        { daysBefore: 30, percent: 100 },
        { daysBefore: 7, percent: 50 },
      ],
      returnAs: 'cash',
      organizerCancellation: 'full_refund',
    },
  },
  credit_only: {
    label: 'Credit only',
    rules: { tiers: [{ daysBefore: 0, percent: 100 }], returnAs: 'credit', organizerCancellation: 'credit' },
  },
};

const RETURN_TEXT: Record<RefundRules['returnAs'], string> = {
  cash: 'back as a refund',
  credit: 'as credit toward a later event by the same organizer',
};

const CANCELLATION_TEXT: Record<RefundRules['organizerCancellation'], string> = {
  full_refund: 'a full refund of the entry amount',
  credit: 'credit for the full entry amount toward a later event by the same organizer',
  rider_choice: 'your choice of a full refund or credit for the full entry amount',
};

/** The rules in plain sentences for riders, dated from the first race day (YYYY-MM-DD). */
export function describeRefundRules(rules: RefundRules, firstDay: string): string[] {
  const tiers = [...rules.tiers].sort((a, b) => b.daysBefore - a.daysBefore);
  const when = (days: number) => (days === 0 ? `the first race day (${formatDate(firstDay)})` : `${formatDate(addDays(firstDay, -days))} (${days === 1 ? '1 day' : `${days} days`} before the first race day)`);
  // Each step starts the day after the previous deadline, so a withdrawal date matches exactly one sentence.
  const lines = tiers.map((t, i) => {
    const span = i === 0 ? `Withdraw on or before ${when(t.daysBefore)}` : `Withdraw after ${when(tiers[i - 1].daysBefore)} and on or before ${when(t.daysBefore)}`;
    return `${span}: ${t.percent === 0 ? 'nothing back' : `${t.percent}% of the entry amount ${RETURN_TEXT[rules.returnAs]}`}.`;
  });
  const last = tiers.at(-1);
  lines.push(last ? `After ${when(last.daysBefore)}: nothing back.` : 'Withdrawals: nothing back.');
  if (tiers.some((t) => t.percent > 0)) lines.push('Fees are not returned.');
  lines.push(`If the organizer cancels your race: ${CANCELLATION_TEXT[rules.organizerCancellation]}.`);
  return lines;
}

/** Everything a rider sees about refunds for this event: the rules, then any notes the organizer wrote. */
export function refundPolicyLines(config: { registration: { refundRules: RefundRules | null; refundPolicy: string }; days: { date: string }[] }): string[] {
  const firstDay = config.days.map((d) => d.date).sort()[0];
  const lines = config.registration.refundRules ? describeRefundRules(config.registration.refundRules, firstDay) : [];
  const notes = config.registration.refundPolicy.trim();
  return notes ? [...lines, notes] : lines;
}
