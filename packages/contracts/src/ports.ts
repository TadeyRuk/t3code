import * as Schema from "effect/Schema";
import { NonNegativeInt, PositiveInt } from "./baseSchemas.ts";

export const ListeningPort = Schema.Struct({
  port: PositiveInt,
  /** Bind address as `ss` reports it: `127.0.0.1`, `::1`, or `*` for every interface. */
  address: Schema.String,
  pid: NonNegativeInt,
  processName: Schema.String,
  /** The server and the processes that launched it, which the server refuses to stop. */
  protected: Schema.Boolean,
});
export type ListeningPort = typeof ListeningPort.Type;

export const PortsListInput = Schema.Struct({});
export type PortsListInput = typeof PortsListInput.Type;

export const PortsListResult = Schema.Struct({
  ports: Schema.Array(ListeningPort),
});
export type PortsListResult = typeof PortsListResult.Type;

export const PortsKillInput = Schema.Struct({
  port: PositiveInt,
  pid: NonNegativeInt,
});
export type PortsKillInput = typeof PortsKillInput.Type;

export const PortsKillResult = Schema.Struct({
  /** False when the row was stale, the process is protected, or it would not exit. */
  stopped: Schema.Boolean,
});
export type PortsKillResult = typeof PortsKillResult.Type;

export class PortsError extends Schema.TaggedError<PortsError>()("PortsError", {
  operation: Schema.Literals(["list", "kill"]),
  cause: Schema.Defect(),
}) {
  override get message(): string {
    return `Failed to ${this.operation} listening ports.`;
  }
}
