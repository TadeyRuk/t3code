// @effect-diagnostics nodeBuiltinImport:off globalDate:off globalTimers:off -- Platform boundary: asks the OS for listening sockets and signals a process, outside any Effect fiber.

import type { ListeningPort } from "@t3tools/contracts";
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeUtil from "node:util";

const execFileAsync = NodeUtil.promisify(NodeChildProcess.execFile);

const SS_USERS_PATTERN = /\("([^"]*)",pid=(\d+),fd=\d+\)/g;

/**
 * Parses `ss -ltnpH` output. One row can list several processes sharing a socket, and the
 * same process often listens on both IPv4 and IPv6, so rows are deduplicated per port + pid.
 */
export function parseSsListeningPorts(
  output: string,
  isProtected: (pid: number) => boolean = () => false,
): ListeningPort[] {
  const seen = new Set<string>();
  const ports: ListeningPort[] = [];
  for (const line of output.split("\n")) {
    const local = line.trim().split(/\s+/)[3];
    if (!local) continue;
    const separator = local.lastIndexOf(":");
    const port = Number(local.slice(separator + 1));
    if (separator < 0 || !Number.isInteger(port) || port <= 0) continue;
    const address = local.slice(0, separator).replace(/^\[|\]$/g, "");
    for (const match of line.matchAll(SS_USERS_PATTERN)) {
      const pid = Number(match[2]);
      const key = `${port}:${pid}`;
      if (seen.has(key)) continue;
      seen.add(key);
      ports.push({
        port,
        address,
        pid,
        processName: match[1] ?? "",
        protected: isProtected(pid),
      });
    }
  }
  return ports.toSorted((a, b) => a.port - b.port || a.pid - b.pid);
}

function parentPid(pid: number): number | null {
  try {
    const stat = NodeFS.readFileSync(`/proc/${pid}/stat`, "utf8");
    // The command name is parenthesised and may contain spaces, so split after the last ")".
    const ppid = Number(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[1]);
    return Number.isInteger(ppid) ? ppid : null;
  } catch {
    return null;
  }
}

/**
 * The server and everything that launched it, such as the desktop app or a service manager.
 * Processes the server started, like an agent's dev server, are deliberately not in this set:
 * stopping those is the point of the panel.
 */
export function serverLineage(serverPid: number = process.pid): ReadonlySet<number> {
  const lineage = new Set<number>();
  let current: number | null = serverPid;
  while (current !== null && current > 1 && !lineage.has(current)) {
    lineage.add(current);
    current = parentPid(current);
  }
  return lineage;
}

export async function listListeningPorts(platform: NodeJS.Platform): Promise<ListeningPort[]> {
  if (platform !== "linux") return [];
  const lineage = serverLineage();
  const { stdout } = await execFileAsync("ss", ["-ltnpH"], { timeout: 5_000 });
  return parseSsListeningPorts(stdout, (pid) => lineage.has(pid));
}

/**
 * Stops the process listening on `port`. The pid must still own that port, so a stale row
 * cannot signal an unrelated process that reused the pid, and the server's lineage is refused.
 */
export async function killListeningPort(
  platform: NodeJS.Platform,
  port: number,
  pid: number,
): Promise<boolean> {
  const current = await listListeningPorts(platform);
  const target = current.find((entry) => entry.port === port && entry.pid === pid);
  if (!target || target.protected) return false;
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    return false;
  }
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    try {
      process.kill(pid, 0);
    } catch {
      return true;
    }
  }
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // Exited between the check and the signal.
  }
  return true;
}
