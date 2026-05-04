import { z } from 'zod';
import type { KeeperHubClient } from '../client/keeperhub.js';

export const listProjectsSchema = z.object({}).strict();

export const listTagsSchema = z.object({}).strict();

export async function handleListProjects(client: KeeperHubClient) {
  const projects = await client.listProjects();

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(
          {
            projects,
            hint: 'Use the id field as project_id when creating or updating workflows to assign them to a project.',
          },
          null,
          2
        ),
      },
    ],
  };
}

export async function handleListTags(client: KeeperHubClient) {
  const tags = await client.listTags();

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(
          {
            tags,
            hint: 'Use the id field as tag_id when creating or updating workflows to label them.',
          },
          null,
          2
        ),
      },
    ],
  };
}
