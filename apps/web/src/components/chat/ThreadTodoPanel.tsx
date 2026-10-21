import { formatDuration as formatStepDuration } from "@t3tools/shared/orchestrationTiming";
import { formatDuration as formatResetDuration } from "@t3tools/shared/usageLimits";
import {
  CheckIcon,
  CircleAlertIcon,
  GaugeIcon,
  PauseIcon,
  RotateCwIcon,
  WifiOffIcon,
  XIcon,
} from "lucide-react";
import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";

import type { ActivePlanState } from "../../session-logic";
import { cn } from "../../lib/utils";
import { useChatCanvas } from "./ChatCanvasContext";
import {
  TODO_STALL_REFRESH_MS,
  TODO_STALL_THRESHOLD_MS,
  type TodoPanelStatus,
  type TodoPanelStatusInput,
  deriveTodoPanelStatus,
  formatQuietDuration,
} from "./threadTodoPanel.logic";
import { THREAD_DETAILS_CARD_GAP } from "./threadDetailsCardLayout";

const PANEL_WIDTH = 248;
// Clears the timeline scrubber, which rests at the canvas edge and opens over this strip.
const PANEL_LEFT = 64;
const PANEL_CLEARANCE = 20;

type StepStatus = ActivePlanState["steps"][number]["status"];

interface Presentation {
  readonly color: string;
  readonly icon: ReactNode | null;
  readonly head: string;
  readonly sub: string;
}

const ICON_CLASS = "size-3.5 shrink-0";

function resetsInLabel(resetAt: string | null, nowMs: number): string {
  if (resetAt === null) return "Check the usage card for the reset time";
  const remaining = Date.parse(resetAt) - nowMs;
  return remaining > 0
    ? `Resets in ${formatResetDuration(remaining)}`
    : "Should be available again";
}

function presentStatus(
  status: TodoPanelStatus,
  progress: { readonly done: number; readonly total: number },
  nowMs: number,
): Presentation | null {
  switch (status.kind) {
    case "running":
      return {
        color: "var(--color-foreground)",
        icon: null,
        head: "Running",
        sub: `Step ${Math.min(progress.done + 1, progress.total)} of ${progress.total}`,
      };
    case "retrying":
      return {
        color: "var(--color-warning)",
        icon: <RotateCwIcon className={ICON_CLASS} aria-hidden />,
        head: "Retrying after an API error",
        sub: `Attempt ${status.attempt}${status.maxAttempts === null ? "" : ` of ${status.maxAttempts}`} · the agent is still alive`,
      };
    case "reconnecting":
      return {
        color: "var(--color-warning)",
        icon: <WifiOffIcon className={ICON_CLASS} aria-hidden />,
        head: "Reconnecting to the server",
        sub: "The agent may still be running; progress will resume",
      };
    case "stalled":
      return {
        color: "var(--color-warning)",
        icon: <PauseIcon className={ICON_CLASS} aria-hidden />,
        head: `No activity for ${formatQuietDuration(status.quietMs)}`,
        sub: "Could be a long command or a stuck turn",
      };
    case "waiting":
      return {
        color: "var(--color-info)",
        icon: <CircleAlertIcon className={ICON_CLASS} aria-hidden />,
        head:
          status.reason === "approval"
            ? "Waiting for your approval"
            : status.reason === "question"
              ? "Waiting for your answer"
              : "Waiting for you",
        sub: "Needs your input in the thread",
      };
    case "limit":
      return {
        color: "var(--color-error)",
        icon: <GaugeIcon className={ICON_CLASS} aria-hidden />,
        head: "Usage limit reached",
        sub: resetsInLabel(status.resetAt, nowMs),
      };
    case "failed":
      return {
        color: "var(--color-error)",
        icon: <XIcon className={ICON_CLASS} aria-hidden />,
        head: "This turn failed",
        sub: status.message ?? "See the thread for details",
      };
    case "done":
      return {
        color: "var(--color-success)",
        icon: <CheckIcon className={ICON_CLASS} aria-hidden />,
        head: "All done",
        sub: `${progress.total} ${progress.total === 1 ? "step" : "steps"} completed`,
      };
    case "idle":
      return null;
  }
}

/**
 * One timeout to the moment silence becomes "stalled", then a coarse refresh of the quiet time.
 * Nothing ticks while the turn is healthy, so a busy agent costs this panel no timers at all.
 */
function useQuietClock(lastActivityAtMs: number | null, enabled: boolean): number {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const quiet = lastActivityAtMs !== null && nowMs - lastActivityAtMs >= TODO_STALL_THRESHOLD_MS;
  useEffect(() => {
    if (!enabled || lastActivityAtMs === null) return;
    const deadline = lastActivityAtMs + TODO_STALL_THRESHOLD_MS;
    const current = Date.now();
    if (current < deadline) {
      const timeout = setTimeout(() => setNowMs(Date.now()), deadline - current + 50);
      return () => clearTimeout(timeout);
    }
    const interval = setInterval(() => setNowMs(Date.now()), TODO_STALL_REFRESH_MS);
    return () => clearInterval(interval);
  }, [enabled, lastActivityAtMs, quiet]);
  return nowMs;
}

function StepNode({
  status,
  color,
  icon,
}: {
  readonly status: StepStatus;
  readonly color: string;
  readonly icon: ReactNode | null;
}) {
  if (status === "completed") {
    return (
      <span className="relative z-1 flex size-4 shrink-0 items-center justify-center rounded-full bg-success text-background">
        <CheckIcon className="size-2.5" strokeWidth={3} aria-hidden />
      </span>
    );
  }
  if (status === "pending") {
    return (
      <span
        aria-hidden="true"
        className="relative z-1 size-4 shrink-0 rounded-full border-[1.5px] border-muted-foreground/55 bg-popover"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="relative z-1 flex size-4 shrink-0 items-center justify-center rounded-full border-[1.75px] bg-popover"
      style={{ borderColor: color, color } as CSSProperties}
    >
      {icon ? (
        <span className="flex size-2.5 items-center justify-center [&>svg]:size-2.5">{icon}</span>
      ) : (
        <span className="size-1.5 rounded-full" style={{ backgroundColor: color }} />
      )}
    </span>
  );
}

/**
 * The agent's own to-do list, top-left of the chat. Sits in the lane the chat leaves free, so it
 * needs no layout pass of its own and steps aside when that lane is too narrow.
 */
export function ThreadTodoPanel({
  steps,
  statusInput,
}: {
  readonly steps: ActivePlanState["steps"];
  readonly statusInput: Omit<TodoPanelStatusInput, "nowMs" | "allStepsDone">;
}) {
  const canvas = useChatCanvas();
  const allStepsDone = steps.length > 0 && steps.every((step) => step.status === "completed");
  const runActive = statusInput.runStatus === "running";
  const nowMs = useQuietClock(statusInput.lastActivityAtMs, runActive);
  const status = deriveTodoPanelStatus({ ...statusInput, nowMs, allStepsDone });

  const activeIndex = steps.findIndex((step) => step.status === "inProgress");
  const activeRowRef = useRef<HTMLLIElement | null>(null);
  useEffect(() => {
    activeRowRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  if (!canvas || steps.length === 0) return null;
  const gap = THREAD_DETAILS_CARD_GAP;
  if (canvas.layout.chat.left < PANEL_LEFT + PANEL_WIDTH + PANEL_CLEARANCE) return null;

  const done = steps.filter((step) => step.status === "completed").length;
  const presentation = presentStatus(status, { done, total: steps.length }, nowMs);
  const top = gap + canvas.detailsCardTopInset;

  return (
    <aside
      aria-label="Agent to-do list"
      className="absolute z-20"
      style={{
        left: PANEL_LEFT,
        top,
        width: PANEL_WIDTH,
        maxHeight: Math.max(0, canvas.container.height - top - gap),
      }}
      data-thread-todo-panel
    >
      <div className="dropdown-glass isolate contain-paint flex max-h-[inherit] flex-col overflow-hidden rounded-3xl">
        <div className="flex items-center justify-between gap-3 px-4 pt-3 pb-1.5">
          <h3 className="text-[11px] font-medium tracking-[0.02em] text-muted-foreground select-none">
            Progress
          </h3>
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {done} of {steps.length}
          </span>
        </div>
        {presentation ? (
          <div
            role="status"
            className="mx-2 mb-0.5 flex items-center gap-2.5 rounded-[13px] px-2.5 py-2 text-[11.5px] leading-[1.3]"
            style={{
              backgroundColor: `color-mix(in srgb, ${presentation.color} 14%, transparent)`,
            }}
          >
            <span
              className="flex size-3.5 shrink-0 items-center justify-center"
              style={{ color: presentation.color }}
            >
              {presentation.icon ?? (
                <span
                  aria-hidden="true"
                  className="size-1.5 rounded-full"
                  style={{ backgroundColor: presentation.color }}
                />
              )}
            </span>
            <span className="min-w-0">
              <span className="block font-semibold text-foreground">{presentation.head}</span>
              <span className="mt-px block text-[10.5px] text-muted-foreground">
                {presentation.sub}
              </span>
            </span>
          </div>
        ) : null}
        <ol className="m-0 min-h-0 list-none overflow-y-auto overscroll-contain px-3.5 pt-2.5 pb-3.5">
          {steps.map((step, index) => {
            const last = index === steps.length - 1;
            const active = index === activeIndex;
            return (
              <li
                key={`${index}:${step.step}`}
                ref={active ? activeRowRef : undefined}
                className={cn("relative flex gap-2.5 text-xs leading-[1.3]", !last && "pb-[11px]")}
              >
                {last ? null : (
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute top-[18px] -bottom-0.5 left-[7.25px] w-[1.5px]",
                      step.status === "completed" ? "bg-success/55" : "bg-muted-foreground/25",
                    )}
                  />
                )}
                <StepNode
                  status={step.status}
                  color={presentation?.color ?? "var(--color-foreground)"}
                  icon={presentation?.icon ?? null}
                />
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block [overflow-wrap:anywhere]",
                      step.status === "pending" && "text-muted-foreground",
                      step.status === "inProgress" && "font-semibold",
                    )}
                  >
                    {step.step}
                  </span>
                  {step.status === "completed" && step.durationMs !== undefined ? (
                    <span className="mt-0.5 block text-[10.5px] text-muted-foreground tabular-nums">
                      {formatStepDuration(step.durationMs)}
                    </span>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </aside>
  );
}
