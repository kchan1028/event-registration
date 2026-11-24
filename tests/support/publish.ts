import type { FastifyInstance } from 'fastify';

/** Publishes as someone who has just reviewed the saved draft against the live version. */
export async function publishReviewed(app: FastifyInstance, eventUrl: string, payload: object, headers?: Record<string, string>) {
  const { revision, publishedVersion } = (await app.inject({ method: 'GET', url: eventUrl, headers })).json();
  return app.inject({ method: 'POST', url: `${eventUrl}/publish`, headers, payload: { ...payload, reviewed: { revision, publishedVersion } } });
}
