import test from "node:test";
import assert from "node:assert/strict";
import { stageTime } from "../../apps/web/src/schemas/stage-time.ts";

const timing = { queuedAt: new Date(1000), startedAt: null, sampledAt: null, estimateMs: null };

test("queue wait and cold starts do not promise a finish time", () => {
  assert.deepEqual(stageTime(timing, null, 6000), { elapsed: 5, remaining: null });
  assert.deepEqual(stageTime({ ...timing, startedAt: new Date(6000) }, 0, 8000), { elapsed: 2, remaining: null });
});

test("remaining time counts down from a page measurement and supersedes history", () => {
  const running = { ...timing, startedAt: new Date(6000), estimateMs: 20000 };
  assert.deepEqual(stageTime(running, null, 8000), { elapsed: 2, remaining: 18 });
  const sample = { ...running, sampledAt: new Date(8000) };
  assert.deepEqual(stageTime(sample, 25, 9000), { elapsed: 3, remaining: 5 });
  assert.deepEqual(stageTime(sample, 25, 12000), { elapsed: 6, remaining: 2 });
  assert.deepEqual(stageTime(sample, 25, 15000), { elapsed: 9, remaining: null });
  assert.equal(stageTime({ ...sample, estimateMs: null }, 99, 9000).remaining, null);
});
