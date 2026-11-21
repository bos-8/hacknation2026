import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { collectHealth } from '../../packages/monitoring/dist/index.js';

test('real HTTP probes distinguish healthy, invalid and unavailable services; absent Python worker stays unconfigured', async () => {
  const server = createServer((request, response) => {
    if (request.url === '/pl') { response.setHeader('Content-Type', 'text/html'); response.end('<html></html>'); }
    else { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({status: 'ok'})); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const writes=[];
  const db={ $queryRaw: async () => [{ok:1}], serviceHealthSample:{createMany:async input=>writes.push(input)} };
  try {
    await collectHealth(db, {AUTH_BASE_URL:origin, AUTH_ISSUER:origin}, async()=>true, new Date('2026-11-13T12:00:32Z'));
    const rows=writes[0].data;
    assert.equal(rows.length,7); assert.equal(writes[0].skipDuplicates,true);
    assert.equal(rows.find(row=>row.service==='web').status,'healthy');
    assert.equal(rows.find(row=>row.service==='backend').status,'healthy');
    assert.equal(rows.find(row=>row.service==='pyworker').status,'unconfigured');
    assert.equal(rows.find(row=>row.service==='storage').responseMs,null);
    assert.ok(rows.every(row=>row.checkedAt.toISOString()==='2026-11-13T12:00:00.000Z'));
    assert.ok(rows.every(row=>row.expiresAt.toISOString()==='2026-11-20T12:00:00.000Z'));
    await collectHealth(db, {AUTH_BASE_URL:'file:///private', MONITOR_PYWORKER_URL:origin+'/pl'}, async()=>false);
    assert.equal(writes[1].data.find(row=>row.service==='web').reason,'unreachable');
    assert.equal(writes[1].data.find(row=>row.service==='pyworker').status,'error');
    assert.equal(writes[1].data.find(row=>row.service==='queue_worker').status,'degraded');
    assert.ok(!JSON.stringify(writes).includes('/private'));
  } finally { await new Promise(resolve=>server.close(resolve)); }
});
