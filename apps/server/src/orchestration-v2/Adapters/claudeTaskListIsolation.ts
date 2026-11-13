/**
 * An inherited CLAUDE_CODE_TASK_LIST_ID would point every thread in every project at one task
 * list, so it is dropped and each session falls back to its own id. A value set on a provider
 * instance is applied afterwards and still wins.
 */
export function withoutInheritedTaskListId(hostEnvironment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  if (hostEnvironment.CLAUDE_CODE_TASK_LIST_ID === undefined) return hostEnvironment;
  const next = { ...hostEnvironment };
  delete next.CLAUDE_CODE_TASK_LIST_ID;
  return next;
}
