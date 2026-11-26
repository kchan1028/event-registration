import { useRef, useState, type MouseEvent } from 'react';
import { api } from '../api';
import { useLoad } from '../useLoad';

export function ParticipantCount({ eventId, refreshKey }: { eventId: string; refreshKey: unknown }) {
  const [open, setOpen] = useState(false);

  return (
    <details className="settings__section" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary id="participant-count-title" className="lookup-toggle">Event participants</summary>
      {open && <ParticipantCountContent eventId={eventId} refreshKey={refreshKey} />}
    </details>
  );
}

function ParticipantCountContent({ eventId, refreshKey }: { eventId: string; refreshKey: unknown }) {
  const { data: groups, error, reload } = useLoad(() => api.participantGroups(eventId), [eventId, refreshKey]);

  const status = useRef<HTMLParagraphElement>(null);
  const retry = async (event: MouseEvent<HTMLButtonElement>) => {
    const button = event.currentTarget;
    if (await reload() && document.activeElement === button) status.current?.focus();
  };

  return (
    <div role="region" aria-labelledby="participant-count-title">
      <p ref={status} role="status" tabIndex={-1}>
        {!error && (groups === null ? 'Loading participant count…' : (
          <><strong className="num">{groups.length}</strong> {groups.length === 1 ? 'participant' : 'participants'} with confirmed orders</>
        ))}
      </p>
      {error && (
        <>
          <p className="alert alert--error" role="alert">Could not load the participant count.</p>
          <button className="btn btn--secondary btn--small" onClick={retry}>Retry participant count</button>
        </>
      )}
      <p className="muted small">
        Orders for one junior profile count as one participant. Adult orders marked as self-registration count together for the same signed-in account.
        Other orders count together when staff link them as the same rider.
        Check-in uses same-rider links for all orders. Linking across participant groups can make one check-in card for two participants.
        Unlinked orders for one participant can make two check-in cards.
      </p>
    </div>
  );
}
