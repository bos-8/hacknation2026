import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp, mkdir, writeFile, readFile, rm, access, symlink, realpath, cp } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';
import { devWorkflow, cleanComponent } from '../../scripts/dev.mjs';
import { checkAuthSecret } from '../../scripts/check-dev-auth.mjs';
import { ownDev, stopDev, controlAddress } from '../../scripts/lib/dev-process.mjs';

async function fixture(t) {
  const parent = await realpath(tmpdir());
  const root = await mkdtemp(path.join(parent, 'modulon-lifecycle-'));
  t.after(async () => {
    assert.equal(path.dirname(await realpath(root)), parent);
    assert.ok(path.basename(root).startsWith('modulon-lifecycle-'));
    await rm(root, { recursive: true, force: true });
  });
  return root;
}

function workflow(fail) {
  const calls = [];
  return { calls, options: {
    checkStopped: async () => { calls.push('ports'); if (fail === 'ports') throw Error('occupied'); },
    run: async (args, env) => { const command = args.join(' '); calls.push(command); if (command === fail) throw Error('fixture failure'); if (command === 'run pyworker:setup') assert.deepEqual(env, { PYWORKER_PYTHON: 'fixture-python' }); },
    cleanAll: async () => calls.push('clean-all'), cleanPart: async name => calls.push(`clean-${name}`),
    pythonBase: async () => ({ PYWORKER_PYTHON: 'fixture-python' }),
    checkTools: async () => { calls.push('tools'); if (fail === 'tools') throw Error('Docker unavailable'); return { PYWORKER_PYTHON: 'fixture-python' }; },
    log: () => {},
  } };
}

test('one automatic start checks tools/config before installing, then prepares Python, Compose and application', async () => {
  const { calls, options } = workflow();
  options.run = async args => calls.push(args.join(' '));
  await devWorkflow('start', undefined, options);
  assert.deepEqual(calls, ['tools', 'ports', 'run validate:dev', 'run validate:certs',
    'install --frozen-lockfile --prefer-offline', 'run check:dev-auth', 'run pyworker:prepare',
    'run dev:infra:up', 'run dev:prepare:application', 'run dev:services']);
  for (const failure of ['tools', 'ports', 'run validate:dev', 'run validate:certs', 'install --frozen-lockfile --prefer-offline',
    'run check:dev-auth', 'run pyworker:prepare', 'run dev:infra:up', 'run dev:prepare:application']) {
    const failing = workflow(failure);
    failing.options.run = async args => { const command = args.join(' '); failing.calls.push(command); if (command === failure) throw Error('fixture failure'); };
    await assert.rejects(devWorkflow('start', undefined, failing.options));
    assert.ok(!failing.calls.includes('run dev:services'));
    if (failure === 'tools') assert.deepEqual(failing.calls, ['tools']);
    if (failure === 'run validate:certs') assert.ok(!failing.calls.some(value => value.startsWith('install')));
  }
});

test('legacy cold/warm aliases and restart share the automatic cached-build workflow', async () => {
  for (const action of ['start', 'cold', 'warm', 'restart']) {
    const { calls, options } = workflow();
    await devWorkflow(action, undefined, options);
    assert.ok(calls.includes('install --frozen-lockfile --prefer-offline'));
    assert.ok(calls.includes('run pyworker:prepare'));
    assert.ok(calls.includes('run dev:infra:up'));
    assert.equal(calls.includes('run dev:infra:down'), action === 'restart');
    assert.ok(!calls.some(item => item.startsWith('clean-')));
  }
});

test('automatic workflow loads and reaches install from a fresh checkout with no node_modules', async t => {
  const root = await fixture(t);
  await cp(path.resolve('scripts'), path.join(root, 'scripts'), { recursive: true });
  await assert.rejects(access(path.join(root, 'node_modules')));
  const { devWorkflow: freshWorkflow } = await import(pathToFileURL(path.join(root, 'scripts/dev.mjs')).href);
  const { calls, options } = workflow();
  await freshWorkflow('start', undefined, { ...options, root });
  assert.ok(calls.includes('install --frozen-lockfile --prefer-offline'));
  assert.equal(calls.at(-1), 'run dev:services');
  const scripts = JSON.parse(await readFile('package.json', 'utf8')).scripts;
  assert.equal(scripts.dev, 'node scripts/dev.mjs');
  assert.ok(scripts['dev:prepare:application'].split(' && ').includes('pnpm dev:seed:users'));
  assert.equal(scripts['dev:start:cold'], 'pnpm dev');
  assert.equal(scripts['dev:start:warm'], 'pnpm dev');
});

test('full rebuild checks auth before cleaning, reinstalls JS/Python and starts the complete pipeline', async () => {
  const { calls, options } = workflow();
  await devWorkflow('rebuild', undefined, options);
  assert.ok(calls.indexOf('run check:dev-auth') < calls.indexOf('clean-all'));
  assert.ok(calls.includes('clean-pyworker'));
  assert.equal(calls.filter(item => item === 'install --frozen-lockfile').length, 2);
  assert.equal(calls.at(-1), 'run dev:services');
  const failing = workflow('run check:dev-auth');
  await assert.rejects(devWorkflow('rebuild', undefined, failing.options));
  assert.ok(!failing.calls.some(item => item.startsWith('clean-') || item === 'run dev:infra:down'));
});

test('component rebuilds never run migrations, seeds, a production Web build or the full service group', async () => {
  for (const component of ['web', 'pyworker', 'prisma', 'queue', 'monitoring', 'docker']) {
    const { calls, options } = workflow();
    await devWorkflow('rebuild', component, options);
    assert.ok(!calls.includes('clean-all'));
    assert.ok(!calls.some(item => /dev:run|db:deploy|dev:migrate|dev:seed|build:web/.test(item)));
    assert.equal(calls.includes(`clean-${component}`), component !== 'docker');
    if (component === 'prisma') assert.equal(calls.at(-1), 'run build:database');
    if (component === 'docker') assert.deepEqual(calls.slice(-3), ['run check:docker', 'run dev:infra:down', 'run dev:infra:up']);
  }
  const partial = workflow('ports');
  await assert.rejects(devWorkflow('rebuild', 'web', partial.options));
  assert.deepEqual(partial.calls, ['ports']);
});

test('clean and stop preserve Python and dependencies respectively; unknown actions cannot mutate anything', async () => {
  for (const [action, expected] of [['clean', ['ports', 'clean-all']], ['stop', ['ports', 'run dev:infra:down']]]) {
    const { calls, options } = workflow();
    await devWorkflow(action, undefined, options);
    assert.deepEqual(calls, expected);
  }
  for (const [action, component] of [['rebuild', '../web'], ['warm', 'web'], ['destroy', undefined]]) {
    const { calls, options } = workflow();
    await assert.rejects(devWorkflow(action, component, options));
    assert.deepEqual(calls, []);
  }
});

test('component cleanup removes only generated paths and refuses linked targets', async t => {
  const root = await fixture(t);
  for (const name of ['.venv', '.cache', '.ruff_cache', 'src', 'tests']) await mkdir(path.join(root, 'apps/pyworker', name), { recursive: true });
  for (const name of ['.env', 'requirements.lock', 'src/task.py']) await writeFile(path.join(root, 'apps/pyworker', name), 'preserve');
  await cleanComponent(root, 'pyworker');
  for (const name of ['.env', 'requirements.lock', 'src/task.py']) assert.equal(await readFile(path.join(root, 'apps/pyworker', name), 'utf8'), 'preserve');
  await assert.rejects(access(path.join(root, 'apps/pyworker/.venv')), { code: 'ENOENT' });
  await mkdir(path.join(root, 'outside'));
  await writeFile(path.join(root, 'outside/keep'), 'preserve');
  await symlink(path.join(root, 'outside'), path.join(root, 'apps/pyworker/.venv'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(cleanComponent(root, 'pyworker'), /linked path/);
  assert.equal(await readFile(path.join(root, 'outside/keep'), 'utf8'), 'preserve');
});

test('auth preflight rejects short values without printing their contents', () => {
  for (const AUTH_SECRET of [undefined, 'short-private', ' '.repeat(40)]) {
    assert.throws(() => checkAuthSecret({ AUTH_SECRET }), error => error.message.includes('AUTH_SECRET') && !error.message.includes('short-private'));
  }
  assert.doesNotThrow(() => checkAuthSecret({ AUTH_SECRET: 'fixture'.repeat(8) }));
});

test('supervisor isolates workspaces, refuses concurrent ownership and acknowledges only after shutdown', { timeout: 10000 }, async t => {
  const root = await fixture(t);
  assert.notEqual(controlAddress(root), controlAddress(root + '-other'));
  assert.equal(await stopDev(root), false);
  let release;
  const ready = new Promise(resolve => { release = resolve; });
  let completed = false;
  const running = ownDev(root, async signal => {
    release();
    await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }));
    completed = true;
  });
  await ready;
  await assert.rejects(ownDev(root, async () => {}), /already running/);
  assert.equal(await stopDev(root), true);
  assert.equal(completed, true);
  await running;
  await ownDev(root, async () => {});
});

test('stop terminates the owned fixture process tree while an unrelated listener survives', { timeout: 20000 }, async t => {
  const root = await fixture(t);
  const unrelated = net.createServer(socket => socket.end());
  await new Promise(resolve => unrelated.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => unrelated.close(resolve)));
  const manager = pathToFileURL(path.resolve('scripts/lib/dev-process.mjs')).href;
  await writeFile(path.join(root, 'pnpm.mjs'), `import {spawn} from 'node:child_process';
    const child=spawn(process.execPath,['-e',${JSON.stringify("const net=require('node:net'),fs=require('node:fs');const server=net.createServer();server.listen(0,'127.0.0.1',()=>fs.writeFileSync('listener.json',JSON.stringify({port:server.address().port,pid:process.pid})));setInterval(()=>{},1000);")}],{stdio:'inherit',windowsHide:true});setInterval(()=>{},1000);`);
  await writeFile(path.join(root, 'driver.mjs'), `import {ownDev,runPnpm} from ${JSON.stringify(manager)};await ownDev(process.cwd(),signal=>runPnpm(process.cwd(),['run','fixture'],signal));`);
  const child = spawn(process.execPath, ['driver.mjs'], { cwd: root, windowsHide: true, stdio: 'ignore', env: { ...process.env, npm_execpath: path.join(root, 'pnpm.mjs') } });
  const exited = once(child, 'exit');
  t.after(async () => { if (child.exitCode === null && !child.signalCode) { await stopDev(root); await exited; } });
  let listener;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { listener = JSON.parse(await readFile(path.join(root, 'listener.json'), 'utf8')); break; } catch { await new Promise(resolve => setTimeout(resolve, 50)); }
  }
  assert.ok(listener, 'Fixture descendant did not start');
  assert.equal(await stopDev(root), true);
  assert.deepEqual(await exited, [0, null]);
  assert.throws(() => process.kill(listener.pid, 0), { code: 'ESRCH' });
  assert.equal(unrelated.listening, true);
});
