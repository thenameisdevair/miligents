import type { KeeperHubClient } from '../client/keeperhub.js';

export async function handleWorkflowsResource(client: KeeperHubClient) {
  const workflows = await client.listWorkflows();
  return {
    contents: [
      {
        uri: 'keeperhub://workflows',
        mimeType: 'application/json',
        text: JSON.stringify(workflows, null, 2),
      },
    ],
  };
}

export async function handleWorkflowResource(
  client: KeeperHubClient,
  workflowId: string
) {
  const workflow = await client.getWorkflow(workflowId);
  return {
    contents: [
      {
        uri: `keeperhub://workflows/${workflowId}`,
        mimeType: 'application/json',
        text: JSON.stringify(workflow, null, 2),
      },
    ],
  };
}
