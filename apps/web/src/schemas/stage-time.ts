import type { StageTiming } from "./document-review.ts";

/** Use the timestamp of the measurement, so a slow next page does not inflate the measured rate. */
export function stageTime(timing: StageTiming, percent: number | null, now: number) {
  const start = timing.startedAt?.getTime();
  const elapsed = Math.max(0, now - (start ?? timing.queuedAt.getTime()));
  const sample = timing.sampledAt?.getTime();
  const measured = start !== undefined && sample !== undefined && sample > start && percent !== null && percent > 0 && percent < 99
    ? (sample - start) * 100 / percent : null;
  const estimate = measured ?? timing.estimateMs;
  const remaining = start === undefined || estimate === null || elapsed >= estimate
    ? null : Math.ceil((estimate - elapsed) / 1000);
  return { elapsed: Math.floor(elapsed / 1000), remaining };
}
