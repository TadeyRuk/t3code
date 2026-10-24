export interface DisplaySleepBlocker {
  start(kind: "prevent-display-sleep"): number;
  stop(id: number): void;
  isStarted(id: number): boolean;
}

export interface KeepAwake {
  readonly enabled: () => boolean;
  readonly setEnabled: (enabled: boolean) => boolean;
}

/**
 * One display-sleep assertion for the whole app. Starting twice does not stack
 * assertions, and stopping clears whichever id is still running.
 */
export function createKeepAwake(blocker: DisplaySleepBlocker): KeepAwake {
  let id: number | null = null;
  const running = () => id !== null && blocker.isStarted(id);

  return {
    enabled: running,
    setEnabled(enabled) {
      if (enabled) {
        if (running()) return true;
        id = blocker.start("prevent-display-sleep");
        return running();
      }
      if (id !== null && blocker.isStarted(id)) blocker.stop(id);
      id = null;
      return false;
    },
  };
}
