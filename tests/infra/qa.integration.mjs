import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile, rm, realpath, readdir } from 'node:fs/promises';
import { createServer } from 'node:net';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { Qa } from '../../scripts/qa.mjs';
import { ROOT } from '../../scripts/lib/runtime.mjs';

await mkdir(path.join(ROOT, '.local'), { recursive: true });
const directory = await mkdtemp(path.join(ROOT, '.local/qa-smoke-'));
const project = 'modulonpocqasmoke' + randomBytes(6).toString('hex');
assert.match(project, /^modulonpocqasmoke[a-f0-9]{12}$/);
const file = path.join(directory, '.env.qa');
const qa = new Qa({ file });
const defaults = parseEnv(await readFile(path.join(ROOT, 'infra/local/.env.qa.example'), 'utf8'));
const actual = parseEnv(await readFile(path.join(ROOT, 'infra/local/.env.qa'), 'utf8'));
const listeners = [];
let context, created = false;
try {
  const settings = { ...defaults, STACK_NAME: project, INSTANCE_INDEX: String(Date.now()), DB_VOLUME_NAME: project + '-postgres', S3_VOLUME_NAME: project + '-seaweedfs', S3CONSOLE_VOLUME_NAME: project + '-s3console' };
  for (const key of ['WEB_IMAGE', 'QUEUE_IMAGE', 'PYWORKER_IMAGE', 'MAINTENANCE_IMAGE', 'AUTH_IMAGE', 'S3_IMAGE', 'DB_IMAGE']) settings[key] = actual[key];
  for (const key of ['DB_PORT', 'S3_PORT', 'WEB_HTTPS_PORT', 'AUTH_LOCAL_PORT']) {
    const server = createServer();
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    listeners.push(server);
    settings[key] = String(server.address().port);
  }
  for (const [key, host] of [['APP_PUBLIC_URL', 'APP_HOST'], ['AUTH_PUBLIC_URL', 'AUTH_HOST'], ['AUTH_ADMIN_PUBLIC_URL', 'AUTH_ADMIN_HOST']]) settings[key] = `https://${settings[host]}:${settings[key === 'APP_PUBLIC_URL' ? 'WEB_HTTPS_PORT' : 'AUTH_LOCAL_PORT']}`;
  await writeFile(file, Object.entries(settings).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join('\n') + '\n', { mode: 0o600 });
  await qa.init();
  assert.deepEqual((await readdir(directory)).sort(), ['.env.qa'], 'QA must use only one private env without generated service files');
  for (const server of listeners) await new Promise(resolve => server.close(resolve));
  listeners.length = 0;
  context = await qa.context();
  for (const volume of Object.values(context.config.volumes)) assert.ok(volume.name.startsWith(project + '-'));
  const devBefore = await qa.execute(['ps', '--all', '--filter', 'label=com.docker.compose.project=formiqdev', '--format', '{{.ID}}:{{.Names}}'], process.env);
  created = true;
  console.log('Starting disposable QA with independent credentials, volumes and free ports; DEV remains running.');
  await qa.deploy();
  await qa.start();
  await qa.stream([...context.args, 'exec', '-T', 'web', 'node', '-e', `
    (async()=>{
      const page = await fetch(process.env.AUTH_BASE_URL + '/pl');
      if (!page.ok || !(await page.text()).includes('<html')) throw Error('Web page unavailable');
      const response = await fetch(process.env.AUTH_ISSUER + '/.well-known/openid-configuration');
      if (!response.ok || (await response.json()).issuer !== process.env.AUTH_ISSUER) throw Error('OIDC issuer mismatch');
      console.log('PASS QA HTTPS Web and canonical Keycloak discovery through internal DNS/TLS');
    })().catch(()=>{ console.error('QA Web/OIDC check failed; details hidden'); process.exitCode=1; });
  `], context.runtime);
  await qa.stream([...context.args, 'exec', '-T', 'queue', 'node', '--input-type=module', '-e', `
    import {createDatabaseClient} from './packages/database/dist/index.js';
    import {JobQueue} from './packages/queue/dist/index.js';
    import {createPythonExecutor} from './scripts/lib/pyworker-client.mjs';
    const database=createDatabaseClient({connectionString:process.env.DATABASE_URL,maxConnections:1});
    const queue=new JobQueue(process.env.QUEUE_DATABASE_URL);
    try {
      const actor=await database.user.findUniqueOrThrow({where:{systemKey:'SYSTEM'}});
      const id=await queue.enqueueDiagnostic(0,actor.uuid,'python');
      let complete=false;
      const deadline=Date.now()+25000;
      while(Date.now()<deadline){
        const job=(await queue.list({page:1,limit:1,search:id})).jobs[0];
        if(job?.state==='completed'){complete=true;break;}
        await new Promise(resolve=>setTimeout(resolve,250));
      }
      if(!complete)throw Error('Diagnostic did not complete');
      await createPythonExecutor(process.env)({id,attempt:0});
      let denied=false;
      try{await createPythonExecutor({...process.env,PYWORKER_API_TOKEN:'x'.repeat(32)})({id,attempt:0});}
      catch(error){denied=error.message.includes('401');}
      if(!denied)throw Error('Invalid task token accepted');
      console.log('PASS QA durable PostgreSQL -> queue -> Python task and rejected authentication');
    } catch { console.error('QA queue/Python integration failed; details hidden'); process.exitCode=1; }
    finally {await queue.stop(); await database.$disconnect();}
  `], context.runtime);
  const privateValues = Object.entries(parseEnv(await readFile(file, 'utf8'))).filter(([key, value]) => /PASSWORD|SECRET|TOKEN|ACCESS_KEY/.test(key) && value.length >= 16).map(([, value]) => value);
  for (const key of ['WEB_IMAGE', 'QUEUE_IMAGE', 'PYWORKER_IMAGE', 'MAINTENANCE_IMAGE']) {
    const metadata = await qa.execute(['image', 'inspect', settings[key]], process.env);
    assert.ok(!privateValues.some(value => metadata.includes(value)), 'Private runtime value found in image metadata');
  }
  const devAfter = await qa.execute(['ps', '--all', '--filter', 'label=com.docker.compose.project=formiqdev', '--format', '{{.ID}}:{{.Names}}'], process.env);
  assert.equal(devAfter, devBefore, 'DEV container identities must remain unchanged');
  console.log('PASS separate build/deploy/start, seven healthy QA services, runtime secret separation and unchanged DEV containers.');
} finally {
  for (const server of listeners) await new Promise(resolve => server.close(resolve));
  if (created && context) {
    const current = parseEnv(await readFile(file, 'utf8'));
    assert.equal(current.STACK_NAME, project);
    for (const volume of Object.values(context.config.volumes)) assert.ok(volume.name.startsWith(project + '-'));
    await qa.stream([...context.args, 'down', '--volumes', '--remove-orphans'], context.runtime);
  }
  const resolved = await realpath(directory);
  assert.equal(path.dirname(resolved).toLowerCase(), path.join(ROOT, '.local').toLowerCase());
  assert.ok(path.basename(resolved).startsWith('qa-smoke-'));
  await rm(resolved, { recursive: true, force: true });
  console.log('Disposable QA containers, volumes and private fixture files removed.');
}
