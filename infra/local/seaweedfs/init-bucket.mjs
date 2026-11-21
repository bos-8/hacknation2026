import { createHash, createHmac } from 'node:crypto';
const env = process.env;
const endpoint = new URL(env.S3_ENDPOINT);
const region = env.S3_REGION || 'eu-central-1';
const hash = (text) => createHash('sha256').update(text).digest('hex');
const hmac = (key, text) => createHmac('sha256', key).update(text).digest();
async function request(method, bucket) {
  const url = new URL(`/${bucket}`, endpoint);
  const date = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const day = date.slice(0, 8);
  const scope = `${day}/${region}/s3/aws4_request`;
  const payload = hash('');
  const headers = `host:${url.host}\nx-amz-content-sha256:${payload}\nx-amz-date:${date}\n`;
  const signed = 'host;x-amz-content-sha256;x-amz-date';
  const canonical = [method, url.pathname, '', headers, signed, payload].join('\n');
  const key = hmac(hmac(hmac(hmac(`AWS4${env.S3_ADMIN_SECRET_KEY}`, day), region), 's3'), 'aws4_request');
  const signature = createHmac('sha256', key).update(`AWS4-HMAC-SHA256\n${date}\n${scope}\n${hash(canonical)}`).digest('hex');
  return fetch(url, { method, signal: AbortSignal.timeout(10000), headers: {
    'x-amz-date': date, 'x-amz-content-sha256': payload,
    Authorization: `AWS4-HMAC-SHA256 Credential=${env.S3_ADMIN_ACCESS_KEY}/${scope}, SignedHeaders=${signed}, Signature=${signature}`,
  } });
}
for (const bucket of [env.S3_BUCKET, env.S3_AVATAR_BUCKET]) {
  if (!bucket) throw new Error('Missing S3 bucket configuration');
  let ready = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      let result = await request('HEAD', bucket);
      if (result.status === 404) {
        const created = await request('PUT', bucket);
        if (![200, 204, 409].includes(created.status)) throw new Error(`CreateBucket HTTP ${created.status}`);
        result = await request('HEAD', bucket);
      }
      if (result.ok) { ready = true; break; }
      if ([401, 403].includes(result.status)) throw new Error('S3 initialization credentials rejected');
    } catch (error) {
      if (error.message === 'S3 initialization credentials rejected') throw error;
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  if (!ready) throw new Error('S3 bucket could not be verified within the startup window');
}
console.log('S3 bucket exists and is accessible, existing objects preserved.');
