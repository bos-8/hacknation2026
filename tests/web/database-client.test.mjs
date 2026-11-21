import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

const state = globalThis.__databaseClientTest = {};
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '@formiq/database') return {
      url: 'data:text/javascript,export function createDatabaseClient() { globalThis.__databaseClientTest.created++; return globalThis.__databaseClientTest.client; }',
      shortCircuit: true,
    };
    return nextResolve(specifier, context);
  },
});

function fixture(t) {
  const previous = { mode: process.env.NODE_ENV, url: process.env.DATABASE_URL, cached: globalThis.formiqDatabase, schema: globalThis.formiqDatabaseSchema };
  t.after(() => {
    if (previous.mode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous.mode;
    if (previous.url === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previous.url;
    if (previous.cached === undefined) delete globalThis.formiqDatabase; else globalThis.formiqDatabase = previous.cached;
    if (previous.schema === undefined) delete globalThis.formiqDatabaseSchema; else globalThis.formiqDatabaseSchema = previous.schema;
  });
  process.env.NODE_ENV = 'development';
  process.env.DATABASE_URL = 'postgresql://fixture:fixture@127.0.0.1:5432/fixture';
  state.created = 0;
  state.client = { product: { findMany() {} }, $disconnect: async () => {} };
}

test('DEV recreates a cached client generated before Product and closes the obsolete pool', async t => {
  fixture(t);
  let closed = 0;
  globalThis.formiqDatabase = { file: {}, $disconnect: async () => { closed++; } };
  const { getDatabase } = await import('../../apps/web/src/server/database.ts?case=stale');
  assert.equal(getDatabase(), state.client);
  assert.equal(getDatabase(), state.client);
  assert.equal(globalThis.formiqDatabase, state.client);
  assert.equal(state.created, 1);
  assert.equal(closed, 1);
});

test('DEV reuses a compatible client instead of recreating its connection pool', async t => {
  fixture(t);
  delete globalThis.formiqDatabase;
  const initial = await import('../../apps/web/src/server/database.ts?case=before-reload');
  assert.equal(initial.getDatabase(), state.client);
  const { getDatabase } = await import('../../apps/web/src/server/database.ts?case=current');
  assert.equal(getDatabase(), state.client);
  assert.equal(state.created, 1);
});

test('production does not reuse the development global client', async t => {
  fixture(t);
  process.env.NODE_ENV = 'production';
  const unrelated = { product: {} };
  globalThis.formiqDatabase = unrelated;
  const { getDatabase } = await import('../../apps/web/src/server/database.ts?case=production');
  assert.equal(getDatabase(), state.client);
  assert.equal(globalThis.formiqDatabase, unrelated);
  assert.equal(state.created, 1);
});
