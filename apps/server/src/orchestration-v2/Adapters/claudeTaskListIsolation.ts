/**
 * A task list belongs to one conversation. Claude names its list after the session unless
 * CLAUDE_CODE_TASK_LIST_ID is set, and a value inherited from the host environment would then
 * point every thread, in every project, at the same list. It is dropped here so each session falls
 * back to its own id. A value set on a provider instance is applied afterwards and still wins: that
 * is a deliberate choice, not an inherited accident.
 */
export function withoutInheritedTaskListId(hostEnvironment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  if (hostEnvironment.CLAUDE_CODE_TASK_LIST_ID === undefined) return hostEnvironment;
  const next = { ...hostEnvironment };
  delete next.CLAUDE_CODE_TASK_LIST_ID;
  return next;
}
