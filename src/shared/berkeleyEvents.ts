import { buildBerkeleyOmniumEvent } from './berkeleyOmnium';
import type { EventConfig } from './schema';

export const BERKELEY_DEMO_ORG = 'Berkeley standalone events (local demo)';

/** Two independent events. No bundle, podium nomination, or prefilled entries. */
export function buildBerkeleyEvents(): EventConfig[] {
  const { config } = buildBerkeleyOmniumEvent();
  return config.races.map((race) => {
    const categories = config.categories.filter((c) => c.raceId === race.id).map((c) => ({
      ...c,
      pricing: { ...c.pricing, dayOfSurchargeCents: 0 },
    }));
    return {
      ...config,
      event: {
        ...config.event,
        name: race.name,
        venue: race.discipline === 'road_race' ? 'Bear Creek Road near Orinda, California' : 'Downtown Berkeley, California',
        demoNotice: 'Standalone Berkeley demo. Uses 2026 schedule information dated for 2027, with organizer-set entry prices. Entries and payments are simulated. Eligibility needs organizer review.',
      },
      days: config.days.filter((d) => d.id === race.dayId),
      races: [race],
      categories,
      startGroups: config.startGroups.filter((g) => g.raceId === race.id),
      displayGroups: config.displayGroups.filter((g) => categories.some((c) => c.displayGroupId === g.id)),
      capacityPools: [],
      registration: {
        ...config.registration,
        bundles: [],
        sameRaceExtraEntryCents: null,
        additionalRaceDiscountCents: 0,
        platformFeeCents: 0,
        processingFeeBasisPoints: 0,
        demoIgnoreWindows: true,
        refundPolicy: 'Demo only. No money is charged and no refund is needed.',
      },
    };
  });
}
