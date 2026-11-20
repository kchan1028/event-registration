import { windowState } from '../shared/checkout';
import type { PublicEvent } from './api';

export const WALK_UP_CATEGORY_PARAM = 'walkUpCategory';

/** Suggestions use the published snapshot. The normal checkout still validates the rider and their selections. */
export function availableWalkUpCategories(event: PublicEvent) {
  return event.config.categories.filter((category) =>
    category.status === 'active'
    && !event.cancellation.categoryIds.includes(category.id)
    && event.remaining[category.id] !== 0
    && (!event.enforceWindows || windowState(category, event.nowLocal) === 'open'),
  );
}
