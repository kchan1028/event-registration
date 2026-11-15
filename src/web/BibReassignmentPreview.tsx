import { changedBibAssignments, type BibReassignmentPlan } from '../shared/checkin';

export function BibReassignmentPreview({ plan }: { plan: BibReassignmentPlan }) {
  return <div className="ci-batch ci-batch__preview">
    <h3>Review proposed numbers</h3>
    <p>No numbers have changed yet. Apply saves the whole change together, keeps history, and creates the start-list revisions below.</p>
    <p><strong>Scope:</strong> {plan.scopeLabel}. <strong>Reason:</strong> {plan.reason}</p>
    <p>{plan.races.length ? `Start lists to revise: ${plan.races.map((r) => r.name).join(', ')}.` : 'No start-list changes are needed.'}</p>
    {!changedBibAssignments(plan).length && <p role="status">The numbers already match this selection and order. No changes are needed.</p>}
    <div className="table-wrap" role="region" aria-label="Proposed bib changes" tabIndex={0}>
      <table><thead><tr><th scope="col">Rider</th><th scope="col">Current bib</th><th scope="col">Proposed bib</th><th scope="col">Range</th><th scope="col">Checked in</th></tr></thead>
        <tbody>{plan.assignments.map((a) => <tr key={a.orderId}><th scope="row">{a.name}</th><td>{a.currentBib}</td><td>{a.bib}</td><td>{a.range.first}–{a.range.last}</td><td>{a.checkedInDays.join(', ') || 'Not checked in'}</td></tr>)}</tbody>
      </table>
    </div>
  </div>;
}
