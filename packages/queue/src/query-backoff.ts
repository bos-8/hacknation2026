/** Internal cooldown marker: callers fail fast without another database request. */
export class QueueBackoffError extends Error {
  constructor() {
    super('Queue database query is cooling down');
    this.name = 'QueueBackoffError';
  }
}

type Failure = { count: number; retryAt: number; probing: boolean };
type BackoffOptions = {
  now?: () => number;
  onDelay?: (count: number, delayMs: number) => void;
  onRecovery?: () => void;
};

/** Track each statement independently so a successful heartbeat cannot mask failed job polling. */
export class QueryBackoff {
  private readonly failures = new Map<string, Failure>();
  private readonly now: () => number;
  private readonly onDelay?: BackoffOptions['onDelay'];
  private readonly onRecovery?: BackoffOptions['onRecovery'];

  constructor({ now = Date.now, onDelay, onRecovery }: BackoffOptions = {}) {
    this.now = now;
    this.onDelay = onDelay;
    this.onRecovery = onRecovery;
  }

  async execute<T>(statement: string, query: () => Promise<T>): Promise<T> {
    const previous = this.failures.get(statement);
    if (previous && (previous.retryAt > this.now() || previous.probing)) throw new QueueBackoffError();
    // Once a cooldown expires, admit one probe; concurrent callers cannot create a retry burst.
    if (previous && previous.count >= 3) previous.probing = true;
    try {
      const result = await query();
      const recovered = this.failures.get(statement);
      this.failures.delete(statement);
      if (recovered && recovered.count >= 3) this.onRecovery?.();
      return result;
    } catch (error) {
      const count = (this.failures.get(statement)?.count ?? 0) + 1;
      const delay = count >= 3 ? Math.min(5000 * 2 ** Math.min(count - 3, 4), 60000) : 0;
      // Only pg-boss's fixed statement set is expected. Bound memory even if a future caller varies SQL.
      if (!this.failures.has(statement) && this.failures.size >= 128) {
        const oldest = this.failures.keys().next().value;
        if (oldest !== undefined) this.failures.delete(oldest);
      }
      this.failures.set(statement, { count, retryAt: this.now() + delay, probing: false });
      if (delay) this.onDelay?.(count, delay);
      throw error;
    }
  }
}
