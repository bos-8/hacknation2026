import { createServer } from 'node:https';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import next from 'next';

const origin = new URL(process.env.AUTH_BASE_URL);
const port = Number(process.env.PORT || origin.port || 443);
const host = process.env.FORMIQ_BIND || '127.0.0.1';
const certs = path.resolve(import.meta.dirname, '../../infra/local/certs');
const cert = readFileSync(process.env.WEB_TLS_CERT || path.join(certs, 'localhost.pem'));
const keyPath = process.env.WEB_TLS_KEY || path.join(certs, 'localhost-key.pem');
let key;
try {
  key = readFileSync(keyPath);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  throw new Error(`Missing TLS private key at ${keyPath}. Provide the private key matching the server certificate or configure your own local certificate and key.`);
}
const app = next({ dev: process.argv[2] === 'dev', hostname: origin.hostname, port, dir: import.meta.dirname });
const server = createServer({ key, cert });
await app.prepare();
server.on('request', app.getRequestHandler());
server.on('upgrade', app.getUpgradeHandler());
server.listen(port, host, () => console.log('FORMIQ ' + origin.origin));
