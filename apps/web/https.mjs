import { createServer } from 'node:https';
import { readFileSync } from 'node:fs';
import next from 'next';

const origin = new URL(process.env.AUTH_BASE_URL);
const port = Number(process.env.PORT || origin.port || 443);
const host = process.env.FORMIQ_BIND || '127.0.0.1';
const app = next({ dev: process.argv[2] === 'dev', hostname: origin.hostname, port, dir: import.meta.dirname });
await app.prepare();
const server = createServer({
  key: readFileSync(process.env.WEB_TLS_KEY || '/run/tls/localhost-key.pem'),
  cert: readFileSync(process.env.WEB_TLS_CERT || '/run/tls/localhost.pem'),
}, app.getRequestHandler());
server.on('upgrade', app.getUpgradeHandler());
server.listen(port, host, () => console.log('FORMIQ ' + origin.origin));
