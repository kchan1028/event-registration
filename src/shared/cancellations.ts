import { z } from 'zod';

const id = z.string().min(1).max(64);
export const cancellationSelectionSchema = z.discriminatedUnion('scope', [
  z.object({ scope: z.literal('event') }).strict(),
  z.object({ scope: z.literal('day'), dayId: id }).strict(),
  z.object({ scope: z.literal('race'), raceId: id }).strict(),
]);
export type CancellationSelection = z.infer<typeof cancellationSelectionSchema>;
