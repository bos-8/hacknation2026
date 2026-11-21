import { createServer } from 'node:http';
import { randomUUID, timingSafeEqual } from 'node:crypto';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Internal producer/status API. Node remains the sole owner of pg-boss writes. */
export async function startQueueBridge({ queue, systemActor, reportOcrProgress, env = process.env }) {
  const privateProgress = env.PYWORKER_PROGRESS_NETWORK === 'private';
  const progressOnly = privateProgress || Boolean(reportOcrProgress && env.PYWORKER_API_TOKEN && !env.PYWORKER_QUEUE_BRIDGE_PORT && !env.PYWORKER_QUEUE_TOKEN);
  const port = progressOnly ? '8011' : env.PYWORKER_QUEUE_BRIDGE_PORT;
  const token = progressOnly ? env.PYWORKER_API_TOKEN : env.PYWORKER_QUEUE_TOKEN;
  if (!port && !token) return undefined;
  if (!/^\d{4,5}$/.test(port || '') || Number(port) < 1024 || Number(port) > 65535
    || !/^[A-Za-z0-9_-]{32,512}$/.test(token || '') || token.includes('CHANGE_ME') || /^([A-Za-z]{4}secret)\1{3}$/.test(token)) {
    throw new Error('Configure PYWORKER_QUEUE_BRIDGE_PORT and PYWORKER_QUEUE_TOKEN together');
  }
  const expected = Buffer.from(`Bearer ${token}`);
  let active = 0;
  const server = createServer(async (request, response) => {
    const requestId = randomUUID();
    const send = (status, body) => {
      if (response.destroyed || response.writableEnded) return;
      response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Request-ID': requestId });
      response.end(JSON.stringify(body));
    };
    const supplied = Buffer.from(request.headers.authorization || '');
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      send(401, { error: 'unauthorized' }); return;
    }
    if (active >= 8) { send(503, { error: 'busy' }); return; }
    active++;
    try {
      if (!progressOnly && request.method === 'GET' && request.url === '/health/ready') {
        const healthy = await queue.workerHealthy();
        send(healthy ? 200 : 503, { status: healthy ? 'ok' : 'error' }); return;
      }
      const progress = /^\/v1\/queue\/documents\/([0-9a-f-]{36})\/progress$/i.exec(request.url || '');
      if (request.method === 'POST' && (!progressOnly && request.url === '/v1/queue/diagnostics' || progress && reportOcrProgress)) {
        if (request.headers['content-type']?.split(';')[0].trim() !== 'application/json') {
          send(415, { error: 'unsupported_content_type' }); return;
        }
        const chunks = []; let size = 0;
        // Bound the complete body read, including clients sending tiny chunks.
        const deadline = setTimeout(() => request.destroy(), 3000);
        try {
          for await (const chunk of request) {
            size += chunk.length;
            if (size > 1024) { send(413, { error: 'body_too_large' }); return; }
            chunks.push(chunk);
          }
        } finally { clearTimeout(deadline); }
        let body;
        try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
        catch { send(422, { error: 'invalid_request' }); return; }
        if (progress) {
          if (!uuid.test(progress[1]) || !Number.isInteger(body?.percent) || body.percent < 0 || body.percent > 99 || Object.keys(body).length !== 1) {
            send(422, { error: 'invalid_progress' }); return;
          }
          await reportOcrProgress(progress[1], body.percent);
          send(200, { status: 'ok' }); return;
        }
        if (!body || Array.isArray(body) || typeof body !== 'object'
          || Object.keys(body).some(key => !['executor', 'failures'].includes(key))
          || !['node', 'python'].includes(body.executor)
          || !Number.isInteger(body.failures) || body.failures < 0 || body.failures > 4) {
          send(422, { error: 'invalid_request' }); return;
        }
        // Clients cannot impersonate a user by providing an actor UUID.
        const actor = await systemActor();
        if (!uuid.test(actor || '')) throw new Error('SYSTEM actor unavailable');
        const id = await queue.enqueueDiagnostic(body.failures, actor, body.executor);
        send(201, { id }); return;
      }
      const match = /^\/v1\/queue\/jobs\/([0-9a-f-]{36})$/i.exec(request.url || '');
      if (!progressOnly && request.method === 'GET' && match && uuid.test(match[1])) {
        const id = match[1].toLowerCase();
        const page = await queue.list({ page: 1, limit: 1, search: id });
        const job = page.jobs.find(item => item.id === id);
        if (!job) { send(404, { error: 'not_found' }); return; }
        send(200, { id: job.id, state: job.state, executor: job.executor, attempt: job.retryCount }); return;
      }
      send(404, { error: 'not_found' });
    } catch {
      console.error(`[queue-bridge] Operation failed; request_id=${requestId}`);
      send(503, { error: 'queue_unavailable', request_id: requestId });
    } finally { active--; }
  });
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  server.keepAliveTimeout = 1000;
  server.maxHeadersCount = 32;
  server.maxConnections = 32;
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(Number(port), privateProgress ? '0.0.0.0' : '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve();
    });
  });
  return {
    async close() {
      const deadline = setTimeout(() => server.closeAllConnections(), 5000);
      try { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
      finally { clearTimeout(deadline); }
    },
  };
}
