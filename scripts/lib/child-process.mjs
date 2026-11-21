/** Stop only the owned child. Register exit before requesting shutdown; every wait is bounded. */
const stopping = new WeakMap();

export function stopChild(child, options = {}) {
  if (!child?.pid || child.exitCode !== null || child.signalCode) return Promise.resolve();
  const previous = stopping.get(child);
  if (previous) return previous;
  const operation = stopOwnedChild(child, options);
  stopping.set(child, operation);
  return operation;
}

async function stopOwnedChild(child, { graceMs = 20000, forceMs = 2000 } = {}) {
  if (!child?.pid || child.exitCode !== null || child.signalCode) return;
  let finish;
  const exited = new Promise(resolve => { finish = resolve; });
  child.once('exit', finish);
  child.once('error', finish);
  const wait = async milliseconds => {
    let timer;
    try { return await Promise.race([exited.then(() => true), new Promise(resolve => { timer = setTimeout(() => resolve(false), milliseconds); })]); }
    finally { clearTimeout(timer); }
  };
  try {
    if (child.connected) child.send({ type: 'shutdown' }, () => {});
    else if (child.stdin?.writable) child.stdin.end('shutdown\n');
    else child.kill('SIGTERM');
    if (!await wait(graceMs)) {
      child.kill('SIGKILL');
      if (!await wait(forceMs)) throw new Error('Owned child did not exit before shutdown deadline');
    }
  } finally { child.removeListener('exit', finish); child.removeListener('error', finish); }
}
