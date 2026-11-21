import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { SERVICES } from '../../packages/monitoring/dist/contracts.js';
import { combinedHealth, currentHealth, systemHistory } from '../../apps/web/src/schemas/admin-dashboard.ts';

const state = globalThis.__dashboardTest = { allowed: false, reads: 0, closed: 0, fail: '' };
registerHooks({ resolve(specifier, context, next) {
  const sources = {
    '@/server/auth/admin-action': 'export const withAdminSession=async action=>globalThis.__dashboardTest.allowed?action():{status:"denied"};',
    '@/server/admin-dashboard': null,
    './database.ts': `export const getDatabase=()=>{const s=globalThis.__dashboardTest;s.reads++;if(s.fail==='database')throw Error('private database');const count=()=>Promise.resolve(0);return {product:{count},file:{count},fileVersion:{count},tag:{count},user:{count},session:{count},$transaction:async queries=>Promise.all(queries)};};`,
    './queue.ts': `export const getJobQueue=()=>({summary:async()=>{const s=globalThis.__dashboardTest;s.reads++;if(s.fail==='queue')throw Error('private queue');return {all:{total:'12',active:'2',created:'4'},python:{total:'3',active:'1',created:'2'}};}});`,
    './files.ts': `export const getFilesConfig=()=>({});export const fileStore=()=>({summary:async()=>{const s=globalThis.__dashboardTest;s.reads++;if(s.fail==='storage')throw Error('private storage');return {objects:0,bytes:'0',lastModified:null};},close:()=>{globalThis.__dashboardTest.closed++;}});`,
    './auth/directory.ts': `export const getIdentityDirectory=()=>({userCounts:async()=>{globalThis.__dashboardTest.reads++;return {total:0,enabled:0};}});`,
    '@formiq/monitoring': `export const readHealth=async()=>({services:[],hours:8});`,
  };
  if (specifier === '@/server/admin-dashboard') return next(new URL('../../apps/web/src/server/admin-dashboard.ts', import.meta.url).href, context);
  const relevant = specifier.startsWith('@/') || context.parentURL?.endsWith('/server/admin-dashboard.ts');
  return relevant && sources[specifier] ? { url: 'data:text/javascript,' + encodeURIComponent(sources[specifier]), shortCircuit: true } : next(specifier, context);
} });
const { refreshDashboard } = await import('../../apps/web/src/app/[locale]/admin/dashboard-actions.ts');

test('dashboard rechecks administrator authorization before every inventory or service read', async () => {
  state.allowed = false;
  assert.deepEqual(await refreshDashboard(), { status: 'denied' });
  assert.equal(state.reads, 0);
  state.allowed = true;
  const result = await refreshDashboard();
  assert.equal(result.status, 'ok');
  assert.equal(result.dashboard.application.products, 0);
  assert.equal(result.dashboard.storage.objects, 0);
  assert.equal(result.dashboard.queue.all.active, '2');
  state.allowed = false;
  const before = state.reads;
  assert.deepEqual(await refreshDashboard(), { status: 'denied' });
  assert.equal(state.reads, before);
});

test('one failed source preserves other counters, closes storage resources and never exposes internal errors', async () => {
  state.allowed = true;
  for (const source of ['queue', 'storage', 'database']) {
    state.fail = source;
    const before = state.closed;
    const result = await refreshDashboard();
    assert.equal(result.status, 'ok');
    assert.equal(result.dashboard[source === 'database' ? 'application' : source], null);
    assert.ok(result.dashboard.identity);
    assert.equal(state.closed, before + 1);
    assert.ok(!JSON.stringify(result).includes('private'));
  }
  state.fail = '';
});

const now = Date.UTC(2026, 10, 17, 12);
function overview() {
  return { collectedAt: new Date(now), hours: 8, staleAfterMs: 180000, services: SERVICES.map(service => ({
    service, status: 'healthy', reason: 'ok', lastCheckedAt: new Date(now), responseMs: 12,
    buckets: [{ from: new Date(now - 300000), to: new Date(now), status: 'healthy', count: 5, averageMs: 12 }],
  })) };
}

test('overall availability reflects failures, incomplete configuration and missing observations', () => {
  assert.equal(combinedHealth(['healthy', 'healthy']), 'healthy');
  assert.equal(combinedHealth(['healthy', 'degraded']), 'degraded');
  assert.equal(combinedHealth(['healthy', 'unconfigured']), 'degraded');
  assert.equal(combinedHealth(['healthy', 'unknown']), 'unknown');
  assert.equal(combinedHealth(['unknown', 'error']), 'error');
  assert.equal(combinedHealth([]), 'unknown');
  const data = overview();
  assert.equal(systemHistory(data, now).status, 'healthy');
  data.services.pop();
  assert.equal(systemHistory(data, now).status, 'unknown');
  assert.equal(systemHistory(data, now).buckets[0].status, 'unknown');
});

test('stale services cannot stay healthy; the system timestamp uses the oldest required observation', () => {
  const data = overview();
  data.services[0].lastCheckedAt = new Date(now - 181000);
  assert.equal(currentHealth(data.services[0], now), 'unknown');
  assert.equal(systemHistory(data, now).status, 'unknown');
  assert.equal(systemHistory(data, now).lastCheckedAt.getTime(), now - 181000);
  data.services[1].buckets[0].status = 'error';
  assert.equal(systemHistory(data, now).buckets[0].status, 'error');
});
