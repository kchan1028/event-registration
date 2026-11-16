import { configFromTemplate } from './factory';
import type { EventConfig } from './schema';

/** Read-only TTT research examples contain no substituted road/criterium race. */
function researchExample(name: string, date: string, dayLabel: string, venue: string, notice: string, source: string): EventConfig {
  const config = configFromTemplate({ name, startDate: date, venue, timeZone: 'America/Los_Angeles', template: 'road_race' });
  config.event.isDemo = true;
  config.event.researchOnly = true;
  config.event.demoNotice = notice;
  config.ruleSet.source = source;
  config.days[0].label = dayLabel;
  config.races = [];
  config.displayGroups = [];
  config.registration.refundPolicy = 'Read-only research example. No entries or payments are accepted.';
  return config;
}

export const teamTimeTrialResearchDemos = [
  {
    key: 'bbc-team-time-trial',
    organizationName: 'BBC team time trial research (local demo)',
    build: () => researchExample(
      'Berkeley Bicycle Club Team Time Trial (research example)',
      '2008-03-09',
      'Historical 2008 date; no race configured',
      'Orinda, California (historical identity)',
      'Read-only research example, not a working TTT demo. Historical identity: March 9, 2008 BBC event; later format evidence is separate. Team rosters, team capacity, start intervals, equipment classes and team timing are not implemented. Registration is unavailable; no race, categories or upcoming event is created. Related to historical Pinole TTT; edition rules need approval.',
      'BikeReg 2008 BBC event identity; 2011 Team Mike’s Bikes description provides separate later format/Pinole history evidence. No approved eligibility rules.',
    ),
  },
  {
    key: 'pinole-team-time-trial',
    organizationName: 'Pinole team time trial research (local demo)',
    build: () => researchExample(
      'Pinole Team Time Trial (research example)',
      '2026-11-15',
      'Research placeholder; NOT a race date',
      'Historical Pinole route; exact edition unverified',
      'Read-only research example for the historical Pinole Two Man TTT, a predecessor of BBC TTT. Exact race date is unverified: November 15, 2026 is only a required research placeholder, NOT an event date. Team entry and timing are unsupported. Registration is unavailable; no race, categories or upcoming event is created. Keep distinct-era evidence separate until organizer review.',
      'BBC club history and 2011 Team Mike’s Bikes event-history description. Exact Pinole edition/date and approved rules are unresolved; stored day is a research placeholder.',
    ),
  },
] as const;
