// Real DEV commands on a disposable project. Never targets the workstation stack.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify, parseEnv } from 'node:util';
import { mkdir, mkdtemp, readFile, writeFile, rm, realpath } from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from '../../scripts/lib/runtime.mjs';
import { composeArgs } from '../../scripts/lib/compose.mjs';
import { initializeEnvironment } from '../../scripts/stack.mjs';
import { DevInfra } from '../../scripts/dev-infra.mjs';

const execute = promisify(execFile);
const parent = await realpath(path.join(ROOT, '.local'));
const root = await mkdtemp(path.join(parent, 'infra-options-'));
const directory = path.join(root, 'infra/local');
const project = `modulonoptionstest${Date.now().toString(36)}dev`;
const docker = async args => (await execute('docker', args, {
  cwd: ROOT, windowsHide: true, timeout: 600000, maxBuffer: 8 * 1024 * 1024,
})).stdout;
let infra;
let prepared = false;
try {
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, '.env.dev.example'), await readFile(path.join(ROOT, 'infra/local/.env.dev.example')));
  await initializeEnvironment(directory, 'dev');
  const env = parseEnv(await readFile(path.join(directory, '.env.dev'), 'utf8'));
  env.STACK_NAME = project;
  env.INSTANCE_INDEX = String(Date.now());
  env.DB_VOLUME_NAME = `${project}-postgres`;
  env.S3_VOLUME_NAME = `${project}-seaweedfs`;
  env.S3CONSOLE_VOLUME_NAME = `${project}-s3console`;
  for (const name of ['DB_PORT', 'S3_PORT', 'S3CONSOLE_PORT']) env[name] = '0';
  // HTTPS target must remain a valid port: randomize only its published port below.
  env.AUTH_LOCAL_PORT = '18445';
  env.AUTH_PUBLIC_URL = env.AUTH_ADMIN_PUBLIC_URL = 'https://localhost:18445';
  env.CERTS_DIR = path.join(ROOT, 'infra/local/certs').replaceAll('\\', '/');
  await writeFile(path.join(directory, '.env.dev'), Object.entries(env).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join('\n'), { mode: 0o600 });
  const args = composeArgs(ROOT, 'dev', env, ['tools']);
  args[args.indexOf('--env-file') + 1] = path.join(directory, '.env.dev');
  const config = JSON.parse(await docker([...args, 'config', '--format', 'json']));
  for (const service of Object.values(config.services)) {
    for (const port of service.ports || []) port.published = '0';
    assert.ok(service.container_name.endsWith(`-${env.INSTANCE_INDEX}`));
  }
  assert.equal(config.name, project);
  assert.notEqual(project, 'modulonpocdev');
  await writeFile(path.join(directory, 'compose.yaml'), JSON.stringify(config), { mode: 0o600 });
  await writeFile(path.join(directory, 'compose.dev.yaml'), '{"services":{}}');
  const messages = [];
  infra = new DevInfra({ root, log: message => {
    messages.push(message);
    // Status and application logs may contain private data; only show our phase markers.
    if (/^\[(info|wait|ok|clean)\]/.test(message)) console.log(message);
  } });
  const volumes = () => docker(['volume', 'ls', '--filter', `label=com.docker.compose.project=${project}`, '--format', '{{.Name}}']);
  const containers = () => docker(['ps', '-a', '--filter', `label=com.docker.compose.project=${project}`, '--format', '{{.Names}}']);
  prepared = true;
  await infra.up();
  assert.equal((await containers()).trim().split(/\r?\n/).length, 5);
  const before = (await volumes()).trim().split(/\r?\n/).sort();
  assert.equal(before.length, 3);
  await infra.status();
  assert.ok(messages.at(-1).includes(`${project}-db-${env.INSTANCE_INDEX}`));
  await infra.logs();
  assert.ok(messages.at(-1).length > 0);
  await infra.down();
  assert.equal((await containers()).trim(), '');
  assert.deepEqual((await volumes()).trim().split(/\r?\n/).sort(), before);
  await infra.up({ build: false });
  await infra.delete();
  assert.equal((await containers()).trim(), '');
  assert.equal((await volumes()).trim(), '');
  // Empty-project deletion must also be safe and idempotent.
  await infra.delete();
  console.log('PASS: build/up, status, logs, down preserving all volumes, up --no-build, delete and repeated delete; isolated project only.');
} catch {
  process.exitCode = 1;
  console.error('FAIL: isolated DEV infrastructure integration; private diagnostics hidden.');
} finally {
  if (prepared) await infra.delete();
  const resolved = await realpath(root);
  assert.equal(path.dirname(resolved), parent);
  assert.ok(path.basename(resolved).startsWith('infra-options-'));
  await rm(resolved, { recursive: true, force: true });
}
