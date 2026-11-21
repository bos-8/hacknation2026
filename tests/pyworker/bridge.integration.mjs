import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import path from 'node:path';
import { pyworkerDirectory, pyworkerEnvironment } from '../../scripts/pyworker.mjs';
import { startQueueBridge } from '../../scripts/lib/queue-bridge.mjs';

const listener = createServer();
await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
const port = listener.address().port;
await new Promise(resolve => listener.close(resolve));
const token = randomBytes(32).toString('hex');
const id = randomUUID(); const actor = randomUUID(); let submitted = 0;
const bridge = await startQueueBridge({
  env: { PYWORKER_QUEUE_BRIDGE_PORT: String(port), PYWORKER_QUEUE_TOKEN: token },
  systemActor: async () => actor,
  queue: {
    enqueueDiagnostic: async (failures, actorUuid, executor) => {
      assert.equal(failures, 0); assert.equal(actorUuid, actor); assert.equal(executor, 'python');
      submitted++; return id;
    },
    list: async () => ({ jobs: [{ id, state: 'completed', executor: 'python', retryCount: 0 }] }),
  },
});
const source = `
import asyncio
from pyworker.connections.queue import QueueClient, QueueSettings, QueueUnavailable
async def main():
    settings = QueueSettings.from_environment()
    async with QueueClient(settings) as queue:
        job_id = await queue.enqueue_diagnostic()
        job = await queue.get_job(job_id)
        assert job.state == 'completed' and job.executor == 'python'
    async with QueueClient(QueueSettings(settings.url, 'x' * 32)) as queue:
        try:
            await queue.enqueue_diagnostic()
        except QueueUnavailable:
            pass
        else:
            raise AssertionError('Invalid token was accepted')
asyncio.run(main())
`;
try {
  const python = path.join(pyworkerDirectory, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  await promisify(execFile)(python, ['-c', source], { windowsHide: true, timeout: 30000, maxBuffer: 8192,
    env: { ...await pyworkerEnvironment(), PYWORKER_QUEUE_URL: `http://127.0.0.1:${port}`, PYWORKER_QUEUE_TOKEN: token },
  });
  assert.equal(submitted, 1);
  console.log('PASS real Python QueueClient -> authenticated Node bridge, SYSTEM submission, status read and rejected token (queue backend fixture)');
} catch {
  throw new Error('Python/Node queue bridge integration failed; process output hidden');
} finally { await bridge.close(); }
