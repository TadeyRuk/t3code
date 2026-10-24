import * as Electron from "electron";

import { createKeepAwake } from "./keepAwake.ts";

export const keepAwake = createKeepAwake(Electron.powerSaveBlocker);
