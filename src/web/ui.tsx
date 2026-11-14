import { useEffect, useId, useState, type ReactNode } from 'react';
import { useTheme } from './theme';

/** Labeled field wrapper. The label is always visible (coding guide, Accessibility). */
export function Field({ label, hint, error, children, className }: { label: string; hint?: string; error?: string; children: (id: string, describedBy?: string) => ReactNode; className?: string }) {
  const id = useId();
  const hintId = hint || error ? `${id}-hint` : undefined;
  return (
    <div className={`field ${error ? 'field--error' : ''} ${className ?? ''}`}>
      <label htmlFor={id}>{label}</label>
      {children(id, hintId)}
      {error ? (
        <p className="field__error" id={hintId}>
          {error}
        </p>
      ) : hint ? (
        <p className="field__hint" id={hintId}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Integer input that keeps the typed text locally and commits only valid
 * values. Empty commits null when allowed.
 */
export function IntInput({
  id,
  value,
  onCommit,
  min = 0,
  max = 10000,
  allowEmpty = true,
  describedBy,
  placeholder,
  ariaLabel,
}: {
  id?: string;
  value: number | null;
  onCommit: (v: number | null) => void;
  min?: number;
  max?: number;
  allowEmpty?: boolean;
  describedBy?: string;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const [text, setText] = useState(value === null ? '' : String(value));
  useEffect(() => setText(value === null ? '' : String(value)), [value]);
  const parsed = text.trim() === '' ? null : Number(text);
  const invalid = parsed === null ? !allowEmpty : !Number.isInteger(parsed) || parsed < min || parsed > max;
  return (
    <input
      id={id}
      inputMode="numeric"
      className="input input--num"
      value={text}
      placeholder={placeholder}
      aria-label={ariaLabel}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      onChange={(e) => {
        setText(e.target.value);
        const t = e.target.value.trim();
        const n = t === '' ? null : Number(t);
        if (n === null ? allowEmpty : Number.isInteger(n) && n >= min && n <= max) onCommit(n);
      }}
      onBlur={() => setText(value === null ? '' : String(value))}
    />
  );
}

/** Dollar input stored as integer cents. */
export function MoneyInput({ id, cents, onCommit, describedBy, ariaLabel }: { id?: string; cents: number; onCommit: (c: number) => void; describedBy?: string; ariaLabel?: string }) {
  const fmt = (c: number) => (c % 100 === 0 ? String(c / 100) : (c / 100).toFixed(2));
  const [text, setText] = useState(fmt(cents));
  useEffect(() => setText(fmt(cents)), [cents]);
  const valid = /^\d{1,5}(\.\d{1,2})?$/.test(text.trim());
  return (
    <span className="money">
      <span aria-hidden="true" className="money__sign">
        $
      </span>
      <input
        id={id}
        inputMode="decimal"
        className="input input--num"
        value={text}
        aria-label={ariaLabel}
        aria-invalid={!valid || undefined}
        aria-describedby={describedBy}
        onChange={(e) => {
          setText(e.target.value);
          if (/^\d{1,5}(\.\d{1,2})?$/.test(e.target.value.trim())) onCommit(Math.round(Number(e.target.value) * 100));
        }}
        onBlur={() => setText(fmt(cents))}
      />
    </span>
  );
}

export function Pending({ children }: { children: ReactNode }) {
  return (
    <span className="pending">
      <svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14">
        <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2.5 2" />
      </svg>
      {children}
    </span>
  );
}

type IconName = 'up' | 'down' | 'copy' | 'plus' | 'trash' | 'warn' | 'error' | 'check' | 'eye' | 'arrow-left' | 'clip' | 'users';

const PATHS: Record<IconName, string> = {
  up: 'M8 3.5 3.5 8m4.5-4.5L12.5 8M8 3.5v9',
  down: 'M8 12.5 3.5 8m4.5 4.5L12.5 8M8 12.5v-9',
  copy: 'M5.5 5.5V3.25c0-.41.34-.75.75-.75h6.5c.41 0 .75.34.75.75v6.5c0 .41-.34.75-.75.75H10.5M3.25 5.5h6.5c.41 0 .75.34.75.75v6.5c0 .41-.34.75-.75.75h-6.5a.75.75 0 0 1-.75-.75v-6.5c0-.41.34-.75.75-.75Z',
  plus: 'M8 3v10M3 8h10',
  trash: 'M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.4c.03.4.37.6.75.6h4.3c.38 0 .72-.2.75-.6l.6-8.4',
  warn: 'M8 2.5 14 13H2L8 2.5Zm0 4v3m0 2v.01',
  error: 'M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12Zm0-8.5v3.25M8 10.75v.01',
  check: 'm3.5 8.5 3 3 6-7',
  eye: 'M1.75 8S4 3.5 8 3.5 14.25 8 14.25 8 12 12.5 8 12.5 1.75 8 1.75 8Zm6.25 2a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
  'arrow-left': 'M7 3.5 2.5 8 7 12.5M2.5 8h11',
  clip: 'M10.5 4.5v6a2.5 2.5 0 0 1-5 0V4a1.5 1.5 0 0 1 3 0v6.25',
  users: 'M6 7.5a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5Zm-4 5.5c0-2 1.8-3.5 4-3.5s4 1.5 4 3.5m1-9.25a2.25 2.25 0 0 1 0 4.25m1.5 1.75c1.5.5 2.5 1.75 2.5 3.25',
};

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d={PATHS[name]} />
    </svg>
  );
}

const SUN = 'M8 10.75a2.75 2.75 0 1 0 0-5.5 2.75 2.75 0 0 0 0 5.5ZM8 1.5v1.25m0 10.5v1.25M1.5 8h1.25m10.5 0h1.25M3.4 3.4l.9.9m7.4 7.4.9.9m0-9.2-.9.9m-7.4 7.4-.9.9';
const MOON = 'M13.5 9.6A5.75 5.75 0 0 1 6.4 2.5a5.75 5.75 0 1 0 7.1 7.1Z';

export function ThemeToggle() {
  const [theme, toggle] = useTheme();
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <button type="button" className="theme-toggle" data-current={theme} onClick={toggle} aria-label={`Theme: ${theme}. Switch to ${next} theme`} title={`Switch to ${next} theme`}>
      <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d={theme === 'dark' ? MOON : SUN} />
      </svg>
    </button>
  );
}

export function dayHue(index: number): string {
  return ['var(--day-1)', 'var(--day-2)', 'var(--day-3)', 'var(--day-4)'][index % 4];
}
