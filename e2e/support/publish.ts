import type { APIRequestContext } from '@playwright/test';

/** Publishes as someone who has just reviewed the saved draft against the live version. */
export async function publishReviewed(api: APIRequestContext, eventUrl: string, data: object, headers?: Record<string, string>) {
  const { revision, publishedVersion } = await (await api.get(eventUrl, { headers })).json();
  return api.post(`${eventUrl}/publish`, { headers, data: { ...data, reviewed: { revision, publishedVersion } } });
}
