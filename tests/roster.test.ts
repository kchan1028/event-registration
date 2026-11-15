import { describe, expect, it } from 'vitest';
import type { CheckInResult } from '../src/shared/checkin';
import { buildRoster, type RosterRiderInput } from '../src/shared/roster';

const ready: CheckInResult = { ready: true, blockers: [] };
const license: CheckInResult = { ready: false, blockers: [{ key: 'license', label: 'License needs review', action: 'Send the rider to the registration desk to have the license checked.' }] };

function rider(over: Partial<RosterRiderInput> & { name: string }): RosterRiderInput {
  return { orderId: over.name, team: '', racingAge: 30, entries: [{ code: 'C1', categoryName: 'Cat 4/5', startTime: '09:00' }], result: ready, bib: null, checkedInAt: null, ...over };
}

describe('printable fallback roster', () => {
  it('sorts riders by surname, then full name', () => {
    const r = buildRoster([rider({ name: 'Zed Adams' }), rider({ name: 'Amy Young' }), rider({ name: 'Bea Adams' })]);
    expect(r.rows.map((x) => x.name)).toEqual(['Bea Adams', 'Zed Adams', 'Amy Young']);
  });

  it('lists ready, checked-in, and blocked riders with counts', () => {
    const r = buildRoster([
      rider({ name: 'A One' }),
      rider({ name: 'B Two', checkedInAt: '2027-04-17T15:00:00Z', bib: 101 }),
      rider({ name: 'C Three', result: license }),
    ]);
    expect(r.rows.map((x) => x.status)).toEqual(['ready', 'blocked', 'checked_in']);
    expect(r.counts).toEqual({ riders: 3, checkedIn: 1, ready: 1, blocked: 1 });
    expect(r.exceptions.map((x) => x.name)).toEqual(['C Three']);
    expect(r.exceptions[0].blockers[0].action).toContain('registration desk');
  });

  it('never prints a blocked rider as cleared, even with a check-in on record', () => {
    const r = buildRoster([rider({ name: 'D Four', result: license, checkedInAt: '2027-04-17T15:00:00Z', bib: 120 })]);
    expect(r.rows[0].status).toBe('blocked');
    expect(r.exceptions).toHaveLength(1);
  });

  it('orders each rider’s races by start time, unknown times last', () => {
    const r = buildRoster([
      rider({
        name: 'E Five',
        entries: [
          { code: 'LATE', categoryName: 'Open', startTime: '17:30' },
          { code: 'TBD', categoryName: 'Open', startTime: null },
          { code: 'EARLY', categoryName: 'Open', startTime: '08:00' },
        ],
      }),
    ]);
    expect(r.rows[0].entries.map((e) => e.code)).toEqual(['EARLY', 'LATE', 'TBD']);
  });

  it('carries no contact, license, or payment fields', () => {
    const r = buildRoster([rider({ name: 'F Six' })]);
    expect(Object.keys(r.rows[0]).sort()).toEqual(['bib', 'blockers', 'entries', 'name', 'orderId', 'racingAge', 'status', 'team']);
  });
});
