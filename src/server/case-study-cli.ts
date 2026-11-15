import { buildApp } from './app';
import { DEFAULT_DATABASE_URL, ensureLocalDatabase } from './db';

const databaseUrl = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
await ensureLocalDatabase(databaseUrl);
const { app } = buildApp({ databaseUrl });
const args = process.argv.slice(2);

try {
  if (args.includes('--list')) {
    const response = await app.inject({ method: 'GET', url: '/api/demo/case-studies' });
    const body = response.json() as { scenarios: Array<{ key: string; title: string; purpose: string }> };
    for (const scenario of body.scenarios) console.log(`${scenario.key}: ${scenario.title}. ${scenario.purpose}`);
  } else if (args.includes('--reset')) {
    const response = await app.inject({ method: 'DELETE', url: '/api/demo/case-studies' });
    if (response.statusCode !== 200) throw new Error(response.body);
    console.log(`Reset generated case-study data: ${response.body}`);
  } else {
    const at = args.indexOf('--scenario');
    const key = at >= 0 ? args[at + 1] : null;
    if (at >= 0 && !key) throw new Error('Pass a scenario key after --scenario. Use --list to see valid keys.');
    const url = key ? `/api/demo/case-studies/${key}` : '/api/demo/case-studies';
    const response = await app.inject({ method: 'POST', url });
    if (response.statusCode !== 200 && response.statusCode !== 201) throw new Error(response.body);
    console.log(`Case-study data ${response.statusCode === 201 ? 'created' : 'already exists'}: ${response.body}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await app.close();
}
