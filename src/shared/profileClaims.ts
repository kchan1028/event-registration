import { z } from 'zod';
import { todayIn } from './pricing';

function validBirthDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(0); date.setUTCFullYear(year, month - 1, day); date.setUTCHours(0, 0, 0, 0);
  return date.toISOString().slice(0, 10) === value;
}

function validTimeZone(value: string) {
  if (!/^[A-Za-z_]+(?:\/[A-Za-z0-9_+.-]+)*$/.test(value)) return false;
  try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; }
}

export const profileClaimApprovalSchema = z.object({
  clientRequestId: z.string().trim().min(8).max(128),
  riderAccountId: z.string().min(1).max(64),
  birthDate: z.string().refine(validBirthDate, 'Enter a valid birth date as YYYY-MM-DD.'),
  timeZone: z.string().trim().min(1).max(64).refine(validTimeZone, 'Enter the rider-confirmed named time zone.'),
  reviewReference: z.string().trim().refine((s) => Array.from(s).length >= 3 && Array.from(s).length <= 300, 'Enter a review reference of 3 to 300 characters, without identity-document copies.'),
  acknowledge: z.literal(true),
}).strict();

/** Calendar age in the recorded zone; February 29 is observed on March 1 in non-leap years. */
export function claimCalendarAge(birthDate: string, timeZone: string, now: Date) {
  const onDate = todayIn(timeZone, now);
  const year = Number(onDate.slice(0, 4));
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthDay = birthDate.slice(5) === '02-29' && !leap ? '03-01' : birthDate.slice(5);
  return { onDate, age: year - Number(birthDate.slice(0, 4)) - Number(onDate < `${year}-${monthDay}`) };
}
