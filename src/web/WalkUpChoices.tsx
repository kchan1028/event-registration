import { useState } from 'react';
import { sortCategories } from '../shared/format';
import { api } from './api';
import { QrCodeImage } from './QrCodeImage';
import { Field } from './ui';
import { useLoad } from './useLoad';
import { availableWalkUpCategories, WALK_UP_CATEGORY_PARAM } from './walkUpSelection';

export function WalkUpChoices({ eventId, dayId, address }: { eventId: string; dayId: string; address: string }) {
  const { data, error, reload } = useLoad(() => api.publicEvent(eventId), [eventId]);
  const [selected, setSelected] = useState<string[]>([]);

  if (error) return <>
    <p role="alert">Could not load race choices. {error}</p>
    <button type="button" className="btn btn--secondary" onClick={reload}>Retry race choices</button>
  </>;
  if (!data) return <p role="status">Loading race choices…</p>;

  const dayRaces = data.config.races.filter((race) => race.dayId === dayId);
  const choices = sortCategories(availableWalkUpCategories(data).filter((category) => dayRaces.some((race) => race.id === category.raceId)));
  if (choices.length === 0) return <p role="status">No categories are open with places available on this race day.</p>;

  const params = new URLSearchParams();
  for (const category of choices) {
    if (selected.includes(category.id)) params.append(WALK_UP_CATEGORY_PARAM, category.id);
  }
  const suggestion = params.size ? `${address}?${params}` : null;
  return <>
    <fieldset className="subfields checks">
      <legend>Race choices for the selected day</legend>
      {choices.map((category) => <label className="check" key={category.id}>
        <input
          type="checkbox"
          checked={selected.includes(category.id)}
          onChange={(event) => {
            const checked = event.target.checked;
            setSelected((previous) => checked ? [...previous, category.id] : previous.filter((id) => id !== category.id));
          }}
        />
        {category.timingCode && `${category.timingCode} · `}{category.name} · {dayRaces.find((race) => race.id === category.raceId)?.name}
      </label>)}
    </fieldset>
    {suggestion && <>
      <QrCodeImage key={suggestion} value={suggestion} alt="QR code to review suggested races" />
      <Field label="Race choices address">
        {(id) => <input id={id} className="input" readOnly value={suggestion} onFocus={(event) => event.currentTarget.select()} />}
      </Field>
    </>}
  </>;
}
