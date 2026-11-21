/** Bound aggregation latency even if a dependency fails to honour its own timeout. */
export async function withDeadline<T>(operation: () => PromiseLike<T>, milliseconds = 6500): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Operation timed out')), milliseconds); }),
    ]);
  } finally { clearTimeout(timer); }
}
