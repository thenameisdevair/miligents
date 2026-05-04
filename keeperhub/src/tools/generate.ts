import { z } from 'zod';
import type { KeeperHubClient } from '../client/keeperhub.js';

export const generateWorkflowSchema = z.object({
  prompt: z.string().describe('Natural language description of the workflow to generate'),
  existing_workflow_id: z.string().optional().describe('Optional ID of an existing workflow to modify'),
});

export async function handleGenerateWorkflow(
  client: KeeperHubClient,
  args: z.infer<typeof generateWorkflowSchema>
) {
  const result = await client.generateWorkflow({
    prompt: args.prompt,
    existingWorkflowId: args.existing_workflow_id,
  });
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(result.workflow, null, 2),
      },
    ],
  };
}
