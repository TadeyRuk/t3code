import { describe, expect, it } from "vite-plus/test";
import {
  TODO_STALL_THRESHOLD_MS,
  type TodoPanelStatusInput,
  deriveTodoPanelStatus,
  formatQuietDuration,
} from "./threadTodoPanel.logic";

const NOW = 1_000_000;

function input(overrides: Partial<TodoPanelStatusInput> = {}): TodoPanelStatusInput {
  return {
    runStatus: "running",
    connectionReconnecting: false,
    retry: null,
    waitingOn: null,
    lastError: null,
    lastErrorIsUsageLimit: false,
    usageLimitResetAt: null,
    lastActivityAtMs: NOW - 1_000,
    nowMs: NOW,
    allStepsDone: false,
    unfinishedCount: 0,
    ...overrides,
  };
}

describe("deriveTodoPanelStatus", () => {
  it("is running while the agent is making progress", () => {
    expect(deriveTodoPanelStatus(input())).toEqual({ kind: "running" });
  });

  it("calls unexplained silence stalled only past the threshold", () => {
    const justUnder = NOW - (TODO_STALL_THRESHOLD_MS - 1);
    expect(deriveTodoPanelStatus(input({ lastActivityAtMs: justUnder }))).toEqual({
      kind: "running",
    });
    expect(
      deriveTodoPanelStatus(input({ lastActivityAtMs: NOW - TODO_STALL_THRESHOLD_MS })),
    ).toEqual({ kind: "stalled", quietMs: TODO_STALL_THRESHOLD_MS });
  });

  it("does not call a turn stalled without a known last activity", () => {
    expect(deriveTodoPanelStatus(input({ lastActivityAtMs: null }))).toEqual({ kind: "running" });
  });

  it("explains silence by a dropped connection before anything else", () => {
    expect(
      deriveTodoPanelStatus(
        input({
          connectionReconnecting: true,
          waitingOn: "approval",
          retry: { attempt: 1, maxAttempts: 5 },
          lastActivityAtMs: NOW - 10 * TODO_STALL_THRESHOLD_MS,
        }),
      ),
    ).toEqual({ kind: "reconnecting" });
  });

  it("reports a wait on the user instead of a stall", () => {
    expect(
      deriveTodoPanelStatus(
        input({ waitingOn: "question", lastActivityAtMs: NOW - 10 * TODO_STALL_THRESHOLD_MS }),
      ),
    ).toEqual({ kind: "waiting", reason: "question" });
    expect(deriveTodoPanelStatus(input({ runStatus: "waiting" }))).toEqual({
      kind: "waiting",
      reason: "other",
    });
  });

  it("reports an in-flight provider retry with its attempt count", () => {
    expect(deriveTodoPanelStatus(input({ retry: { attempt: 2, maxAttempts: 5 } }))).toEqual({
      kind: "retrying",
      attempt: 2,
      maxAttempts: 5,
    });
  });

  it("separates a usage limit from other failures once the run has ended", () => {
    expect(
      deriveTodoPanelStatus(
        input({
          runStatus: "failed",
          lastErrorIsUsageLimit: true,
          usageLimitResetAt: "2026-10-25T03:00:00.000Z",
        }),
      ),
    ).toEqual({ kind: "limit", resetAt: "2026-10-25T03:00:00.000Z" });
    expect(
      deriveTodoPanelStatus(input({ runStatus: "failed", lastError: "API error 529" })),
    ).toEqual({ kind: "failed", message: "API error 529" });
  });

  it("ignores a stale connection drop and stall once the run is over", () => {
    expect(
      deriveTodoPanelStatus(
        input({
          runStatus: "completed",
          connectionReconnecting: true,
          lastActivityAtMs: NOW - 10 * TODO_STALL_THRESHOLD_MS,
          allStepsDone: true,
        }),
      ),
    ).toEqual({ kind: "done" });
    expect(deriveTodoPanelStatus(input({ runStatus: "interrupted" }))).toEqual({ kind: "idle" });
  });

  it("says a finished turn stopped early when tasks are still open", () => {
    expect(deriveTodoPanelStatus(input({ runStatus: "completed", unfinishedCount: 2 }))).toEqual({
      kind: "unfinished",
      remaining: 2,
    });
    expect(deriveTodoPanelStatus(input({ runStatus: "interrupted", unfinishedCount: 1 }))).toEqual({
      kind: "unfinished",
      remaining: 1,
    });
  });

  it("prefers done over unfinished and ignores unfinished while a turn is live", () => {
    expect(
      deriveTodoPanelStatus(
        input({ runStatus: "completed", allStepsDone: true, unfinishedCount: 0 }),
      ),
    ).toEqual({ kind: "done" });
    expect(deriveTodoPanelStatus(input({ runStatus: "running", unfinishedCount: 3 }))).toEqual({
      kind: "running",
    });
  });

  it("treats a starting run as running rather than stalled", () => {
    expect(
      deriveTodoPanelStatus(
        input({ runStatus: "starting", lastActivityAtMs: NOW - 10 * TODO_STALL_THRESHOLD_MS }),
      ),
    ).toEqual({ kind: "running" });
  });
});

describe("formatQuietDuration", () => {
  it("rounds down to the precision a label needs", () => {
    expect(formatQuietDuration(45_000)).toBe("45s");
    expect(formatQuietDuration(130_000)).toBe("2m 10s");
    expect(formatQuietDuration(120_000)).toBe("2m");
    expect(formatQuietDuration(11 * 60_000 + 20_000)).toBe("11m");
  });
});
