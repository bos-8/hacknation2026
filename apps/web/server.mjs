import { createServer as createHttpsServer } from 'node:https';
import { createServer as createHttpServer } from 'node:http';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import next from 'next';

const origin = new URL(process.env.AUTH_BASE_URL);
const localHttp = origin.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(origin.hostname);
if (origin.protocol !== 'https:' && !localHttp) throw new Error('HTTP is allowed only for a loopback application URL');
const port = Number(process.env.PORT || origin.port || (localHttp ? 80 : 443));
const host = process.env.FORMIQ_BIND || '127.0.0.1';
const certs = path.resolve(import.meta.dirname, '../../infra/local/certs');
const cert = localHttp ? undefined : readFileSync(process.env.WEB_TLS_CERT || path.join(certs, 'localhost.pem'));
const keyPath = process.env.WEB_TLS_KEY || path.join(certs, 'localhost-key.pem');
let key;
try {
  if (!localHttp) key = readFileSync(keyPath);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  throw new Error(`Missing TLS private key at ${keyPath}. Provide the private key matching the server certificate or configure your own local certificate and key.`);
}
const app = next({ dev: process.argv[2] === 'dev', hostname: origin.hostname, port, dir: import.meta.dirname });
const server = localHttp ? createHttpServer() : createHttpsServer({ key, cert });
await app.prepare();
server.on('request', app.getRequestHandler());
server.on('upgrade', app.getUpgradeHandler());
server.listen(port, host, () => console.log('FORMIQ ' + origin.origin));
