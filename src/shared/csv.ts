/**
 * Minimal RFC 4180 CSV reader and the one CSV writer: quoted fields, escaped quotes, CRLF or LF, optional BOM.
 * Every export (categories, start lists, entries, ledger) is written here so the formula guard is never skipped.
 */

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Drop fully empty lines.
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/** Text a spreadsheet would run as a formula: it starts with =, +, -, @, a tab, or a carriage return. */
const FORMULA_START = /^[=+\-@\t\r]/;

/**
 * One CSV field. Text that a spreadsheet would run as a formula gets a leading apostrophe.
 * Numbers are written as they are, so negative amounts stay numbers. Booleans become Y or N.
 * Values with a comma, quote, line break, or space at either end are quoted.
 */
export function csvField(value: unknown): string {
  if (typeof value === 'number') return String(value);
  let s = value === null || value === undefined ? '' : typeof value === 'boolean' ? (value ? 'Y' : 'N') : String(value);
  if (FORMULA_START.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Undo the formula guard on text read back from a file this app wrote. Other text is returned unchanged. */
export function stripFormulaGuard(s: string): string {
  return s.startsWith("'") && FORMULA_START.test(s.slice(1)) ? s.slice(1) : s;
}

export function writeCsv(rows: readonly (readonly unknown[])[]): string {
  return rows.map((r) => r.map(csvField).join(',')).join('\r\n') + '\r\n';
}
