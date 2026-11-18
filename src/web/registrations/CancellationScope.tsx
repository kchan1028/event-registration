import type { CancellationSelection } from '../../shared/cancellations';
import { api } from '../api';
import { useLoad } from '../useLoad';

export function HistoricalScope({ eventId, selection, version }: { eventId: string; selection: CancellationSelection; version: number }) {
  const { data, error } = useLoad(() => api.eventVersion(eventId, version), [eventId, version]);
  const label = selection.scope === 'event' ? 'Entire event' : selection.scope === 'day' ? data?.config.days.find((d) => d.id === selection.dayId)?.label ?? `Day ${selection.dayId}` : data?.config.races.find((r) => r.id === selection.raceId)?.name ?? `Race ${selection.raceId}`;
  return <p>Reviewed scope: {label} · published version {version}.{error && ' The saved scope name could not be loaded; the original identifier is shown.'}</p>;
}
