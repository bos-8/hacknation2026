export const DEFAULT_RETRY_LIMIT = 3;
export const DIAGNOSTIC_QUEUE = "system.check";
export const JOB_STATES = ["created", "retry", "active", "completed", "cancelled", "failed"] as const;
export type JobState = typeof JOB_STATES[number];
export type QueueStateCounts = Record<JobState, string> & { total: string };
export type QueueSummary = { all: QueueStateCounts; python: QueueStateCounts };
export type JobRow = {
  id: string; name: string; state: JobState; retryCount: number; retryLimit: number;
  createdAt: Date; startedAt: Date | null; completedAt: Date | null; nextRunAt: Date; actorUuid: string | null;
  adminActionUuid: string | null;
  executor?: 'node' | 'python';
};
export type QueueQuery = { page: number; limit: number; search: string; state?: JobState };
export type QueuePage = { jobs: JobRow[]; total: number };
export const QUEUE_ACTIONS = ['retry', 'repeat', 'resume', 'cancel', 'delete'] as const;
export const DOCUMENT_QUEUE = 'document.process';
export type QueueAction = typeof QUEUE_ACTIONS[number];
export type JobActionInput = { id: string; name: string; operation: QueueAction; expectedState: JobState; expectedRetryCount: number; expectedAdminActionUuid: string | null };
export function queueActionAllowed(operation: QueueAction, state: JobState) {
  return operation === 'retry' ? state === 'failed' : operation === 'repeat' ? state === 'completed' : operation === 'resume' ? state === 'cancelled'
    : operation === 'cancel' ? state === 'created' || state === 'retry' : state !== 'active';
}
