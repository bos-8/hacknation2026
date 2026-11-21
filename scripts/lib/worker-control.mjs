import net from 'node:net';
import { controlAddress } from './control-address.mjs';
import path from 'node:path';

const address = (root, role) => process.platform === 'win32' ? controlAddress(`${path.resolve(root)}-${role}`) : path.join(root, '.local', `worker-${role}.sock`);

/** Workspace-local parent shutdown channel, enabled only for supervised DEV services. */
export async function workerControl(root, role, stop) {
  const server = net.createServer(socket => {
    socket.setTimeout(60000, () => socket.destroy());
    socket.once('data', async data => {
      if (data.toString() !== 'stop\n') { socket.destroy(); return; }
      try { await stop(); socket.end('stopped\n'); }
      catch { socket.end('failed\n'); }
      server.close();
    });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(address(root, role), resolve); });
  return () => server.close();
}

export async function drainWorker(root, role) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(address(root, role));
    let message = '';
    socket.setTimeout(40000, () => socket.destroy(new Error('Worker drain timed out')));
    socket.once('connect', () => socket.write('stop\n'));
    socket.on('data', data => { message += data; if (message.length > 32) socket.destroy(new Error('Invalid worker response')); });
    socket.once('error', error => ['ENOENT', 'ECONNREFUSED'].includes(error.code) ? resolve(false) : reject(error));
    socket.once('end', () => message === 'stopped\n' ? resolve(true) : reject(new Error('Worker drain failed')));
  });
}
