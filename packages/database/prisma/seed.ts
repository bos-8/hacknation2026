import { createDatabaseClient } from '../dist/index.js';
import { seedDatabase } from '../dist/seed.js';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for seeding');
const database = createDatabaseClient({ connectionString: process.env.DATABASE_URL });
try {
  const result = await seedDatabase(database, { activateLlmPrompt: process.argv.includes('--activate-llm-prompt') });
  console.log(result.status === 'unchanged'
    ? `[skip] Seed data already exists; ${result.roles.length} roles ready. Existing data preserved.`
    : `[success] Applied seed (system=${result.created.system}, roles=${result.created.roles}, actor=${result.created.systemUser}, configuration=${result.created.configuration}, llmPrompt=${result.created.llmPrompt}). Existing records preserved.`);
  if (result.llmPromptActivated) console.log('[success] Seeded system prompt is active.');
} catch {
  console.error('[error] Database seed failed; connection details and database responses hidden.');
  process.exitCode = 1;
} finally {
  await database.$disconnect();
}
