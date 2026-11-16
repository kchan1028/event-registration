import type { LicenseCategory } from './schema';

/** Shared fictional riders and sample waiver for local tests and generated case studies. */

export const FIXTURE_NOTICE =
  'Demo fixtures: fictional events, riders, prices, and fees from docs/fixtures for the clickable demo. Not real events, real prices, or current USA Cycling rules.';

export const FIXTURE_WAIVER_VERSION = 'DEMO-WAIVER v1 (2026-11-14)';

export const FIXTURE_WAIVER_TEXT = `SAMPLE TEXT FOR THE CLICKABLE DEMO. NOT A REAL WAIVER.

This text is a placeholder for usability testing. It is not the USA Cycling waiver, it has not been reviewed by a lawyer, and a signature on it has no legal effect for any event. A sanctioned event must use the waiver its governing body requires, unmodified.

Participant agreement (sample)

1. Risk. I understand bicycle racing can cause injury, and I choose to take part in this demo event.
2. Fitness and equipment. I am fit to race, my bicycle is in safe working order, and I will wear an approved helmet at all times on the course.
3. Rules. I will follow the officials' instructions and the event rules.
4. Medical care. If I am hurt and cannot respond, I agree that event staff may arrange emergency medical care.
5. Photos. I understand I may appear in event photos.

Minors: a parent or guardian must sign for a rider under 18.`;

export interface DemoRider {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  team: string;
  racingAge: number;
  competitionClass: 'women' | 'men';
  licenseCategory: LicenseCategory;
  licenseNumber: string;
  licenseCheck: 'simulated_valid' | 'simulated_unknown';
  guardian: { name: string; relationship: string; email: string; phone: string } | null;
  emergencyContact: { name: string; phone: string };
}

export const DEMO_RIDERS: DemoRider[] = [
  { id: 'rider-alex', firstName: 'Alex', lastName: 'Demo', email: 'alex.demo@example.com', phone: '555-555-0101', team: 'Demo Wheelers', racingAge: 29, competitionClass: 'men', licenseCategory: '4', licenseNumber: 'DEMO-100001', licenseCheck: 'simulated_valid', guardian: null, emergencyContact: { name: 'Robin Demo', phone: '555-555-0111' } },
  { id: 'rider-blake', firstName: 'Blake', lastName: 'Demo', email: 'blake.demo@example.com', phone: '555-555-0102', team: 'Sample Velo', racingAge: 38, competitionClass: 'women', licenseCategory: '3', licenseNumber: 'DEMO-100002', licenseCheck: 'simulated_valid', guardian: null, emergencyContact: { name: 'Taylor Demo', phone: '555-555-0112' } },
  { id: 'rider-casey', firstName: 'Casey', lastName: 'Demo', email: '', phone: '', team: '', racingAge: 13, competitionClass: 'men', licenseCategory: '5', licenseNumber: 'DEMO-100003', licenseCheck: 'simulated_valid', guardian: { name: 'Jordan Demo', relationship: 'Parent', email: 'jordan.demo@example.com', phone: '555-555-0103' }, emergencyContact: { name: 'Jordan Demo', phone: '555-555-0103' } },
  { id: 'rider-sam', firstName: 'Sam', lastName: 'Demo', email: 'sam.demo@example.com', phone: '555-555-0104', team: '', racingAge: 31, competitionClass: 'women', licenseCategory: '4', licenseNumber: 'DEMO-100004', licenseCheck: 'simulated_unknown', guardian: null, emergencyContact: { name: 'Morgan Demo', phone: '555-555-0114' } },
];

export function demoRider(id: string | null | undefined): DemoRider | undefined {
  return DEMO_RIDERS.find((r) => r.id === id);
}
