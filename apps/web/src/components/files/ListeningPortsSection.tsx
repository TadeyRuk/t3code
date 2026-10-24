import type { EnvironmentId, ListeningPort } from "@t3tools/contracts";
import { ChevronRightIcon, XIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "~/components/ui/button";
import { RefreshIcon } from "~/components/ui/refresh-icon";
import { toastManager } from "~/components/ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";
import { readLocalApi } from "~/localApi";
import { killListeningPort, listeningPorts } from "~/state/ports";
import { useEnvironmentQuery } from "~/state/query";
import { useAtomCommand } from "~/state/use-atom-command";

const CONFIRM_TIMEOUT_MS = 4_000;

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function isLoopbackAddress(address: string): boolean {
  return address === "::1" || address === "localhost" || address.startsWith("127.");
}

function portKey(entry: ListeningPort): string {
  return `${entry.port}:${entry.pid}`;
}

/**
 * Where this browser can reach the port. A port that listens on every interface is reached
 * through whatever host the UI itself was loaded from, which is the Tailscale name when the
 * UI is viewed from another device. A port bound to loopback is only reachable from the
 * server's own computer.
 */
function portUrl(entry: ListeningPort): string | null {
  const pageHost = window.location.hostname;
  const viewingLocally = LOOPBACK_HOSTS.has(pageHost);
  if (isLoopbackAddress(entry.address)) {
    return viewingLocally ? `http://localhost:${entry.port}` : null;
  }
  const wildcard = entry.address === "*" || entry.address === "0.0.0.0" || entry.address === "::";
  const host = wildcard ? (viewingLocally ? "localhost" : pageHost) : entry.address;
  return `http://${host.includes(":") ? `[${host}]` : host}:${entry.port}`;
}

/**
 * Lists the TCP ports the environment's computer is listening on. A row opens the port in the
 * default browser; the button on its right stops the process. The server does the listing and
 * the killing, so this works the same from a browser on another device.
 */
export function ListeningPortsSection(props: { readonly environmentId: EnvironmentId }) {
  const { environmentId } = props;
  const [open, setOpen] = useState(true);
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const query = useEnvironmentQuery(open ? listeningPorts({ environmentId, input: {} }) : null);
  const kill = useAtomCommand(killListeningPort, { reportFailure: false });
  const ports = query.data?.ports ?? [];

  useEffect(() => {
    if (confirmKey === null) return;
    const timeout = window.setTimeout(() => setConfirmKey(null), CONFIRM_TIMEOUT_MS);
    return () => window.clearTimeout(timeout);
  }, [confirmKey]);

  const openPort = (url: string) => {
    void readLocalApi()
      ?.shell.openExternal(url)
      .catch((error: unknown) => {
        toastManager.add({
          type: "error",
          title: "Unable to open port",
          description: error instanceof Error ? error.message : String(error),
        });
      });
  };

  const stopPort = async (entry: ListeningPort) => {
    setConfirmKey(null);
    const result = await kill({ environmentId, input: { port: entry.port, pid: entry.pid } });
    if (result._tag !== "Success" || !result.value.stopped) {
      toastManager.add({
        type: "error",
        title: `Could not stop :${entry.port}`,
        description: `${entry.processName || "Process"} (pid ${entry.pid}) did not exit, is protected, or already stopped.`,
      });
    }
    query.refresh();
  };

  return (
    <section
      className="flex max-h-[45%] min-h-0 shrink-0 flex-col border-t border-border/60"
      aria-label="Active ports"
      data-listening-ports
    >
      <div className="flex h-8 min-h-8 shrink-0 items-center gap-1 px-2 text-xs font-medium text-muted-foreground">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-1 text-left"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <ChevronRightIcon className={cn("size-3.5 transition-transform", open && "rotate-90")} />
          <span>Ports</span>
          {ports.length > 0 ? <span className="tabular-nums">({ports.length})</span> : null}
        </button>
        {open ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Refresh active ports"
                  onClick={query.refresh}
                />
              }
            >
              <RefreshIcon refreshing={query.isPending} />
            </TooltipTrigger>
            <TooltipPopup>Refresh ports</TooltipPopup>
          </Tooltip>
        ) : null}
      </div>
      {open ? (
        <ul className="min-h-0 overflow-y-auto pb-1">
          {query.error !== null && ports.length === 0 ? (
            <li className="px-3 py-1.5 text-xs text-muted-foreground/70">
              Could not read ports: {query.error}
            </li>
          ) : null}
          {query.error === null && query.isSuccess && ports.length === 0 ? (
            <li className="px-3 py-1.5 text-xs text-muted-foreground/70">No active ports</li>
          ) : null}
          {ports.map((entry) => {
            const key = portKey(entry);
            const url = portUrl(entry);
            const name = entry.processName || `pid ${entry.pid}`;
            return (
              <li key={key} className="flex items-center gap-1 px-2">
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <button
                        type="button"
                        disabled={url === null}
                        className="flex min-w-0 flex-1 items-baseline gap-2 rounded px-1 py-1 text-left text-xs enabled:hover:bg-accent disabled:cursor-default"
                        onClick={() => url !== null && openPort(url)}
                      />
                    }
                  >
                    <span
                      className={cn(
                        "shrink-0 font-mono tabular-nums",
                        url === null ? "text-muted-foreground" : "text-foreground",
                      )}
                    >
                      :{entry.port}
                    </span>
                    <span className="truncate text-muted-foreground">{name}</span>
                  </TooltipTrigger>
                  <TooltipPopup>
                    {url !== null
                      ? `Open ${url}`
                      : "Only listening on the host's localhost, so this device can't reach it"}
                  </TooltipPopup>
                </Tooltip>
                {entry.protected ? (
                  <span className="shrink-0 px-1 text-3xs text-muted-foreground/70">
                    this server
                  </span>
                ) : confirmKey === key ? (
                  <Button
                    type="button"
                    variant="destructive"
                    size="xs"
                    onClick={() => void stopPort(entry)}
                  >
                    Kill?
                  </Button>
                ) : (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Kill process on port ${entry.port}`}
                          onClick={() => setConfirmKey(key)}
                        />
                      }
                    >
                      <XIcon className="size-3.5" />
                    </TooltipTrigger>
                    <TooltipPopup>Kill {name}</TooltipPopup>
                  </Tooltip>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
