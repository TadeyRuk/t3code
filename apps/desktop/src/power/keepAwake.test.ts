import { assert, describe, it } from "@effect/vitest";

import { createKeepAwake, type DisplaySleepBlocker } from "./keepAwake.ts";

function fakeBlocker(): DisplaySleepBlocker & { readonly activeCount: () => number } {
  const active = new Set<number>();
  let next = 1;
  return {
    activeCount: () => active.size,
    start() {
      const id = next;
      next += 1;
      active.add(id);
      return id;
    },
    stop(id) {
      active.delete(id);
    },
    isStarted(id) {
      return active.has(id);
    },
  };
}

describe("createKeepAwake", () => {
  it("holds a single display-sleep blocker until it is turned off", () => {
    const blocker = fakeBlocker();
    const awake = createKeepAwake(blocker);

    assert.strictEqual(awake.setEnabled(true), true);
    assert.strictEqual(awake.enabled(), true);
    assert.strictEqual(blocker.activeCount(), 1);

    assert.strictEqual(awake.setEnabled(true), true);
    assert.strictEqual(blocker.activeCount(), 1);

    assert.strictEqual(awake.setEnabled(false), false);
    assert.strictEqual(awake.enabled(), false);
    assert.strictEqual(blocker.activeCount(), 0);
  });
});
