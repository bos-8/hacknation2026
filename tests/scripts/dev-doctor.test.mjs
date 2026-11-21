import test from 'node:test';
import assert from 'node:assert/strict';
import { runDoctor } from '../../scripts/dev-doctor.mjs';
import { composeArgs, containerName, serviceRole } from '../../scripts/lib/compose.mjs';

test('doctor collects independent failures, hides private errors and does not execute repair instructions', async () => {
  const calls = [], output = [];
  const results = await runDoctor([
    { name: 'first', run: async () => { calls.push('first'); throw Error('private-password'); }, fix: 'pnpm repair-first' },
    { name: 'second', run: async () => { calls.push('second'); }, fix: 'pnpm repair-second' },
  ], { log: message => output.push(message) });
  assert.deepEqual(calls, ['first', 'second']);
  assert.deepEqual(results, [{ name: 'first', ok: false }, { name: 'second', ok: true }]);
  assert.ok(output[0].includes('pnpm repair-first'));
  assert.ok(!output.join('\n').includes('private-password'));
});

test('container display names depend on environment and role; Compose operations retain the project namespace', () => {
  const env = { ENV_MODE: 'dev', STACK_NAME: 'formiqdev', INSTANCE_INDEX: '0' };
  assert.equal(containerName(env, 'db'), 'formiqdev-db-0');
  assert.equal(containerName({ ...env, ENV_MODE: 'qa', STACK_NAME: 'formiqqa' }, 's3console'), 'formiqqa-s3console-0');
  assert.equal(serviceRole('postgres'), 'db');
  assert.equal(serviceRole('auth'), 'auth');
  const args = composeArgs(process.cwd(), 'dev', env, ['tools']);
  assert.equal(args[args.indexOf('--project-name') + 1], 'formiqdev');
  assert.ok(args.includes('--profile') && args.includes('tools'));
  assert.throws(() => composeArgs(process.cwd(), 'qa', env));
  assert.throws(() => containerName({ ...env, INSTANCE_INDEX: 'invalid' }, 'db'));
  assert.throws(() => containerName(env, 'unknown'));
});
