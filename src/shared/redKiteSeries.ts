import { configFromTemplate, newCategory, newId } from './factory';
import { SAMPLE_WAIVER } from './demo';
import type { EventConfig, LicenseCategory } from './schema';

/** Selected 2017 criterium rounds, not a reproduction of the full mixed-format series. */
export function buildRedKiteSeriesEvent(): EventConfig {
  const config = configFromTemplate({
    name: 'Red Kite Series (historical criterium sample)',
    template: 'criterium',
    startDate: '2017-03-19',
    timeZone: 'America/Los_Angeles',
    venue: 'Northern California; historical venue details need review',
  });
  config.event.isDemo = true;
  config.event.demoNotice = 'Historical sample: only 2017 Red Kite criterium rounds #2, #5, and #9, not the full 14-round series or an upcoming event. Test assumptions: $40 per entry, 60 riders per shared start, 30-minute races, draft adult eligibility. No series points, standings, pass, or package. Simulated payments; organizer and license review required.';
  config.ruleSet.source = '2017 OnTheDay Red Kite schedules for #2, #5, #9. Prices, caps, durations, and structured eligibility are demo assumptions.';
  config.registration.waiverText = SAMPLE_WAIVER;
  config.registration.waiverVersion = 'red-kite-demo-v1';
  config.registration.refundPolicy = 'Fictional demonstration only. No money is charged.';
  config.days = [];
  config.races = [];
  config.displayGroups = [];
  const rounds = [
    { number: 2, date: '2017-03-19' },
    { number: 5, date: '2017-04-23' },
    { number: 9, date: '2017-07-09' },
  ];
  const program: Array<{ name: string; time: string; license: LicenseCategory[]; women?: boolean; ages: number[] }> = [
    { name: 'Women Cat 3 and Cat 4/5', time: '08:00', license: ['3', '4', '5'], women: true, ages: [18] },
    { name: 'Elite 5', time: '08:50', license: ['5'], ages: [18] },
    { name: 'Women Pro/1/2/3', time: '09:30', license: ['PRO', '1', '2', '3'], women: true, ages: [18] },
    { name: 'Masters 45+/55+ 3/4', time: '10:20', license: ['3', '4'], ages: [45, 55] },
    { name: 'Elite 4', time: '11:10', license: ['4'], ages: [18] },
    { name: 'Masters 35+ 3/4', time: '12:30', license: ['3', '4'], ages: [35] },
    { name: 'Masters 45+/55+ 1/2/3', time: '13:20', license: ['1', '2', '3'], ages: [45, 55] },
    { name: 'Elite 3/4', time: '14:10', license: ['3', '4'], ages: [18] },
    { name: 'Masters 35+ 1/2/3', time: '15:00', license: ['1', '2', '3'], ages: [35] },
    { name: 'Elite 2/3', time: '16:10', license: ['2', '3'], ages: [18] },
    { name: 'Pro/1/2', time: '17:20', license: ['PRO', '1', '2'], ages: [18] },
  ];
  for (const round of rounds) {
    const day = { id: newId('day'), date: round.date, label: `Round #${round.number}` };
    const race = { id: newId('race'), dayId: day.id, name: `Red Kite #${round.number}: Criterium`, discipline: 'criterium' as const, course: 'Historical criterium; venue and course require organizer confirmation.' };
    const display = { id: newId('dg'), name: race.name, sortOrder: config.displayGroups.length };
    config.days.push(day);
    config.races.push(race);
    config.displayGroups.push(display);
    for (const field of program) {
      const start = { id: newId('sg'), raceId: race.id, name: field.name, startTime: field.time, stagingTime: null, fieldLimit: 60 };
      config.startGroups.push(start);
      const isSplitWomen = field.name === 'Women Cat 3 and Cat 4/5';
      const members = isSplitWomen
        ? [{ name: 'Women Cat 3', license: ['3'] as LicenseCategory[], age: 18 }, { name: 'Women Cat 4/5', license: ['4', '5'] as LicenseCategory[], age: 18 }]
        : field.ages.map((age) => ({ name: field.name.replace('45+/55+', `${age}+`), license: field.license, age }));
      for (const member of members) {
        const category = newCategory(config, race.id);
        category.name = member.name;
        category.timingCode = `RK${round.number}-${config.categories.length + 1}`;
        category.classifications = [{ code: category.timingCode, label: category.name }];
        category.displayGroupId = display.id;
        category.startGroupId = start.id;
        category.length = { kind: 'duration', minutes: 30, plusLaps: null };
        category.pricing.baseCents = 4000;
        category.description = 'Historical round/category structure. Test values: $40, 30 minutes, 60 riders per shared start, annual licenses and adult minimum age. Masters minimum ages follow draft labels. No inferred dual scoring, series points, or overall qualification.';
        category.eligibility.organizerReview = true;
        category.eligibility.paths[0] = { ...category.eligibility.paths[0], licenseCategories: member.license, licenseTypes: ['annual'], genderClass: field.women ? 'women' : 'any', minAge: member.age };
        config.categories.push(category);
      }
    }
  }
  return config;
}
