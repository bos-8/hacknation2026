import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ROOT, main, readEnvironment } from './lib/runtime.mjs';
import { composeArgs } from './lib/compose.mjs';
import { VolumeBackup } from './lib/volume-backup.mjs';

const execute = promisify(execFile);
main(import.meta.url, async () => {
  const [action, value, ...extra] = process.argv.slice(2);
  if (extra.length || !['create', 'restore'].includes(action) || action === 'create' && !['dev', 'qa'].includes(value || 'dev')
    || action === 'restore' && !value) throw new Error('Usage: backup.mjs create [dev|qa] | restore <backup-directory>');
  const docker = async args => {
    try { return (await execute('docker', args, { windowsHide: true, timeout: 300000, maxBuffer: 1048576 })).stdout; }
    catch { throw new Error('Backup Docker operation failed; private output hidden'); }
  };
  const backup = new VolumeBackup({ root: ROOT, docker });
  if (action === 'restore') { console.log(JSON.stringify(await backup.restore(value), null, 2)); return; }
  const mode = value || 'dev';
  const env = await readEnvironment(ROOT, `infra/local/.env.${mode}`);
  const config = JSON.parse(await docker([...composeArgs(ROOT, mode, env, ['tools']), 'config', '--format', 'json']));
  const volumes = [];
  for (const role of ['postgres-data', 'seaweed-data', 's3console-data']) {
    const volume = config.volumes[role];
    if (!volume?.name || volume.external || volume.driver_opts) throw new Error('Only owned local volumes can be backed up');
    if (role === 's3console-data' && !(await docker(['volume', 'ls', '-q', '--filter', `name=^${volume.name}$`])).trim()) continue;
    volumes.push({ role, name: volume.name });
  }
  const directory = await backup.create({ project: env.STACK_NAME, volumes, image: config.services.db.image });
  console.log(`[ok] Offline backup complete: ${directory}`);
});
