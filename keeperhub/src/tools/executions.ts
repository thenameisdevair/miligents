import { z } from 'zod';
import type { KeeperHubClient } from '../client/keeperhub.js';

export const executeWorkflowSchema = z.object({
  workflow_id: z.string().describe('The ID of the workflow to execute'),
  input: z.record(z.unknown()).optional().describe('Optional input data for the workflow'),
});

export const getExecutionStatusSchema = z.object({
  execution_id: z.string().describe('The ID of the execution to check'),
});

export const getExecutionLogsSchema = z.object({
  execution_id: z.string().describe('The ID of the execution to get logs for'),
});

export const listWorkflowExecutionsSchema = z.object({
  workflow_id: z.string().describe('The ID of the workflow to list executions for'),
});

export async function handleExecuteWorkflow(
  client: KeeperHubClient,
  args: z.infer<typeof executeWorkflowSchema>
) {
  const execution = await client.executeWorkflow({
    workflowId: args.workflow_id,
    input: args.input,
  });
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(execution, null, 2),
      },
    ],
  };
}

export async function handleGetExecutionStatus(
  client: KeeperHubClient,
  args: z.infer<typeof getExecutionStatusSchema>
) {
  const status = await client.getExecutionStatus(args.execution_id);
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(status, null, 2),
      },
    ],
  };
}

export async function handleGetExecutionLogs(
  client: KeeperHubClient,
  args: z.infer<typeof getExecutionLogsSchema>
) {
  const result = await client.getExecutionLogs(args.execution_id);
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}

export async function handleListWorkflowExecutions(
  client: KeeperHubClient,
  args: z.infer<typeof listWorkflowExecutionsSchema>
) {
  const executions = await client.listWorkflowExecutions(args.workflow_id);
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(executions, null, 2),
      },
    ],
  };
}
