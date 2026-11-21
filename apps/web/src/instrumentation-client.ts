// Next 16.4.6's React DEV profiler can finish an aborted or errored prerender
// before the current document's time origin. Represent it as a zero-duration entry.
if (process.env.NODE_ENV === "development" && typeof performance.measure === "function" &&
    performance.measure.name !== "measureReactPrerender") {
  const original = performance.measure;
  performance.measure = function measureReactPrerender(this: Performance, ...args: Parameters<Performance["measure"]>) {
    const options = args[1];
    if (typeof options === "object" && options !== null &&
        typeof options.end === "number" && options.end < 0 &&
        typeof options.start === "number" && options.start >= 0 &&
        options.detail?.devtools?.trackGroup === "Server Components ⚛") {
      args[1] = { ...options, end: options.start };
    }
    return original.apply(this, args);
  };
}
