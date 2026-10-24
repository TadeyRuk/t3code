import { assert, describe, it } from "@effect/vitest";

import { parseSsListeningPorts, serverLineage } from "./listeningPorts.ts";

const SAMPLE = [
  'LISTEN 0 4096 127.0.0.1:11434 0.0.0.0:* users:(("ollama",pid=1201,fd=3))',
  'LISTEN 0 511 *:5173 *:* users:(("node",pid=4001,fd=21))',
  'LISTEN 0 511 [::]:5173 [::]:* users:(("node",pid=4001,fd=22))',
  'LISTEN 0 128 [::1]:631 [::]:* users:(("cupsd",pid=900,fd=7),("cups-browsed",pid=901,fd=8))',
  "LISTEN 0 128 0.0.0.0:22 0.0.0.0:*",
].join("\n");

describe("parseSsListeningPorts", () => {
  it("lists one row per port and process, sorted by port", () => {
    assert.deepStrictEqual(
      parseSsListeningPorts(SAMPLE).map((row) => [row.port, row.pid, row.processName, row.address]),
      [
        [631, 900, "cupsd", "::1"],
        [631, 901, "cups-browsed", "::1"],
        [5173, 4001, "node", "*"],
        [11434, 1201, "ollama", "127.0.0.1"],
      ],
    );
  });

  it("skips listeners whose process is not visible", () => {
    assert.strictEqual(
      parseSsListeningPorts(SAMPLE).some((row) => row.port === 22),
      false,
    );
  });

  it("flags protected processes", () => {
    assert.deepStrictEqual(
      parseSsListeningPorts(SAMPLE, (pid) => pid === 1201)
        .filter((row) => row.protected)
        .map((row) => row.pid),
      [1201],
    );
  });
});

describe("serverLineage", () => {
  it("starts at the server itself", () => {
    assert.strictEqual(serverLineage(process.pid).has(process.pid), true);
  });
});
