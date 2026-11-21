/** Bounded internal HTTP adapter. pg-boss remains the owner of claims and retries. */
export function pythonEndpoint(env, path) {
    let base;
    try { base = new URL(env.PYWORKER_URL || ''); } catch { throw new Error('Python worker is not configured'); }
    const privateWorker = env.PYWORKER_ALLOW_PRIVATE_NETWORK === 'true' && base.hostname === 'pyworker';
    if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.pathname !== '/' || base.search || base.hash
      || base.protocol === 'http:' && !['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname) && !privateWorker) throw new Error('Invalid Python worker endpoint');
    const token = env.PYWORKER_API_TOKEN || '';
    if (!/^[A-Za-z0-9_-]{32,}$/.test(token) || token.includes('CHANGE_ME')) throw new Error('Python worker token not configured');
    return { url: new URL(path, base), headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } };
}

export function createPythonExecutor(env = process.env) {
  return async ({ id, attempt }) => {
    const { url, headers } = pythonEndpoint(env, '/v1/tasks/check');
    if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id) || !Number.isInteger(attempt) || attempt < 0 || attempt > 1000000) throw new Error('Invalid Python job');
    const response = await fetch(url, { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(20000),
      headers, body: JSON.stringify({ job_id: id, attempt }) });
    try {
      if (response.status !== 200) throw new Error(`Python worker request failed (${response.status})`);
      const reader = response.body?.getReader();
      if (!reader) throw new Error('Python worker returned no result');
      let size = 0; const chunks = [];
      try { for (;;) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.length; if (size > 8192) throw new Error('Python worker result too large'); chunks.push(chunk.value); } }
      finally { await reader.cancel(); reader.releaseLock(); }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      const result = JSON.parse(new TextDecoder().decode(bytes));
      if (result.status !== 'ok' || result.executor !== 'pyworker' || result.job_id !== id || result.attempt !== attempt || !/^[\da-f]{64}$/.test(result.checksum || '')) throw new Error('Invalid Python worker result');
      return result;
    } finally { await response.body?.cancel().catch(() => {}); }
  };
}
