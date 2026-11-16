import { configFromTemplate, newCategory, newId } from './factory';
import { SAMPLE_WAIVER } from './demo';
import type { EventConfig } from './schema';

/** 2005 road-race study. Individual checkout simulates, but does not implement, professional admission. */
export function buildSanFranciscoGrandPrixEvent(): EventConfig {
  const config = configFromTemplate({
    name: 'San Francisco Grand Prix (historical demo)',
    template: 'road_race',
    startDate: '2005-09-04',
    timeZone: 'America/Los_Angeles',
    venue: 'Embarcadero at Washington Street, San Francisco, California',
  });
  config.event.isDemo = true;
  config.event.demoNotice = 'Historical 2005 professional road-race study, not an upcoming event or Il Giro criterium. Individual checkout is simulated and does not grant professional or team admission. Test assumptions: 09:00 start, $40 entry, 60-rider limit, adult annual-license PRO eligibility. Organizer and license review remain required.';
  config.ruleSet.source = 'September 4, 2005 Cyclingnews race preview and SFMTA street-closure minutes. Eligibility, start time, price, and cap are demo assumptions.';
  config.registration.waiverText = SAMPLE_WAIVER;
  config.registration.waiverVersion = 'sfgp-demo-v1';
  config.registration.refundPolicy = 'Fictional demonstration only. No money is charged.';
  const race = config.races[0];
  race.name = 'San Francisco Grand Prix';
  race.course = 'Historical preview: 3 parade laps of 1.3 mi, 9 long laps of 8.8 mi via Fillmore and Taylor, then 5 short laps of 5 mi via Taylor. Total 108.1 mi; varying loop lengths are descriptive only.';
  config.displayGroups[0].name = 'Historical professional program';
  const start = { id: newId('sg'), raceId: race.id, name: 'Professional road race (simulation)', startTime: '09:00', stagingTime: null, fieldLimit: 60 };
  config.startGroups.push(start);
  const category = newCategory(config, race.id);
  category.name = 'Men professional (simulation)';
  category.timingCode = 'SFGP-PRO';
  category.classifications = [{ code: 'SFGP-PRO', label: category.name }];
  category.displayGroupId = config.displayGroups[0].id;
  category.startGroupId = start.id;
  category.length = { kind: 'distance', distance: 108.1, unit: 'mi', laps: null, partialFinalLap: false };
  category.pricing.baseCents = 4000;
  category.description = 'The preview supplies total distance and varying loops. A 09:00 start, $40 price, 60-rider limit, and adult annual-license PRO eligibility are test assumptions, not historical admission rules. Team selection and professional event approval are not implemented.';
  category.eligibility.organizerReview = true;
  category.eligibility.paths[0] = {
    ...category.eligibility.paths[0],
    licenseCategories: ['PRO'],
    licenseTypes: ['annual'],
    genderClass: 'men',
    minAge: 18,
  };
  config.categories.push(category);
  return config;
}
