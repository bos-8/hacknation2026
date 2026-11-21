// Explicit Docker check. Creates and removes only its own disposable project/volumes.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, realpath, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { VolumeBackup } from '../../scripts/lib/volume-backup.mjs';
import { initializeEnvironment } from '../../scripts/stack.mjs';

const root = process.cwd();
const temporary = await mkdtemp(path.join(os.tmpdir(), 'modulon-compose-'));
let project = 'modulonpocsmoke' + Date.now().toString(36);
assert.match(project, /^modulonpocsmoke[a-z0-9]+$/);
const file = path.join(temporary, '.env.dev');
let started = false;
let redactions = [];
let backupDirectory;
let restoredVolumes = [];
let auxiliaryVolume;
async function docker(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let output = '', errors = '';
    child.stdout.on('data', value => output += value);
    child.stderr.on('data', value => { if(errors.length<8192) errors+=value; }); // Do not echo environment/configuration from failed setup.
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve(output) : reject(new Error(`Docker ${args[0]} failed (exit ${code}): ${redactions.reduce((message,value)=>message.replaceAll(value,'[redacted]'),errors)}`)));
  });
}
const compose = (...args) => docker(['compose', '--project-name', project, '--env-file', file,
  '-f', 'infra/local/compose.yaml', '-f', 'infra/local/compose.dev.yaml', ...args]);
try {
  await writeFile(file + '.example', await readFile('infra/local/.env.dev.example', 'utf8'));
  await initializeEnvironment(temporary, 'dev');
  const env = parseEnv(await readFile(file, 'utf8'));
  redactions=Object.entries(env).filter(([key,value])=>/SECRET|PASSWORD|TOKEN|ACCESS_KEY/.test(key)&&value).map(([,value])=>value);
  env.STACK_NAME = project;
  env.INSTANCE_INDEX = String(Date.now());
  env.DB_VOLUME_NAME = project + '-postgres'; env.S3_VOLUME_NAME = project + '-seaweedfs'; env.S3CONSOLE_VOLUME_NAME = project + '-s3console';
  for (const port of ['DB_PORT', 'S3_PORT']) env[port] = '0';
  // HTTPS published and container ports are intentionally the same in this stack.
  // Zero is valid only for a published port, never for its container target.
  const listener = createServer();
  await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
  env.AUTH_LOCAL_PORT = String(listener.address().port);
  env.AUTH_PUBLIC_URL = env.AUTH_ADMIN_PUBLIC_URL = `https://localhost:${env.AUTH_LOCAL_PORT}`;
  await new Promise(resolve => listener.close(resolve));
  env.CERTS_DIR = path.join(root, 'infra/local/certs').replaceAll('\\', '/');
  await writeFile(file, Object.entries(env).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join('\n'), { mode: 0o600 });
  const config = JSON.parse(await compose('config', '--format', 'json'));
  assert.equal(config.name, project);
  assert.deepEqual(Object.keys(config.services).sort(), ['auth', 'db', 's3']);
  for (const service of Object.values(config.services)) assert.ok(service.container_name.startsWith(project + '-') && service.container_name.endsWith('-' + env.INSTANCE_INDEX));
  for (const volume of Object.values(config.volumes)) assert.ok(volume.name.startsWith(project + '-'));
  for (const target of ['/bootstrap/start.sh', '/bootstrap/init-databases.sh', '/bootstrap/init-queue.sh']) {
    const mount = config.services.db.volumes.find(volume => volume.target === target);
    assert.equal(mount?.type, 'bind');
    assert.equal(mount?.read_only, true);
    assert.equal(mount?.bind?.create_host_path, false);
  }
  console.log('Starting isolated three-service stack on fresh volumes; no host bootstrap scripts.');
  started = true;
  await compose('up', '--detach', '--no-build', '--wait', '--wait-timeout', '240');
  const verify = async () => {
    const names = (await docker(['ps', '-a', '--filter', `label=com.docker.compose.project=${project}`, '--format', '{{.Names}}'])).trim().split(/\r?\n/);
    assert.equal(names.length, 3);
    const states = await docker(['inspect', '--format', '{{.State.Health.Status}}', ...names]);
    assert.ok(states.trim().split(/\r?\n/).every(status => status === 'healthy'));
    await compose('exec', '-T', 'auth', 'node', '/opt/formiq/bootstrap/configure.mjs');
    await compose('exec', '-T', 's3', 'node', '/bootstrap/init-bucket.mjs');
    await compose('exec', '-T', 'db', 'sh', '-c', 'PGHOST=127.0.0.1 sh /bootstrap/init-databases.sh');
    await compose('exec', '-T', 'db', 'sh', '-c', 'PGHOST=127.0.0.1 sh /bootstrap/init-queue.sh');
  };
  await verify();
  console.log('Fresh startup and repeated database/realm/bucket bootstrap passed; restarting the same four containers.');
  await compose('restart');
  await compose('up', '--detach', '--no-build', '--wait', '--wait-timeout', '240');
  await verify();
  console.log('PASS: exactly four healthy containers, fresh-volume bootstrap, idempotent setup and restart.');
  if (process.argv.includes('--backup')) {
    const databases=[env.DB_APP_DATABASE_NAME,env.DB_AUTH_DATABASE_NAME,env.DB_QUEUE_DATABASE_NAME];
    const canary='restore-'+Date.now();
    for(const name of databases) {
      assert.match(name,/^[a-z_][a-z0-9_]*$/);
      await compose('exec','-T','db','sh','-c','exec psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$1" -c "$2"','backup-check',name,
        "CREATE TABLE restore_canary(value text); INSERT INTO restore_canary VALUES ('"+canary+"')");
    }
    const require=createRequire(new URL('../../apps/web/package.json',import.meta.url));
    const {S3Client,PutObjectCommand,GetObjectCommand}=require('@aws-sdk/client-s3');
    const key='backup-restore-canary';
    async function storage() {
      const ids=(await docker(['ps','-q','--filter',`label=com.docker.compose.project=${project}`,'--filter','label=com.docker.compose.service=s3'])).trim();
      const port=(await docker(['inspect','--format','{{(index (index .NetworkSettings.Ports "8333/tcp") 0).HostPort}}',ids])).trim();
      return new S3Client({endpoint:`http://127.0.0.1:${port}`,region:env.S3_REGION||'eu-central-1',forcePathStyle:true,maxAttempts:1,credentials:{accessKeyId:env.S3_APP_ACCESS_KEY,secretAccessKey:env.S3_APP_SECRET_KEY}});
    }
    let client=await storage();
    try{await client.send(new PutObjectCommand({Bucket:env.S3_BUCKET,Key:key,Body:canary}));}finally{client.destroy();}
    await compose('stop');
    await docker(['volume','create','--label',`com.docker.compose.project=${project}`,env.S3CONSOLE_VOLUME_NAME]);
    auxiliaryVolume = { name: env.S3CONSOLE_VOLUME_NAME, project };
    const backup=new VolumeBackup({root,docker});
    backupDirectory=await backup.create({project,image:config.services.db.image,volumes:[
      {role:'postgres-data',name:env.DB_VOLUME_NAME},{role:'seaweed-data',name:env.S3_VOLUME_NAME},{role:'s3console-data',name:env.S3CONSOLE_VOLUME_NAME},
    ]});
    const restored=await backup.restore(backupDirectory).catch(error => { restoredVolumes=error.volumesCreated ?? []; throw error; });restoredVolumes=restored.volumes;
    await compose('down','--volumes','--remove-orphans');
    project=restored.project;env.STACK_NAME=project;
    for(const [role,variable] of [['postgres-data','DB_VOLUME_NAME'],['seaweed-data','S3_VOLUME_NAME'],['s3console-data','S3CONSOLE_VOLUME_NAME']])env[variable]=restored.volumes.find(item=>item.role===role).name;
    await writeFile(file,Object.entries(env).map(([key,value])=>`${key}=${JSON.stringify(value)}`).join('\n'),{mode:0o600});
    await compose('up','--detach','--no-build','--wait','--wait-timeout','240');
    await verify();
    for(const name of databases) {
      const value=await compose('exec','-T','db','sh','-c','exec psql -X -At -U "$POSTGRES_USER" -d "$1" -c "SELECT value FROM restore_canary"','backup-check',name);
      assert.equal(value.trim(),canary);
    }
    client=await storage();
    try{const response=await client.send(new GetObjectCommand({Bucket:env.S3_BUCKET,Key:key}));assert.equal(await response.Body.transformToString(),canary);}finally{client.destroy();}
    console.log('PASS cold backup/restore: all three PostgreSQL databases, SeaweedFS object and metadata, healthy restored DB/auth/storage');
  }

} finally {
  if (started) await compose('down', '--volumes', '--remove-orphans');
  if (auxiliaryVolume) {
    const remaining = (await docker(['volume', 'ls', '-q', '--filter', `name=^${auxiliaryVolume.name}$`])).trim();
    if (remaining) {
      assert.equal(remaining, auxiliaryVolume.name);
      assert.equal(auxiliaryVolume.name, `${auxiliaryVolume.project}-s3console`);
      const [volume] = JSON.parse(await docker(['volume', 'inspect', remaining]));
      assert.equal(volume.Labels['com.docker.compose.project'], auxiliaryVolume.project);
      assert.equal((await docker(['ps', '-aq', '--filter', `volume=${remaining}`])).trim(), '');
      await docker(['volume', 'rm', remaining]);
    }
  }
  for(const item of restoredVolumes){assert.match(item.name,/^modulonrestore-[a-f0-9]{16}-(postgres-data|seaweed-data|s3console-data)$/);await docker(['volume','rm','--force',item.name]);}
  if(backupDirectory){assert.equal(path.dirname(backupDirectory),path.join(root,'infra/local/backups'));assert.match(path.basename(backupDirectory),/^backup-[0-9]+-[a-f0-9]{8}$/);await rm(backupDirectory,{recursive:true,force:true});}
  const verified = await realpath(temporary);
  assert.equal(path.dirname(verified).toLowerCase(), (await realpath(os.tmpdir())).toLowerCase());
  assert.ok(path.basename(verified).startsWith('modulon-compose-'));
  await rm(verified, { recursive: true, force: true });
  console.log('Disposable test containers, networks, volumes and private env removed.');
}
