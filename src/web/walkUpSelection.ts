import { windowState } from '../shared/checkout';
import type { Category } from '../shared/schema';
import type { PublicEvent } from './api';

export const WALK_UP_CATEGORY_PARAM = 'walkUpCategory';

export function categorySelectionStatus(event: PublicEvent, category: Category, offered = false) {
  const remaining = event.remaining[category.id] ?? null;
  const cancelled = event.cancellation.categoryIds.includes(category.id);
  const window = windowState(category, event.nowLocal);
  // An offer reserves a place even when public availability shows a full field.
  const full = remaining === 0 && !offered;
  const outside = event.enforceWindows && window !== 'open';
  const closed = category.status !== 'active';
  return { remaining, cancelled, window, full, outside, closed, unavailable: cancelled || full || outside || closed };
}

/** Suggestions use the published snapshot. The normal checkout still validates the rider and their selections. */
export function availableWalkUpCategories(event: PublicEvent) {
  return event.config.categories.filter((category) => !categorySelectionStatus(event, category).unavailable);
}
