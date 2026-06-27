import type { AgentActionName } from "../agent/types";

export class PostSalesActionExecutionError extends Error {
  readonly actionType: AgentActionName;
  readonly originalError: unknown;

  constructor(actionType: AgentActionName, originalError: unknown) {
    super(`Post-sales action failed: ${actionType}`);
    this.name = "PostSalesActionExecutionError";
    this.actionType = actionType;
    this.originalError = originalError;
  }
}

export async function executePostSalesAction<T>(
  actionType: AgentActionName,
  operation: () => Promise<T>
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw new PostSalesActionExecutionError(actionType, error);
  }
}
