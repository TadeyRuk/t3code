import type { EnvironmentId } from "@t3tools/contracts";
import type { CSSProperties } from "react";

import { RightPanelResizeHandle } from "~/components/preview/RightPanelResizeHandle";
import { RESIZABLE_WIDTH_PROPERTY, useResizableWidth } from "~/hooks/useResizableWidth";

import FileBrowserPanel from "./FileBrowserPanel";

interface ProjectExplorerPanelProps {
  readonly environmentId: EnvironmentId;
  readonly cwd: string;
  readonly projectName: string;
  readonly selectedPath: string | null;
  readonly selectedPathRevealId: number;
  readonly onOpenFile: (relativePath: string) => void;
  readonly workspaceMutationId: string | null;
}

export function ProjectExplorerPanel(props: ProjectExplorerPanelProps) {
  const { width, handlers } = useResizableWidth({
    storageKey: "t3code:project-explorer-width",
    defaultWidth: 256,
    minWidth: 180,
    maxWidth: 480,
    edge: "right",
  });
  const style = {
    [RESIZABLE_WIDTH_PROPERTY]: `${width}px`,
    width: `var(${RESIZABLE_WIDTH_PROPERTY})`,
    flexBasis: `var(${RESIZABLE_WIDTH_PROPERTY})`,
  } as CSSProperties;

  return (
    <aside
      className="relative flex min-h-0 shrink-0 flex-col border-r border-border/60 bg-background"
      style={style}
      aria-label="Project Explorer"
      data-project-explorer
    >
      <RightPanelResizeHandle handlers={handlers} className="-right-1 left-auto" />
      <div className="flex h-9 min-h-9 shrink-0 items-center border-b border-border/60 px-3 text-xs font-medium text-muted-foreground">
        Explorer
      </div>
      <FileBrowserPanel
        environmentId={props.environmentId}
        cwd={props.cwd}
        projectName={props.projectName}
        selectedPath={props.selectedPath}
        selectedPathRevealId={props.selectedPathRevealId}
        onOpenFile={props.onOpenFile}
        workspaceMutationId={props.workspaceMutationId}
      />
    </aside>
  );
}
