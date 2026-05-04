import { z } from 'zod';
import type { KeeperHubClient } from '../client/keeperhub.js';
import type { MCPSchemasResponse } from '../types/index.js';

export const listActionSchemasSchema = z.object({
  category: z
    .string()
    .optional()
    .describe('Filter by category (e.g., "web3", "discord", "system")'),
  include_full_schemas: z
    .boolean()
    .optional()
    .default(false)
    .describe('Include full field definitions (default: false)'),
});

// Schemas fetched once at startup
let schemas: MCPSchemasResponse | null = null;

/**
 * Initialize schemas by fetching from KeeperHub API.
 * Called once at MCP startup.
 */
export async function initSchemas(client: KeeperHubClient): Promise<void> {
  try {
    console.error('[Schemas] Fetching schemas from KeeperHub API...');
    schemas = await client.fetchSchemas();
    console.error('[Schemas] Successfully loaded schemas');
  } catch (error) {
    console.error(
      '[Schemas] Failed to fetch schemas:',
      error instanceof Error ? error.message : error
    );
    // MCP will work without schemas, but list_action_schemas will return an error
  }
}

export async function handleListActionSchemas(
  args: z.infer<typeof listActionSchemasSchema>
) {
  if (!schemas) {
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            error: 'Schemas not loaded. MCP may have failed to connect to KeeperHub API at startup.',
          }),
        },
      ],
      isError: true,
    };
  }

  // If category specified, filter actions
  if (args.category) {
    const categoryFilter = args.category.toLowerCase();
    const filtered: Record<string, unknown> = {};

    for (const [actionType, schema] of Object.entries(schemas.actions)) {
      const cat = (schema.category || '').toLowerCase();
      if (cat === categoryFilter || actionType.startsWith(categoryFilter + '/')) {
        filtered[actionType] = schema;
      }
    }

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({ actions: filtered }, null, 2),
        },
      ],
    };
  }

  // If full schemas requested, return everything
  if (args.include_full_schemas) {
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(schemas, null, 2),
        },
      ],
    };
  }

  // Default: return summary (include behavior for branching actions like Condition/For Each/Collect)
  const summary = {
    actions: Object.fromEntries(
      Object.entries(schemas.actions).map(([k, v]) => [
        k,
        v.behavior ? `${v.description} | Behavior: ${v.behavior}` : v.description,
      ])
    ),
    triggers: Object.fromEntries(
      Object.entries(schemas.triggers).map(([k, v]) => [k, v.description])
    ),
    chainCount: schemas.chains.length,
    tips: schemas.tips,
  };

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(summary, null, 2),
      },
    ],
  };
}
