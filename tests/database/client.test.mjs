import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatabaseClient } from '../../packages/database/dist/index.js';

test('database URL validation never includes supplied credentials', () => {
  for (const connectionString of [
    'private-fixture',
    'https://user:private-fixture@example.invalid/database',
    'postgresql://user:private-fixture@example.invalid/',
  ]) {
    assert.throws(() => createDatabaseClient({ connectionString }), error => {
      assert.equal(error.message, 'A valid PostgreSQL DATABASE_URL with a database name is required');
      assert.doesNotMatch(error.message, /private-fixture/);
      return true;
    });
  }
});

test('connection pool rejects invalid sizes before opening a connection', () => {
  for (const maxConnections of [0, -1, 21, 1.5, NaN]) {
    assert.throws(() => createDatabaseClient({
      connectionString: 'postgresql://fixture:fixture@127.0.0.1:1/fixture', maxConnections,
    }), /pool size must be an integer between 1 and 20/);
  }
});

test('client initialization is lazy and exposes auth, system and role models', async () => {
  const client = createDatabaseClient({
    connectionString: 'postgresql://fixture:fixture@127.0.0.1:1/fixture',
  });
  try {
    for (const model of ['user', 'session', 'account', 'verification', 'system', 'role']) {
      assert.equal(typeof client[model].findUnique, 'function');
    }
  } finally {
    await client.$disconnect();
  }
});
