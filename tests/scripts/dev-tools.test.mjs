import test from 'node:test';
import assert from 'node:assert/strict';
import { checkDevTools } from '../../scripts/lib/dev-tools.mjs';

function probe({ docker = true, pnpm = '12.15.0', python = 14 } = {}) {
  const calls = [];
  return { calls, options: { nodeVersion: '26.12.1', platform: 'win32', inherited: { npm_execpath: 'fixture-pnpm.cjs' }, log: () => {},
    execute: async (command, args) => {
      calls.push([command, args]);
      if (args.includes('--version')) return { stdout: pnpm };
      if (command === 'docker') {
        if (!docker) throw Error('private daemon detail');
        return { stdout: args[0] === 'info' ? '"29.9.3"' : '5.0.0' };
      }
      return { stdout: JSON.stringify({ version: [3, command === 'python' ? 15 : python], executable: 'C:/Python314/python.exe' }) };
    },
  } };
}

test('preflight selects installed compatible Python when the default is unsupported', async () => {
  const { options, calls } = probe();
  assert.deepEqual(await checkDevTools(options), { PYWORKER_PYTHON: 'C:/Python314/python.exe' });
  assert.ok(calls.some(([command, args]) => command === 'py' && args.includes('-3.14')));
});

test('preflight respects explicit Python and refuses an unsupported override', async () => {
  const { options, calls } = probe({ python: 15 });
  options.inherited.PYWORKER_PYTHON = 'explicit-python';
  await assert.rejects(checkDevTools(options), /Python 3.12–3.14/);
  assert.equal(calls.filter(([command]) => command === 'explicit-python').length, 1);
  assert.ok(!calls.some(([command]) => command === 'py' || command === 'python'));
});

test('offline engine and wrong package manager fail with actionable redacted errors', async () => {
  const stopped = probe({ docker: false });
  await assert.rejects(checkDevTools(stopped.options), error => error.message.includes('Start Docker') && !error.message.includes('private daemon detail'));
  assert.ok(!stopped.calls.some(([command]) => command === 'python'));
  await assert.rejects(checkDevTools(probe({ pnpm: '11.0.0' }).options), /pnpm 12.15.0 required/);
  await assert.rejects(checkDevTools({ ...probe().options, nodeVersion: '20.19.0' }), /Node.js 22.18/);
});
