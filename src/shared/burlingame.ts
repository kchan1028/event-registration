import { configFromTemplate, newCategory, newId } from './factory';
import { SAMPLE_WAIVER } from './demo';
import type { EventConfig, LicenseCategory } from './schema';

/** Historical schedule only. Prices, caps, and eligibility are explicit demo assumptions. */
export function buildBurlingameEvent(): EventConfig {
  const config = configFromTemplate({
    name: 'Burlingame Criterium (historical demo)',
    template: 'criterium',
    startDate: '2017-06-25',
    timeZone: 'America/Los_Angeles',
    venue: 'Downtown Burlingame, California',
  });
  config.event.isDemo = true;
  config.event.demoNotice = 'Historical 2017 schedule study. The organizer lists this event as on hiatus. No upcoming race is announced here. Test assumptions: $40 per entry, 60 riders per start, 40-minute races, draft adult eligibility. Payments are simulated; all licenses and eligibility require review.';
  config.ruleSet.source = '2017 OnTheDay Burlingame schedule; demo eligibility assumptions, not verified federation rules.';
  config.registration.waiverText = SAMPLE_WAIVER;
  config.registration.waiverVersion = 'burlingame-demo-v1';
  config.registration.refundPolicy = 'Fictional demonstration only. No money is charged.';
  config.races[0].name = 'Burlingame Criterium';
  config.displayGroups[0].name = 'Historical race program';

  const program: Array<{ name: string; time: string; license: LicenseCategory[]; women?: boolean; masters?: boolean }> = [
    { name: 'Men Elite 4', time: '07:00', license: ['4'] },
    { name: 'Women 3/4', time: '07:50', license: ['3', '4'], women: true },
    { name: 'Men Elite 3', time: '08:40', license: ['3'] },
    { name: 'Men 35/45+ 3/4', time: '09:35', license: ['3', '4'], masters: true },
    { name: 'Women Pro 1/2/3', time: '12:00', license: ['PRO', '1', '2', '3'], women: true },
    { name: 'Men 35/45+ 1/2/3', time: '13:00', license: ['1', '2', '3'], masters: true },
    { name: 'Men Pro/1/2', time: '14:00', license: ['PRO', '1', '2'] },
  ];
  for (const field of program) {
    const start = { id: newId('sg'), raceId: config.races[0].id, name: field.name, startTime: field.time, stagingTime: null, fieldLimit: 60 };
    config.startGroups.push(start);
    for (const age of field.masters ? [35, 45] : [18]) {
      const category = newCategory(config, config.races[0].id);
      category.name = field.masters ? field.name.replace('35/45+', `${age}+`) : field.name;
      category.timingCode = `BURL-${config.categories.length + 1}`;
      category.classifications = [{ code: category.timingCode, label: category.name }];
      category.displayGroupId = config.displayGroups[0].id;
      category.startGroupId = start.id;
      category.length = { kind: 'duration', minutes: 40, plusLaps: null };
      category.pricing.baseCents = 4000;
      category.description = 'Historical field label; $40 price and shared 60-rider cap are test values. The 40-minute duration is also a test value. Eligibility, license types, and age/classification rules need organizer approval. Non-masters fields use an adult-only demo assumption.';
      category.eligibility.organizerReview = true;
      category.eligibility.paths[0] = {
        ...category.eligibility.paths[0],
        licenseCategories: field.license,
        licenseTypes: ['annual'],
        genderClass: field.women ? 'women' : 'men',
        minAge: age,
      };
      config.categories.push(category);
    }
  }
  return config;
}
