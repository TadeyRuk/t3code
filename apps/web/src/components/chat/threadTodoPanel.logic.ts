import type {
  OrchestrationV2ProjectedTurnItem,
  OrchestrationV2RunStatus,
} from "@t3tools/contracts";

/** Silence this long on a running turn reads as stalled, though a long command can look the same. */
export const TODO_STALL_THRESHOLD_MS = 90_000;
/** How often the quiet time is re-read once stalled. Coarse on purpose: it is a label, not a timer. */
export const TODO_STALL_REFRESH_MS = 30_000;

export type TodoPanelStatus =
  | { readonly kind: "running" }
  | {
      readonly kind: "retrying";
      readonly attempt: number;
      readonly maxAttempts: number | null;
    }
  | { readonly kind: "reconnecting" }
  | { readonly kind: "stalled"; readonly quietMs: number }
  | { readonly kind: "waiting"; readonly reason: "approval" | "question" | "other" }
  | { readonly kind: "limit"; readonly resetAt: string | null }
  | { readonly kind: "failed"; readonly message: string | null }
  | { readonly kind: "unfinished"; readonly remaining: number }
  | { readonly kind: "done" }
  | { readonly kind: "idle" };

export interface TodoPanelStatusInput {
  readonly runStatus: OrchestrationV2RunStatus | "idle" | null;
  /** The client lost, or has not yet regained, its connection to the T3 server. */
  readonly connectionReconnecting: boolean;
  readonly retry: { readonly attempt: number; readonly maxAttempts: number | null } | null;
  readonly waitingOn: "approval" | "question" | null;
  readonly lastError: string | null;
  readonly lastErrorIsUsageLimit: boolean;
  readonly usageLimitResetAt: string | null;
  readonly lastActivityAtMs: number | null;
  readonly nowMs: number;
  readonly allStepsDone: boolean;
  readonly unfinishedCount: number;
}

const ACTIVE_RUN_STATUSES: ReadonlySet<string> = new Set([
  "preparing",
  "queued",
  "starting",
  "running",
  "waiting",
]);

/**
 * Priority runs from "the agent cannot make progress for a reason outside it" to "all is well":
 * a dropped connection explains everything beneath it, a wait on the user explains silence, and
 * only unexplained silence is called stalled.
 */
export function deriveTodoPanelStatus(input: TodoPanelStatusInput): TodoPanelStatus {
  const active = input.runStatus !== null && ACTIVE_RUN_STATUSES.has(input.runStatus);
  if (!active) {
    if (input.runStatus === "failed") {
      return input.lastErrorIsUsageLimit
        ? { kind: "limit", resetAt: input.usageLimitResetAt }
        : { kind: "failed", message: input.lastError };
    }
    if (input.allStepsDone) return { kind: "done" };
    // A turn can end mid-list, for instance an agent that waits on a background command and is
    // never woken. The list then still reads "running", so say that nothing is running.
    return input.unfinishedCount > 0
      ? { kind: "unfinished", remaining: input.unfinishedCount }
      : { kind: "idle" };
  }
  if (input.connectionReconnecting) return { kind: "reconnecting" };
  if (input.runStatus === "waiting" || input.waitingOn !== null) {
    return { kind: "waiting", reason: input.waitingOn ?? "other" };
  }
  if (input.retry !== null) {
    return { kind: "retrying", attempt: input.retry.attempt, maxAttempts: input.retry.maxAttempts };
  }
  // Only "running": a queued or starting run is quiet by design and must not be called stalled.
  if (input.runStatus === "running" && input.lastActivityAtMs !== null) {
    const quietMs = input.nowMs - input.lastActivityAtMs;
    if (quietMs >= TODO_STALL_THRESHOLD_MS) return { kind: "stalled", quietMs };
  }
  return { kind: "running" };
}

/** The provider retry still in flight, if any. Settled retries stay in the log but are not news. */
export function findRunningProviderRetry(
  items: ReadonlyArray<OrchestrationV2ProjectedTurnItem> | null | undefined,
): { readonly attempt: number; readonly maxAttempts: number | null } | null {
  if (!items) return null;
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const { item } = items[index]!;
    if (item.type === "error" && item.retry !== undefined && item.status === "running") {
      return { attempt: item.retry.attempt, maxAttempts: item.retry.maxAttempts };
    }
  }
  return null;
}

export function formatQuietDuration(quietMs: number): string {
  const totalSeconds = Math.floor(quietMs / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes < 1) return `${totalSeconds}s`;
  const seconds = totalSeconds % 60;
  return seconds === 0 || minutes >= 10 ? `${minutes}m` : `${minutes}m ${seconds}s`;
}

/** The newest of the given timestamps (ISO strings or epoch milliseconds), as epoch milliseconds. */
export function latestActivityMs(
  ...timestamps: ReadonlyArray<string | number | null | undefined>
): number | null {
  let latest: number | null = null;
  for (const timestamp of timestamps) {
    if (timestamp === null || timestamp === undefined || timestamp === "") continue;
    const parsed = typeof timestamp === "number" ? timestamp : Date.parse(timestamp);
    if (Number.isFinite(parsed) && (latest === null || parsed > latest)) latest = parsed;
  }
  return latest;
}
