import { z } from 'zod';
import type { TemplateRepository } from '../database/template-repository.js';
import type { KeeperHubClient } from '../client/keeperhub.js';

export const searchTemplatesSchema = z.object({
  query: z.string(),
  category: z
    .enum(['all', 'monitoring', 'transfers', 'defi', 'notifications', 'analytics'])
    .default('all')
    .optional(),
  difficulty: z
    .enum(['all', 'beginner', 'intermediate', 'advanced'])
    .default('all')
    .optional(),
  limit: z.number().default(10).optional(),
});

export const getTemplateSchema = z.object({
  template_id: z.string(),
  include_setup_guide: z.boolean().default(true).optional(),
  include_workflow_config: z.boolean().default(false).optional().describe('Include full nodes/edges arrays (default: false, returns metadata + setup guide only)'),
});

export const deployTemplateSchema = z.object({
  template_id: z.string(),
  workflow_name: z.string(),
  customizations: z.record(z.any()).optional(),
  validate_before_deploy: z.boolean().default(true).optional(),
});

export async function handleSearchTemplates(
  templateRepo: TemplateRepository,
  args: z.infer<typeof searchTemplatesSchema>
) {
  const { query, category = 'all', difficulty = 'all', limit = 10 } = args;

  const results = templateRepo.searchTemplates(
    query,
    limit,
    category,
    difficulty
  );

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(results, null, 2),
      },
    ],
  };
}

export async function handleGetTemplate(
  templateRepo: TemplateRepository,
  args: z.infer<typeof getTemplateSchema>
) {
  const { template_id, include_setup_guide = true, include_workflow_config = false } = args;

  const template = templateRepo.getTemplate(template_id);

  if (!template) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Template not found: ${template_id}`,
        },
      ],
      isError: true,
    };
  }

  let result: any;

  if (include_workflow_config) {
    // Include full nodes/edges
    result = { ...template };
  } else {
    // Return summary without nodes/edges
    const { nodes, edges, ...metadata } = template;
    result = {
      ...metadata,
      nodeCount: nodes?.length ?? 0,
      edgeCount: edges?.length ?? 0,
    };
  }

  if (include_setup_guide) {
    result.setupGuide = generateSetupGuide(template_id);
  }

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}

export async function handleDeployTemplate(
  client: KeeperHubClient,
  templateRepo: TemplateRepository,
  args: z.infer<typeof deployTemplateSchema>
) {
  const {
    template_id,
    workflow_name,
    customizations = {},
    validate_before_deploy = true,
  } = args;

  const template = templateRepo.getTemplate(template_id);

  if (!template) {
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              success: false,
              workflowName: workflow_name,
              message: `Template not found: ${template_id}`,
            },
            null,
            2
          ),
        },
      ],
      isError: true,
    };
  }

  let nodes = template.nodes;

  if (Object.keys(customizations).length > 0) {
    nodes = nodes.map((node) => {
      if (customizations[node.id]) {
        return {
          ...node,
          config: {
            ...node.config,
            ...customizations[node.id],
          },
        };
      }
      return node;
    });
  }

  if (validate_before_deploy) {
    const validationErrors = validateTemplate(template, nodes);
    if (validationErrors.errors.length > 0) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                success: false,
                workflowName: workflow_name,
                validationErrors,
                message: 'Template validation failed',
              },
              null,
              2
            ),
          },
        ],
      };
    }
  }

  try {
    const workflow = await client.createWorkflow({
      name: workflow_name,
      description: template.description,
      nodes,
      edges: template.edges,
    });

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              success: true,
              workflowId: workflow.id,
              workflowName: workflow_name,
              message: 'Template deployed successfully',
            },
            null,
            2
          ),
        },
      ],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              success: false,
              workflowName: workflow_name,
              message: `Failed to deploy template: ${errorMessage}`,
            },
            null,
            2
          ),
        },
      ],
      isError: true,
    };
  }
}

function generateSetupGuide(templateId: string): any {
  if (templateId === 'eth-balance-monitor-topup') {
    return {
      steps: [
        {
          step: 1,
          title: 'Set Environment Variables',
          description:
            'Configure the following environment variables in your KeeperHub organization settings:\n- MONITORED_WALLET_ADDRESS: The wallet address to monitor\n- MIN_BALANCE_ETH: Minimum balance threshold (e.g., 0.1)\n- TOPUP_AMOUNT_ETH: Amount to transfer when balance is low (e.g., 0.5)\n- ALERT_EMAIL: Email address for notifications\n- LOGGING_WEBHOOK_URL: Optional webhook URL for status logging',
        },
        {
          step: 2,
          title: 'Configure Web3 Connection',
          description:
            'Ensure your Para wallet has sufficient ETH to perform top-ups. The wallet will be used to send funds to the monitored address.',
          nodeId: 'transfer-funds',
        },
        {
          step: 3,
          title: 'Configure SendGrid',
          description:
            'Add SendGrid API key in your KeeperHub integrations. This enables email notifications for successful and failed top-ups.',
          nodeId: 'send-success-email',
        },
        {
          step: 4,
          title: 'Adjust Schedule',
          description:
            'Modify the cron expression in the Schedule Trigger to change monitoring frequency. Default is every 4 hours (0 */4 * * *).',
          nodeId: 'schedule-trigger',
        },
        {
          step: 5,
          title: 'Test Workflow',
          description:
            "Click 'Test Workflow' to perform a manual check. Verify that balance checking works correctly before enabling the schedule.",
        },
      ],
      prerequisites: [
        'Para wallet with sufficient ETH for top-ups',
        'SendGrid account and API key',
        'Target wallet address to monitor',
      ],
      configurationTips: [
        'Set MIN_BALANCE_ETH higher than gas costs to ensure transactions can complete',
        'Set TOPUP_AMOUNT_ETH to cover expected usage plus buffer',
        'Test with small amounts first on a testnet',
        'Monitor your funding wallet balance to ensure it does not run out',
        'Consider setting up multiple funding sources for redundancy',
      ],
    };
  }

  return {
    steps: [],
    prerequisites: [],
    configurationTips: [],
  };
}

function validateTemplate(template: any, nodes: any[]): any {
  const errors: any[] = [];
  const warnings: any[] = [];

  const nodeIds = new Set(nodes.map((n) => n.id));
  for (const edge of template.edges) {
    if (!nodeIds.has(edge.source)) {
      errors.push({
        field: 'edges',
        message: `Edge references non-existent source node: ${edge.source}`,
        severity: 'error',
      });
    }
    if (!nodeIds.has(edge.target)) {
      errors.push({
        field: 'edges',
        message: `Edge references non-existent target node: ${edge.target}`,
        severity: 'error',
      });
    }
  }

  for (const node of nodes) {
    if (node.config) {
      for (const [key, value] of Object.entries(node.config)) {
        if (
          typeof value === 'string' &&
          value.includes('{{env.') &&
          !value.match(/^\{\{env\.[A-Z_]+\}\}$/)
        ) {
          warnings.push({
            field: `${node.id}.${key}`,
            message: `Environment variable reference may be incorrectly formatted: ${value}`,
          });
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
