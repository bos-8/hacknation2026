import { main } from './lib/runtime.mjs';

main(import.meta.url, async () => {
  // Clear a terminal screen only; preserve diagnostics in redirected output.
  if (process.stdout.isTTY) console.clear();
});
