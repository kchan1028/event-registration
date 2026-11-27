// The disposable rehearsal database. playwright.rehearsal.config.ts resets it before the server starts.
export const REHEARSAL_DATABASE_URL = process.env.REHEARSAL_DATABASE_URL
  ?? 'postgres://cyclereg:cyclereg@127.0.0.1:5432/cyclereg_phase3_rehearsal_e2e';
