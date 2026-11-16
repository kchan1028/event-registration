import type { EventConfig } from './schema';

export const RESEARCH_REGISTRATION_MESSAGE = 'This is a read-only research example. Registration is unavailable.';

export function isResearchExample(config: EventConfig): boolean {
  return config.event.researchOnly === true;
}
