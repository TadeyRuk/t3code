import { createContext, useContext } from "react";
import type { resolveChatCanvasLayout } from "./chatCanvasLayout";
import type { resolveThreadDetailsCardLayout } from "./threadDetailsCardLayout";
import type { ScopedThreadRef } from "@t3tools/contracts";

/** The inline details card's measured full-density height at a card width. */
export interface DetailsCardMeasurement {
  readonly threadRef: ScopedThreadRef;
  readonly width: number;
  readonly fullContentHeight: number;
}

// Null outside a ChatCanvas: side panels render nothing there rather than guess at a layout.
export const ChatCanvasContext = createContext<{
  container: { width: number; height: number };
  lane: { padding: number; minChatWidth: number };
  layout: ReturnType<typeof resolveChatCanvasLayout>;
  previewKey: string | null;
  registerTimeline: (element: HTMLElement | null) => void;
  measureDetailsCard: (measurement: DetailsCardMeasurement) => void;
  detailsCardTopInset: number;
  /** Where an inline card sits when nothing overlaps it; null when the canvas is too narrow. */
  preferredDetailsCard: ReturnType<typeof resolveThreadDetailsCardLayout>;
  /** Where the inline card sits now; null when it shows as a popover. */
  detailsCardPlacement: ReturnType<typeof resolveThreadDetailsCardLayout>;
  /** Bottom edge of the inline details card, or null when it is closed or a popover. */
  detailsCardBottom: number | null;
  /** Left edge of the visible chat column within the canvas, or 0 before it is measured. */
  chatContentLeft: number;
} | null>(null);

export const useChatCanvas = () => useContext(ChatCanvasContext);
