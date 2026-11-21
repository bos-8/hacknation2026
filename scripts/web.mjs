import { spawn } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { ROOT, main } from './lib/runtime.mjs';

export async function webEnvironment(root = ROOT, values = process.env) {
  const cwd = path.join(root, 'apps/web');
  let local = {};
  try { local = parseEnv(await readFile(path.join(cwd, '.env'), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const env = { ...local, ...values };
  env.AUTH_BASE_URL ||= 'https://localhost:3000';
  const origin = new URL(env.AUTH_BASE_URL);
  if (origin.protocol === 'https:' && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)) {
    let infra = {};
    try { infra = parseEnv(await readFile(path.join(root, 'infra/local/.env.dev'), 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const directory = path.resolve(root, 'infra/local', env.CERTS_DIR || infra.CERTS_DIR || './certs');
    env.NODE_EXTRA_CA_CERTS ||= path.resolve(directory, env.TLS_CA_PEM || infra.TLS_CA_PEM || 'rootCA.pem');
    env.WEB_TLS_CERT ||= path.resolve(directory, env.TLS_CERT_PEM || infra.TLS_CERT_PEM || 'localhost.pem');
    env.WEB_TLS_KEY ||= path.resolve(directory, env.TLS_CERT_KEY || infra.TLS_CERT_KEY || 'localhost-key.pem');
    if (!values.NODE_EXTRA_CA_CERTS) await access(env.NODE_EXTRA_CA_CERTS);
  }
  return env;
}

export async function startWeb() {
  const action = process.argv[2];
  if (!['dev', 'start'].includes(action)) throw new Error('Usage: node scripts/web.mjs dev|start');
  const cwd = path.join(ROOT, 'apps/web');
  const env = await webEnvironment();
  const child = spawn(process.execPath, [path.join(cwd, 'server.mjs'), action, ...process.argv.slice(3)], {
    cwd, env, stdio: 'inherit', windowsHide: true,
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => child.kill(signal));
  child.once('error', () => { process.exitCode = 1; });
  child.once('exit', (code) => { process.exitCode = code ?? 1; });
}

main(import.meta.url, startWeb);
