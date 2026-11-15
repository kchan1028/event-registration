/** PostgreSQL server for the API tests: any database on it works; tests create their own. */
export const TEST_SERVER_URL = process.env.TEST_DATABASE_URL ?? 'postgres://cyclereg:cyclereg@127.0.0.1:5432/cyclereg';

/** The same server, connected to the always-present "postgres" maintenance database. */
export function adminUrl(serverUrl: string): string {
  const url = new URL(serverUrl);
  url.pathname = '/postgres';
  return url.toString();
}
