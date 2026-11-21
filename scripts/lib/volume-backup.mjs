import { randomBytes, createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { safePath } from './runtime.mjs';

export async function checksum(file) {
  const hash = createHash('sha256');
  for await (const bytes of createReadStream(file)) hash.update(bytes);
  return hash.digest('hex');
}

/** Offline physical backup: all PostgreSQL databases and complete SeaweedFS metadata/data. */
export class VolumeBackup {
  constructor({ root, docker }) { this.root = root; this.docker = docker; }
  async assertStopped(volumes) {
    for (const name of volumes) {
      const running = await this.docker(['ps', '-q', '--filter', `volume=${name}`]);
      if (running.trim()) throw new Error('Stop every container using the backup volumes first');
    }
  }
  helper(image, directory, volume, file, restore = false) {
    return this.docker(['run', '--rm', '--pull', 'never', '--network', 'none', '--read-only',
      '--cap-drop', 'ALL', '--cap-add', 'CHOWN', '--cap-add', 'DAC_OVERRIDE', '--cap-add', 'FOWNER',
      '--security-opt', 'no-new-privileges:true', '--user', '0',
      '--mount', `type=volume,src=${volume},dst=/data${restore ? '' : ',readonly'}`,
      '--mount', `type=bind,src=${directory},dst=/backup${restore ? ',readonly' : ''}`,
      '--entrypoint', 'tar', image,
      ...(restore ? ['-xpf', `/backup/${file}`, '-C', '/data'] : ['-cpf', `/backup/${file}`, '-C', '/data', '.'])]);
  }
  async create({ project, volumes, image }) {
    const roles = volumes.map(volume => volume.role);
    if (!/^[a-z0-9][a-z0-9_-]{0,62}$/.test(project) || volumes.length < 2 || volumes.length > 3
      || new Set(roles).size !== volumes.length || !roles.includes('postgres-data') || !roles.includes('seaweed-data')
      || roles.some(role => !['postgres-data', 'seaweed-data', 's3console-data'].includes(role))) {
      throw new Error('Expected owned PostgreSQL/storage volumes and optional console state');
    }
    for (const volume of volumes) {
      const [actual] = JSON.parse(await this.docker(['volume', 'inspect', volume.name]));
      if (actual?.Labels?.['com.docker.compose.project'] !== project || actual.Driver !== 'local'
        || actual.Options && Object.keys(actual.Options).length) throw new Error('Backup volume ownership or driver mismatch');
    }
    await this.assertStopped(volumes.map(volume => volume.name));
    const id = `backup-${Date.now()}-${randomBytes(4).toString('hex')}`;
    const directory = path.join(this.root, 'infra/local/backups', id);
    await safePath(this.root, directory); await mkdir(directory, { recursive: true, mode: 0o700 });
    // Pin the exact existing image ID. No network pull or tag drift during backup/restore.
    const [inspected] = JSON.parse(await this.docker(['image', 'inspect', image]));
    const imageId = inspected.Id;
    if (!/^sha256:[a-f0-9]{64}$/.test(imageId || '')) throw new Error('Invalid backup helper image');
    const entries = [];
    for (const volume of volumes) {
      if (!['postgres-data', 'seaweed-data', 's3console-data'].includes(volume.role)) throw new Error('Unexpected backup volume role');
      const file = `${volume.role}.tar`;
      await this.helper(imageId, directory, volume.name, file);
      entries.push({ ...volume, file, sha256: await checksum(path.join(directory, file)) });
    }
    await this.assertStopped(volumes.map(volume => volume.name));
    const manifest = { schema: 1, id, project, image: imageId, createdAt: new Date().toISOString(), volumes: entries };
    await writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    return directory;
  }
  async restore(directory) {
    directory = path.resolve(this.root, directory); await safePath(this.root, directory);
    await safePath(this.root, path.join(directory, 'manifest.json'));
    const manifest = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'));
    const roles = ['postgres-data', 'seaweed-data', 's3console-data'];
    if (manifest.schema !== 1 || !/^sha256:[a-f0-9]{64}$/.test(manifest.image || '') || !Array.isArray(manifest.volumes)
      || manifest.volumes.length < 2 || manifest.volumes.length > 3
      || new Set(manifest.volumes.map(item => item.role)).size !== manifest.volumes.length
      || !manifest.volumes.some(item => item.role === 'postgres-data')
      || !manifest.volumes.some(item => item.role === 'seaweed-data')) throw new Error('Invalid backup manifest');
    for (const item of manifest.volumes) {
      if (typeof item.file !== 'string' || path.basename(item.file) !== item.file) throw new Error('Invalid backup archive path');
      await safePath(this.root, path.join(directory, item.file));
      if (!roles.includes(item.role) || item.file !== `${item.role}.tar`
        || !/^[a-f0-9]{64}$/.test(item.sha256 || '')
        || await checksum(path.join(directory, item.file)) !== item.sha256) throw new Error('Backup archive integrity check failed');
    }
    const project = `modulonrestore-${randomBytes(8).toString('hex')}`;
    const volumes = [];
    try { for (const item of manifest.volumes) {
      const name = `${project}-${item.role}`;
      const existing = await this.docker(['volume', 'ls', '-q', '--filter', `name=^${name}$`]);
      if (existing.trim()) throw new Error('Restore target already exists');
      await this.docker(['volume', 'create', '--label', `org.modulon.restore=${project}`, name]);
      volumes.push({ role: item.role, name });
      // New random names only. Never extract into DEV/QA or an existing target.
      const consumers = await this.docker(['ps', '-aq', '--filter', `volume=${name}`]);
      if (consumers.trim()) throw new Error('Fresh restore target unexpectedly has consumers');
      await this.helper(manifest.image, directory, name, item.file, true);
    } } catch {
      throw Object.assign(new Error(`Restore failed. Fresh targets retained for inspection: org.modulon.restore=${project}`), { volumesCreated: volumes });
    }
    return { project, volumes, source: directory, validation: 'pending: start isolated stack and run acceptance checks' };
  }
}
