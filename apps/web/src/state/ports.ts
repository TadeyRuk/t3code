import { WS_METHODS } from "@t3tools/contracts";
import {
  createEnvironmentRpcCommand,
  createEnvironmentRpcQueryAtomFamily,
} from "@t3tools/client-runtime/state/runtime";

import { connectionAtomRuntime } from "../connection/runtime";

export const listeningPorts = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "environment-data:ports:list",
  tag: WS_METHODS.portsList,
  staleTimeMs: 0,
  idleTtlMs: 30_000,
  refreshIntervalMs: 3_000,
});

export const killListeningPort = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:ports:kill",
  tag: WS_METHODS.portsKill,
});
