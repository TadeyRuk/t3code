import type {
  ProviderInstanceId,
  ScopedThreadRef,
  ServerProvider,
  ServerProviderUsageWindow,
  UsageLimitSourceSnapshots,
} from "@t3tools/contracts";
import {
  collectProviderUsageLimits,
  formatResetsIn,
  limitsNotice,
  remainingPercent,
} from "@t3tools/shared/usageLimits";
import { FoldVerticalIcon } from "lucide-react";
import { type CSSProperties, useLayoutEffect, useMemo, useState } from "react";

import { type ContextWindowSnapshot, formatContextWindowTokens } from "~/lib/contextWindow";
import { observeResize } from "../../lib/observeResize";
import { cn } from "../../lib/utils";
import { selectThreadPanelOpen, useRightPanelStore } from "../../rightPanelStore";
import { providerClients } from "../settings/providerDriverMeta";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { useChatCanvas } from "./ChatCanvasContext";
import { ProviderInstanceIcon, providerTextColor } from "./ProviderInstanceIcon";
import { THREAD_DETAILS_CARD_GAP, resolveThreadDetailsCardLayout } from "./threadDetailsCardLayout";

const DIAL_SIZE = 56;
const MAX_MATCHED_HEIGHT = 220;
const DIAL_THICKNESS = 4.5;

// Gradient stops in percent of the limit: calm until just under half, then warming through amber
// into red. The track tints the last quarter so the danger zone shows before the arc reaches it.
const SAFE_UNTIL = 45;
const WARN_AT = 72;
const DANGER_AT = 90;
const DANGER_ZONE_FROM = 75;

const ringMask = `radial-gradient(farthest-side, transparent calc(100% - ${DIAL_THICKNESS}px), #000 calc(100% - ${DIAL_THICKNESS - 0.5}px))`;

const trackStyle: CSSProperties = {
  background: `conic-gradient(color-mix(in srgb, var(--color-muted-foreground) 18%, transparent) 0 ${DANGER_ZONE_FROM}%, color-mix(in srgb, var(--color-error) 26%, transparent) ${DANGER_ZONE_FROM}% 100%)`,
  mask: ringMask,
  WebkitMask: ringMask,
};

const arcMask = `${ringMask}, conic-gradient(#000 calc(var(--usage-dial-progress) * 1%), transparent 0)`;
const arcStyle: CSSProperties = {
  background: `conic-gradient(var(--color-success) 0%, var(--color-success) ${SAFE_UNTIL}%, var(--color-warning) ${WARN_AT}%, var(--color-error) ${DANGER_AT}%, var(--color-error) 100%)`,
  mask: arcMask,
  maskComposite: "intersect",
  WebkitMask: arcMask,
  WebkitMaskComposite: "source-in",
};

/** The gradient's colour at `percent`, so the round cap matches the arc beneath it. */
function tipColor(percent: number): string {
  if (percent <= SAFE_UNTIL) return "var(--color-success)";
  if (percent <= WARN_AT) {
    const mix = Math.round(((percent - SAFE_UNTIL) / (WARN_AT - SAFE_UNTIL)) * 100);
    return `color-mix(in oklab, var(--color-warning) ${mix}%, var(--color-success))`;
  }
  if (percent <= DANGER_AT) {
    const mix = Math.round(((percent - WARN_AT) / (DANGER_AT - WARN_AT)) * 100);
    return `color-mix(in oklab, var(--color-error) ${mix}%, var(--color-warning))`;
  }
  return "var(--color-error)";
}

// Critically damped: nothing here is flicked, so a settle with no overshoot reads as calm.
const SETTLE =
  "transition-[--usage-dial-progress,transform,background-color] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none";

function formatPercentNumber(value: number): string {
  return value < 10 ? value.toFixed(1).replace(/\.0$/, "") : `${Math.round(value)}`;
}

function DialCap({ percent, color }: { readonly percent: number; readonly color: string }) {
  return (
    <span
      aria-hidden="true"
      className={`absolute top-0 left-1/2 rounded-full ${SETTLE}`}
      style={{
        width: DIAL_THICKNESS,
        height: DIAL_THICKNESS,
        marginLeft: -DIAL_THICKNESS / 2,
        transformOrigin: `50% ${DIAL_SIZE / 2}px`,
        transform: `rotate(${percent * 3.6}deg)`,
        backgroundColor: color,
      }}
    />
  );
}

export interface DialAction {
  readonly label: string;
  readonly onActivate: () => void;
  readonly disabled: boolean;
  readonly disabledReason: string | null;
}

/** Every dial fills toward its limit, so "fuller" means the same thing across the row. */
function Dial({
  label,
  usedPercent,
  detail,
  action,
}: {
  readonly label: string;
  readonly usedPercent: number | null;
  readonly detail: string;
  readonly action?: DialAction | undefined;
}) {
  const clamped = Math.max(0, Math.min(100, usedPercent ?? 0));
  const valueText = usedPercent === null ? detail : `${Math.round(clamped)}% used, ${detail}`;
  const ring = (
    <>
      <span aria-hidden="true" className="absolute inset-0 rounded-full" style={trackStyle} />
      {usedPercent === null ? null : (
        <>
          <span aria-hidden="true" className="absolute inset-0 rounded-full" style={arcStyle} />
          <DialCap percent={0} color="var(--color-success)" />
          <DialCap percent={clamped} color={tipColor(clamped)} />
        </>
      )}
      <span
        aria-hidden={action ? true : undefined}
        className={cn(
          "absolute inset-0 flex items-center justify-center text-foreground tabular-nums",
          action &&
            "transition-opacity duration-150 ease-out group-hover/dial:opacity-0 group-focus-visible/dial:opacity-0 motion-reduce:transition-none",
        )}
      >
        {usedPercent === null ? (
          <span className="text-sm text-muted-foreground">–</span>
        ) : (
          <>
            <span className="text-sm leading-none font-semibold tracking-[-0.03em]">
              {formatPercentNumber(clamped)}
            </span>
            <span className="ms-px mt-[3px] text-[9px] leading-none font-medium text-muted-foreground">
              %
            </span>
          </>
        )}
      </span>
      {action ? (
        <span
          aria-hidden="true"
          className={cn(
            "absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-150 ease-out group-hover/dial:opacity-100 group-focus-visible/dial:opacity-100 motion-reduce:transition-none",
            action.disabled ? "text-muted-foreground" : "text-foreground",
          )}
        >
          <FoldVerticalIcon className="size-5" strokeWidth={2.25} />
        </span>
      ) : null}
    </>
  );
  const ringStyle = {
    "--usage-dial-progress": usedPercent === null ? 0 : clamped,
  } as CSSProperties;

  return (
    <div className="flex min-w-0 flex-col items-center gap-[7px]">
      {action ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                // aria-disabled keeps the tooltip reachable; a disabled button swallows hover.
                aria-disabled={action.disabled || undefined}
                aria-label={`${action.label}. ${label} ${valueText}`}
                onClick={() => {
                  if (!action.disabled) action.onActivate();
                }}
                className={cn(
                  "group/dial relative size-14 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover",
                  "transition-transform duration-100 ease-out motion-reduce:transition-none",
                  action.disabled ? "cursor-not-allowed" : "cursor-pointer active:scale-[0.94]",
                )}
              />
            }
          >
            {/* The press scale wants 100ms; the dial's value wants a slow settle. Separate layers. */}
            <span className={cn("absolute inset-0", SETTLE)} style={ringStyle}>
              {ring}
            </span>
          </TooltipTrigger>
          <TooltipPopup side="top">
            {action.disabled
              ? (action.disabledReason ?? `${action.label} is unavailable`)
              : action.label}
          </TooltipPopup>
        </Tooltip>
      ) : (
        <div
          className={cn("relative size-14", SETTLE)}
          style={ringStyle}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={usedPercent === null ? undefined : Math.round(clamped)}
          aria-valuetext={valueText}
          aria-label={label}
        >
          {ring}
        </div>
      )}
      <span className="max-w-full truncate text-xs leading-none font-medium tracking-[-0.01em] text-foreground">
        {label}
      </span>
      <span className="-mt-0.5 max-w-full truncate text-[10.5px] leading-none text-muted-foreground tabular-nums">
        {detail}
      </span>
    </div>
  );
}

function contextDial(usage: ContextWindowSnapshot | null) {
  const hasMax = usage !== null && usage.maxTokens != null && usage.usedPercentage !== null;
  const detail =
    usage === null
      ? "No usage yet"
      : hasMax && usage.remainingTokens !== null
        ? `${formatContextWindowTokens(usage.remainingTokens)} left`
        : `${formatContextWindowTokens(usage.usedTokens)} used`;
  return { usedPercent: hasMax ? usage.usedPercentage : null, detail };
}

function resetDetail(window: ServerProviderUsageWindow, now: number): string {
  const resetsIn = formatResetsIn(window, now);
  if (resetsIn === null) return `${remainingPercent(window)}% left`;
  return resetsIn.replace(/^resets in /i, "");
}

/**
 * Sits in the lane the details card leaves free on the right edge, so it needs no layout pass of
 * its own: it shares the card's width and gutter, and steps aside whenever the column is too short
 * or a floating preview already owns that corner.
 */
export function ThreadUsageCard({
  threadRef,
  contextWindow,
  providerInstanceId,
  providers,
  sources,
  compactAction,
}: {
  readonly threadRef: ScopedThreadRef;
  readonly contextWindow: ContextWindowSnapshot | null;
  readonly providerInstanceId: ProviderInstanceId | null;
  readonly providers: readonly ServerProvider[];
  readonly sources: UsageLimitSourceSnapshots;
  /** Absent when the provider cannot compact, so the dial stays a plain gauge. */
  readonly compactAction?: DialAction | undefined;
}) {
  const canvas = useChatCanvas();
  // The clock is frozen at each provider refresh: a ticking one would repaint the card every second.
  const report = useMemo(
    () =>
      providerInstanceId === null
        ? null
        : collectProviderUsageLimits(providerInstanceId, providers, sources, Date.now()),
    [providerInstanceId, providers, sources],
  );
  const provider = providers.find((entry) => entry.instanceId === providerInstanceId);
  const brandColor = provider ? providerTextColor(provider.driver) : {};
  const providerLabel = provider
    ? provider.displayName?.trim() ||
      (providerClients.get(provider.driver)?.label ?? String(provider.driver))
    : null;
  const inlineOpen = useRightPanelStore((state) =>
    selectThreadPanelOpen(state.threadPanelVisibilityByThreadKey, threadRef, "inline"),
  );
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [height, setHeight] = useState(0);
  useLayoutEffect(() => {
    if (!element) return;
    const measure = () => setHeight(element.offsetHeight);
    measure();
    return observeResize(element, measure);
  }, [element]);
  // Lines up with the message box beside it. Measured, not derived: the box's height and its
  // inset from the canvas edge both change with banners, attachments and multi-line drafts.
  const [composerBox, setComposerBox] = useState<{ bottom: number; height: number } | null>(null);
  const containerWidth = canvas?.container.width;
  const containerHeight = canvas?.container.height;
  useLayoutEffect(() => {
    const canvasElement = element?.closest<HTMLElement>("[data-chat-canvas]");
    const host = canvasElement?.querySelector<HTMLElement>('[data-slot="composer-host"]');
    if (!canvasElement || !host) {
      setComposerBox(null);
      return;
    }
    const measure = () => {
      const canvasRect = canvasElement.getBoundingClientRect();
      const hostRect = host.getBoundingClientRect();
      const next = {
        bottom: Math.round(canvasRect.bottom - hostRect.bottom),
        height: Math.round(hostRect.height),
      };
      setComposerBox((current) =>
        current?.bottom === next.bottom && current.height === next.height ? current : next,
      );
    };
    measure();
    return observeResize([canvasElement, host], measure);
  }, [element, containerWidth, containerHeight]);

  const placement = canvas
    ? resolveThreadDetailsCardLayout({
        container: canvas.container,
        lane: canvas.lane,
        frame: null,
        topInset: canvas.detailsCardTopInset,
      })
    : null;
  if (!canvas || !placement || !inlineOpen) return null;

  const gap = THREAD_DETAILS_CARD_GAP;
  const bottom = composerBox?.bottom ?? gap;
  const fits =
    canvas.previewKey === null &&
    (canvas.detailsCardBottom === null ||
      canvas.container.height - bottom - height >= canvas.detailsCardBottom + gap);
  const now = report ? Date.parse(report.createdAt) : 0;
  // The report lists every account of this driver (personal and work Claude logins alike), so
  // pick the selected instance's own. Two instances on one login are merged under one instanceId,
  // hence the email fallback. No match shows no limits rather than another account's.
  const selectedEmail = provider?.auth.email;
  const account =
    report?.accounts.find((entry) => entry.instanceId === providerInstanceId) ??
    (selectedEmail ? report?.accounts.find((entry) => entry.email === selectedEmail) : undefined);
  const plan = provider?.auth.label ?? account?.plan;
  const notice = account ? limitsNotice(account.limits) : null;
  const windows = account && notice === null ? account.limits.windows : [];

  return (
    <aside
      ref={setElement}
      aria-label="Usage"
      className="absolute z-20 flex flex-col"
      // Hidden rather than unmounted so the height stays measurable when room returns.
      style={{
        right: placement.right,
        bottom,
        width: placement.width,
        // A long draft grows the box well past its resting size; the card stops matching there.
        minHeight: composerBox ? Math.min(composerBox.height, MAX_MATCHED_HEIGHT) : undefined,
        visibility: fits ? "visible" : "hidden",
      }}
      data-thread-usage-card
    >
      <div className="dropdown-glass isolate contain-paint flex flex-1 flex-col justify-center overflow-hidden rounded-3xl">
        <div className="flex items-center justify-between gap-3 px-4 pt-3.5">
          <h3 className="text-[11px] font-medium tracking-[0.02em] text-muted-foreground select-none">
            Usage
          </h3>
          {provider && providerLabel ? (
            <span
              className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground"
              title={plan ? `${providerLabel} · ${plan}` : providerLabel}
            >
              <span className={cn("inline-flex", brandColor.className)} style={brandColor.style}>
                <ProviderInstanceIcon
                  driverKind={provider.driver}
                  displayName={providerLabel}
                  acpRegistryIconUrl={provider.iconUrl}
                  iconClassName="size-3.5"
                />
              </span>
              <span className="sr-only">{providerLabel}</span>
              {plan ? <span className="truncate">{plan}</span> : null}
            </span>
          ) : null}
        </div>
        <div className="grid grid-cols-3 gap-y-4 px-2.5 pt-3.5 pb-4">
          <Dial label="Context" {...contextDial(contextWindow)} action={compactAction} />
          {windows.map((window) => (
            <Dial
              key={window.id}
              label={window.label}
              usedPercent={window.usedPercent}
              detail={resetDetail(window, now)}
            />
          ))}
        </div>
        {notice ? (
          <p className="-mt-1 px-4 pb-3.5 text-center text-[10.5px] text-muted-foreground">
            {notice}
          </p>
        ) : null}
      </div>
    </aside>
  );
}
