import { useRef, type MouseEvent } from 'react';
import { api } from '../api';
import { useLoad } from '../useLoad';

export function ParticipantCount({ eventId, refreshKey }: { eventId: string; refreshKey: unknown }) {
  const { data: groups, error, reload } = useLoad(() => api.participantGroups(eventId), [eventId, refreshKey]);

  const status = useRef<HTMLParagraphElement>(null);
  const retry = async (event: MouseEvent<HTMLButtonElement>) => {
    const button = event.currentTarget;
    if (await reload() && document.activeElement === button) status.current?.focus();
  };

  return (
    <section className="settings__section" aria-labelledby="participant-count-title">
      <h3 id="participant-count-title">Event participants</h3>
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
        Confirmed orders for the same junior profile count as one participant. Orders without a junior profile count together when staff link them as the same rider.
        Check-in uses same-rider links for all orders. Linking across junior profiles, or linking a junior order to an adult order, can make one check-in card for two participants.
        Unlinked orders for the same junior profile can make two check-in cards for one participant.
      </p>
    </section>
  );
}
