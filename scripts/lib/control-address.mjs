import path from 'node:path';
import { createHash } from 'node:crypto';

export function controlAddress(root) {
  const identity = process.platform === 'win32' ? path.resolve(root).toLowerCase() : path.resolve(root);
  const hash = createHash('sha256').update(identity).digest('hex').slice(0, 24);
  return process.platform === 'win32' ? `\\\\.\\pipe\\modulon-dev-${hash}` : path.join(root, '.local/dev-control.sock');
}
