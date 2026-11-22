/** The reason a test publishes a waiver change with, bound to the saved draft it was written for. */
export function waiverChangeFor(saved: { revision: number; publishedVersion: number | null }) {
  return { reason: 'Fictional waiver update', revision: saved.revision, publishedVersion: saved.publishedVersion };
}
