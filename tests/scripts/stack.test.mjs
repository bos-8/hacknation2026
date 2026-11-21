import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { initializeEnvironment } from '../../scripts/stack.mjs';

test('stack initialization generates independent credentials and preserves existing environments', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'modulon-stack-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const template = '# ===[DATABASE]===\nDB_ADMIN_PASSWORD=SECRET_CHANGE_ME # <<< [!]\nDB_APP_PASSWORD=CHANGE_ME\nDB_PORT=5432\n';
  for (const mode of ['dev', 'qa']) {
    await writeFile(path.join(directory, `.env.${mode}.example`), template);
    assert.equal(await initializeEnvironment(directory, mode), true);
  }
  const original = await readFile(path.join(directory, '.env.dev'), 'utf8');
  assert.ok(original.includes(' # <<< [!]'));
  const dev = parseEnv(original);
  const qa = parseEnv(await readFile(path.join(directory, '.env.qa'), 'utf8'));
  assert.match(dev.DB_ADMIN_PASSWORD, /^[a-f0-9]{64}$/);
  assert.notEqual(dev.DB_ADMIN_PASSWORD, dev.DB_APP_PASSWORD);
  assert.notEqual(dev.DB_APP_PASSWORD, qa.DB_APP_PASSWORD);
  assert.equal(dev.DB_PORT, '5432');
  assert.equal(await initializeEnvironment(directory, 'dev'), false);
  assert.equal(await readFile(path.join(directory, '.env.dev'), 'utf8'), original);
  await assert.rejects(initializeEnvironment(directory, '../prod'), /Mode must/);
});

test('shipped env templates generate complete role-based configuration and random annotated secrets', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'modulon-templates-'));
  t.after(async () => {
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith('modulon-templates-'));
    await rm(directory, { recursive: true, force: true });
  });
  for (const mode of ['dev', 'qa']) {
    const template = await readFile(`infra/local/.env.${mode}.example`, 'utf8');
    await writeFile(path.join(directory, `.env.${mode}.example`), template);
    await initializeEnvironment(directory, mode);
    const text = await readFile(path.join(directory, `.env.${mode}`), 'utf8');
    const source = parseEnv(template);
    const generated = parseEnv(text);
    assert.deepEqual(Object.keys(generated), Object.keys(source));
    for (const [key, value] of Object.entries(source)) {
      if (['SECRET_CHANGE_ME', 'CHANGE_ME'].includes(value)) assert.match(generated[key], /^[a-f0-9]{64}$/);
      else assert.equal(generated[key], value, key);
    }
    assert.equal(generated.ENV_MODE, mode);
    const fileHeader = text.split(/\r?\n/).find(line => line.startsWith('# File:'));
    if (fileHeader) assert.equal(fileHeader.replace(/^# File:\s*/, ''), `./infra/local/.env.${mode}`);
    assert.ok(!text.includes('CHANGE_ME # <<< [!]'));
  }
});
