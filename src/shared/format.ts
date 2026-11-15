import type { Category, EventConfig, RaceLength, StartGroup } from './schema';

export function formatCents(cents: number): string {
  if (cents === 0) return 'Free';
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

/** An amount such as "$80" or "-$12.50". Unlike `formatCents`, zero reads "$0", not "Free". */
export function formatDollars(cents: number): string {
  return `${cents < 0 ? '-' : ''}$${(Math.abs(cents) / 100).toFixed(2).replace(/\.00$/, '')}`;
}

export function formatLength(length: RaceLength): string {
  switch (length.kind) {
    case 'distance': {
      const d = `${trimNumber(length.distance)} ${length.unit}`;
      if (length.laps === null) return d;
      return `${d} · ${length.laps} ${length.laps === 1 ? 'lap' : 'laps'}${length.partialFinalLap ? ' + partial lap' : ''}`;
    }
    case 'duration':
      return length.plusLaps ? `${length.minutes} min + ${length.plusLaps} ${length.plusLaps === 1 ? 'lap' : 'laps'}` : `${length.minutes} min`;
    case 'laps':
      return `${length.laps} ${length.laps === 1 ? 'lap' : 'laps'}`;
    case 'unset':
      return 'Not set';
  }
}

function trimNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** Sort key that puts a missing start time after every real 24-hour time. */
export const NO_START_TIME_SORT_KEY = '99:99';

/** 24-hour "08:05" to "8:05 AM". */
export function formatTime(t: string | null): string {
  if (!t) return 'No start time';
  const [h, m] = t.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

export function startGroupFor(config: EventConfig, category: Category): StartGroup | undefined {
  return category.startGroupId ? config.startGroups.find((g) => g.id === category.startGroupId) : undefined;
}

export function sortCategories<T extends { sortOrder: number }>(list: T[]): T[] {
  return [...list].sort((a, b) => a.sortOrder - b.sortOrder);
}
