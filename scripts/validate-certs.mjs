import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { X509Certificate, createPrivateKey } from 'node:crypto';
import { isIP } from 'node:net';
import { parseArgs, parseEnv } from 'node:util';
import { ROOT, main, logStatus } from './lib/runtime.mjs';

export async function validateCertificates({ cert, key, ca, hosts = ['localhost'], ips = ['127.0.0.1'],
  minDays = 0, now = Date.now() }) {
  if (!Number.isFinite(minDays) || minDays < 0) throw new Error('Minimum days must be a non-negative number.');
  const parsed = [];
  for (const [label, file, parse] of [
    ['certificate', cert, (value) => new X509Certificate(value)],
    ['private key', key, createPrivateKey],
    ['CA certificate', ca, (value) => new X509Certificate(value)],
  ]) {
    let data;
    try { data = await readFile(file); } catch { throw new Error(`Cannot read ${label}: ${file}`); }
    try { parsed.push(parse(data)); } catch { throw new Error(`Invalid ${label} format: ${file} (contents hidden).`); }
  }
  const [leaf, privateKey, authority] = parsed;
  for (const [label, certificate, file] of [['Leaf', leaf, cert], ['CA', authority, ca]]) {
    if (now < Date.parse(certificate.validFrom) || now >= Date.parse(certificate.validTo)) {
      throw new Error(`${label} certificate is outside its validity period: ${file}`);
    }
    if (Date.parse(certificate.validTo) - now < minDays * 86400000) {
      throw new Error(`${label} certificate expires in less than ${minDays} days: ${file}`);
    }
  }
  if (leaf.ca) throw new Error(`The HTTPS leaf must not be a CA certificate: ${cert}`);
  if (!leaf.checkPrivateKey(privateKey)) throw new Error(`Private key does not match the leaf certificate: ${key}, certificate: ${cert}`);
  if (!authority.ca || !leaf.checkIssued(authority) || !leaf.verify(authority.publicKey)) {
    throw new Error(`Leaf certificate is not signed directly by the supplied CA: ${cert}, CA: ${ca}`);
  }
  for (const host of hosts) {
    if (!leaf.checkHost(host, { subject: 'never' })) throw new Error(`Certificate SAN does not cover hostname ${host}: ${cert}`);
  }
  for (const ip of ips) {
    if (!isIP(ip)) throw new Error('Invalid IP address requested for certificate validation.');
    if (!leaf.checkIP(ip)) throw new Error(`Certificate SAN does not cover IP ${ip}: ${cert}`);
  }
  return leaf.validTo;
}

main(import.meta.url, async () => {
  const text = await readFile(path.join(ROOT, 'infra/local/.env.dev'), 'utf8').catch(error => {
    if (error.code === 'ENOENT') return '';
    throw error;
  });
  const env = parseEnv(text);
  const certs = path.resolve(ROOT, 'infra/local', env.CERTS_DIR || './certs');
  const { values } = parseArgs({ options: {
    cert: { type: 'string', default: path.join(certs, env.TLS_CERT_PEM || 'localhost.pem') },
    key: { type: 'string', default: path.join(certs, env.TLS_CERT_KEY || 'localhost-key.pem') },
    ca: { type: 'string', default: path.join(certs, env.TLS_CA_PEM || 'rootCA.pem') },
    host: { type: 'string', multiple: true }, ip: { type: 'string', multiple: true },
    'min-days': { type: 'string', default: '0' }, help: { type: 'boolean' },
  } });
  if (values.help) {
    console.log('Usage: pnpm validate:certs [--cert PATH] [--key PATH] [--ca PATH] [--host NAME] [--ip ADDRESS] [--min-days N]\nDefaults follow CERTS_DIR and TLS_* in infra/local/.env.dev, falling back to infra/local/certs/{localhost.pem,localhost-key.pem,rootCA.pem}, localhost and 127.0.0.1. Explicit hosts/IPs replace their defaults. Checks direct local CA signing, not OS/browser trust or revocation.');
    return;
  }
  const expires = await validateCertificates({ cert: path.resolve(ROOT, values.cert), key: path.resolve(ROOT, values.key),
    ca: path.resolve(ROOT, values.ca), hosts: values.host ?? ['localhost'], ips: values.ip ?? ['127.0.0.1'],
    minDays: Number(values['min-days']) });
  logStatus(`[ok] ${values.cert}: dates, private key (${values.key}), direct CA signature (${values.ca}) and requested SANs are valid. Expires: ${expires}`);
});
