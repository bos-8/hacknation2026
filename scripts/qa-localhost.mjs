import { lookup } from 'node:dns';
import { Agent, Pool, setGlobalDispatcher } from 'undici';

// Browser and Node keep identical OIDC URLs. Only the TCP destination changes inside Compose.
const services = new Map([
  [new URL(process.env.AUTH_BASE_URL).origin, 'web'],
  [new URL(process.env.AUTH_ISSUER).origin, 'auth'],
]);
setGlobalDispatcher(new Agent({
  factory(origin, options) {
    const url = new URL(origin);
    const service = url.hostname === 'localhost' && services.get(url.origin);
    return new Pool(origin, service ? {
      ...options,
      connect: { lookup: (_name, opts, callback) => lookup(service, opts, callback) },
    } : options);
  },
}));
