import test from 'node:test';
import assert from 'node:assert/strict';
import { withDeadline } from '../../packages/monitoring/src/deadline.ts';

test('hung and rejected sources settle independently and do not block successful counters', async () => {
 const read=operation=>withDeadline(operation,20).catch(()=>null);
 assert.deepEqual(await Promise.all([read(()=>new Promise(()=>{})),read(async()=>42),read(async()=>{throw Error('private');})]),[null,42,null]);
});
