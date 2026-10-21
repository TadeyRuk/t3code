import { createContext, useContext } from "react";
import type { ChatCanvasPreview, resolveChatCanvasLayout } from "./chatCanvasLayout";
import type { PreviewMiniPlayerObstacles } from "../preview/previewMiniPlayerLayout";

export const ChatCanvasContext = createContext<{
  container: { width: number; height: number };
  lane: { padding: number; minChatWidth: number };
  layout: ReturnType<typeof resolveChatCanvasLayout>;
  previewKey: string | null;
  reportPreview: (preview: ChatCanvasPreview) => void;
  clearPreview: (key: string) => void;
  registerTimeline: (element: HTMLElement | null) => void;
  reportDetailsCard: (card: PreviewMiniPlayerObstacles["detailsCard"]) => void;
  detailsCardTopInset: number;
  detailsCardBottom: number | null;
  /** Left edge of the visible chat column within the canvas, or 0 before it is measured. */
  chatContentLeft: number;
} | null>(null);

export const useChatCanvas = () => useContext(ChatCanvasContext);
