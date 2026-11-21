import assert from "node:assert/strict";
import test from "node:test";

test("only DEV React server traces can finish before the browser time origin", async t => {
  const native = performance.measure;
  const previousEnv = process.env.NODE_ENV;
  t.after(() => {
    performance.measure = native;
    if (previousEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousEnv;
  });

  process.env.NODE_ENV = "production";
  await import("../../apps/web/src/instrumentation-client.ts?production");
  assert.equal(performance.measure, native);

  process.env.NODE_ENV = "development";
  await import("../../apps/web/src/instrumentation-client.ts?development");
  const detail = { devtools: { trackGroup: "Server Components ⚛" } };
  const options = Object.freeze({ start: 0, end: -200, detail });
  const entry = performance.measure("AdminBoundary [Prerender]", options);
  assert.equal(entry.startTime, 0);
  assert.equal(entry.duration, 0);
  assert.deepEqual(entry.detail, detail);
  assert.equal(performance.measure("valid", { start: 2, end: 5, detail }).duration, 3);
  assert.throws(() => performance.measure("unrelated", { start: 0, end: -1 }), TypeError);
  performance.mark("before", { startTime: 2 });
  performance.mark("after", { startTime: 5 });
  assert.equal(performance.measure("marks", "before", "after").duration, 3);

  const installed = performance.measure;
  await import("../../apps/web/src/instrumentation-client.ts?hot-reload");
  assert.equal(performance.measure, installed);
});
