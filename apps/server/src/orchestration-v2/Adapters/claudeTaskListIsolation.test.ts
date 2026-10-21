import { describe, expect, it } from "vite-plus/test";
import { withoutInheritedTaskListId } from "./claudeTaskListIsolation.ts";

describe("withoutInheritedTaskListId", () => {
  it("drops a task list id inherited from the host so sessions keep separate lists", () => {
    const host = { CLAUDE_CODE_TASK_LIST_ID: "shared", PATH: "/usr/bin" };
    expect(withoutInheritedTaskListId(host)).toEqual({ PATH: "/usr/bin" });
  });

  it("does not modify the host environment it was given", () => {
    const host = { CLAUDE_CODE_TASK_LIST_ID: "shared" };
    withoutInheritedTaskListId(host);
    expect(host).toEqual({ CLAUDE_CODE_TASK_LIST_ID: "shared" });
  });

  it("returns the same object when there is nothing to drop", () => {
    const host = { PATH: "/usr/bin" };
    expect(withoutInheritedTaskListId(host)).toBe(host);
  });

  it("leaves an explicitly empty id alone, since an empty value already falls back to the session", () => {
    expect(withoutInheritedTaskListId({ CLAUDE_CODE_TASK_LIST_ID: "" })).toEqual({});
  });
});
