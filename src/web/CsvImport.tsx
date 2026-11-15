import { useMemo, useState } from 'react';
import { applyImport, autoMap, CSV_FIELDS, exportCategoriesCsv, issuesAfterImport, planImport, templateCsv } from '../shared/categoryCsv';
import { parseCsv } from '../shared/csv';
import { saveBlob } from './api';
import type { Draft } from './Builder';
import { Field, Icon } from './ui';

const download = (name: string, text: string) => saveBlob(name, new Blob([text], { type: 'text/csv;charset=utf-8' }));

/** Import categories from a CSV into the draft, with column mapping and per-row errors; export the schedule. */
export function CsvImport({ draft }: { draft: Draft }) {
  const { config, update } = draft;
  const [fileName, setFileName] = useState('');
  const [table, setTable] = useState<string[][] | null>(null);
  const [mapping, setMapping] = useState<Record<string, number | null>>({});
  const [skipAck, setSkipAck] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [readError, setReadError] = useState<string | null>(null);

  const headers = table?.[0] ?? [];
  const plan = useMemo(() => (table ? planImport(config, table, mapping) : null), [config, table, mapping]);
  const draftErrors = useMemo(() => (plan && plan.validCount > 0 ? issuesAfterImport(config, plan) : []), [config, plan]);
  const slug = config.event.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const load = (name: string, text: string) => {
    setResult(null);
    setSkipAck(false);
    const rows = parseCsv(text);
    if (rows.length < 2) {
      setReadError('The file needs a header row and at least one category row.');
      setTable(null);
      return;
    }
    setReadError(null);
    setFileName(name);
    setTable(rows);
    setMapping(autoMap(rows[0]));
  };

  const doImport = () => {
    if (!plan) return;
    let added = 0;
    update((c) => {
      const r = applyImport(c, plan);
      added = r.added;
      return r.config;
    });
    setResult(`Added ${added} ${added === 1 ? 'category' : 'categories'} to the draft${plan.errorCount ? ` and skipped ${plan.errorCount} ${plan.errorCount === 1 ? 'row' : 'rows'} with errors` : ''}. Review them in each race, then publish. Nothing is published by an import.`);
    setTable(null);
    setFileName('');
  };

  const canImport = !!plan && plan.missingRequired.length === 0 && plan.validCount > 0 && (plan.errorCount === 0 || skipAck);

  return (
    <div className="settings settings--wide">
      <h2 className="page-title">Import and export categories</h2>
      <p className="lede">
        Load a category schedule from a spreadsheet saved as CSV. Every row is checked before anything changes, and imported categories go into the draft, which you still review and publish. Eligibility comes
        only from explicit columns; nothing is guessed from a category name. Column reference: <code className="code">docs/csv-category-format.md</code> in the repository.
      </p>

      <section className="settings__section">
        <h3>Start from a file</h3>
        <div className="row-actions">
          <button className="btn btn--secondary btn--small" onClick={() => download('cyclereg-category-template.csv', templateCsv())}>
            <Icon name="down" /> Download template
          </button>
          <button className="btn btn--secondary btn--small" onClick={() => download(`${slug || 'event'}-categories.csv`, exportCategoriesCsv(config))} disabled={config.categories.length === 0}>
            <Icon name="down" /> Export this schedule
          </button>
        </div>
        <Field label="CSV file to import" hint="Races must already exist in Event setup; rows are matched to them by name.">
          {(id, d) => (
            <input
              id={id}
              aria-describedby={d}
              type="file"
              accept=".csv,text/csv"
              className="input"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) load(f.name, await f.text());
                e.target.value = '';
              }}
            />
          )}
        </Field>
        {readError && <p className="note note--error" role="alert">{readError}</p>}
        {result && <p className="note note--ok" role="status">{result}</p>}
      </section>

      {table && plan && (
        <>
          <section className="settings__section">
            <h3>Match columns</h3>
            <p className="muted small">
              {fileName}: {table.length - 1} {table.length - 1 === 1 ? 'row' : 'rows'}. Columns were matched by name; change any that are wrong.
            </p>
            {plan.missingRequired.length > 0 && (
              <p className="note note--error" role="alert">
                Match these required columns before importing: {plan.missingRequired.join(', ')}.
              </p>
            )}
            <div className="map-grid">
              {CSV_FIELDS.map((f) => (
                <Field key={f.key} label={`${f.label}${f.required ? ' (required)' : ''}`} hint={f.help}>
                  {(id, d) => (
                    <select id={id} aria-describedby={d} className="input" value={mapping[f.key] ?? ''} onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value === '' ? null : Number(e.target.value) }))}>
                      <option value="">Not in file</option>
                      {headers.map((h, i) => (
                        <option key={i} value={i}>
                          {h || `Column ${i + 1}`}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
              ))}
            </div>
          </section>

          <section className="settings__section">
            <h3>Check rows</h3>
            <p className="import-summary">
              <span className="num">{plan.validCount}</span> ready to import · <span className={`num ${plan.errorCount ? 'text-error' : ''}`}>{plan.errorCount}</span> with errors
            </p>
            <div className="table-wrap" role="region" aria-label="Import preview, row by row" tabIndex={0}>
              <table className="mini-table import-table">
                <thead>
                  <tr>
                    <th scope="col">Line</th>
                    <th scope="col">Category</th>
                    <th scope="col">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.rows.map((r) => (
                    <tr key={r.line} className={r.errors.length ? 'is-error' : ''}>
                      <td className="num">{r.line}</td>
                      <td>{r.name}</td>
                      <td>
                        {r.errors.length === 0 && (
                          <span className="readiness__item readiness__item--done">
                            <Icon name="check" size={14} /> Ready
                          </span>
                        )}
                        {r.errors.map((m) => (
                          <p key={m} className="issue issue--error">
                            <Icon name="error" size={14} /> {m}
                          </p>
                        ))}
                        {r.warnings.map((m) => (
                          <p key={m} className="issue issue--warning">
                            <Icon name="warn" size={14} /> {m}
                          </p>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {draftErrors.length > 0 && (
              <div className="note note--warn">
                <p>After this import the draft will have {draftErrors.length} {draftErrors.length === 1 ? 'error' : 'errors'} to fix before publishing, for example: {draftErrors[0].message}</p>
              </div>
            )}
            {plan.errorCount > 0 && plan.validCount > 0 && (
              <label className="check">
                <input type="checkbox" checked={skipAck} onChange={(e) => setSkipAck(e.target.checked)} />
                Import the {plan.validCount} ready {plan.validCount === 1 ? 'row' : 'rows'} and skip the {plan.errorCount} with errors
              </label>
            )}
            <div className="row-actions">
              <button className="btn btn--primary" disabled={!canImport} onClick={doImport}>
                Add {plan.validCount} {plan.validCount === 1 ? 'category' : 'categories'} to the draft
              </button>
              <button className="btn btn--ghost" onClick={() => setTable(null)}>
                Cancel
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
