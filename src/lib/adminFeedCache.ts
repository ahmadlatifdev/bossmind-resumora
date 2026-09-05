import type { AdminFeedDetail } from './adminApi';

const FEED_CACHE_PREFIX = 'resumora_admin_feed_item_';

export function readCachedFeedItem(id: string): AdminFeedDetail | null {
  try {
    const raw = sessionStorage.getItem(`${FEED_CACHE_PREFIX}${id}`);
    if (!raw) return null;
    return JSON.parse(raw) as AdminFeedDetail;
  } catch {
    return null;
  }
}

export function cacheFeedItem(item: AdminFeedDetail) {
  try {
    sessionStorage.setItem(`${FEED_CACHE_PREFIX}${item.id}`, JSON.stringify(item));
  } catch {
    /* ignore */
  }
}
