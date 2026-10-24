import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { keepAwake } from "../../power/keepAwakeElectron.ts";
import * as IpcChannels from "../channels.ts";
import { makeIpcMethod, makeSyncIpcMethod } from "../DesktopIpc.ts";

export const getKeepAwake = makeSyncIpcMethod({
  channel: IpcChannels.GET_KEEP_AWAKE_CHANNEL,
  result: Schema.Boolean,
  handler: Effect.fn("desktop.ipc.keepAwake.get")(function* () {
    return keepAwake.enabled();
  }),
});

export const setKeepAwake = makeIpcMethod({
  channel: IpcChannels.SET_KEEP_AWAKE_CHANNEL,
  payload: Schema.Boolean,
  result: Schema.Boolean,
  handler: Effect.fn("desktop.ipc.keepAwake.set")(function* (enabled: boolean) {
    return keepAwake.setEnabled(enabled);
  }),
});
