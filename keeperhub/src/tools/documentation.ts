import { z } from 'zod';

export const toolsDocumentationSchema = z.object({
  tool_name: z.string().optional(),
  format: z.enum(['essentials', 'full']).default('essentials').optional(),
});

export async function handleToolsDocumentation(
  args: z.infer<typeof toolsDocumentationSchema>
) {
  const { tool_name, format = 'essentials' } = args;

  const allDocs = getToolsDocumentation();

  if (tool_name) {
    // Specific tool requested - return full docs for that tool
    const doc = allDocs[tool_name];
    if (!doc) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Tool not found: ${tool_name}`,
          },
        ],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({ [tool_name]: doc[format] }, null, 2),
        },
      ],
    };
  }

  // No specific tool - return summary list only
  const summary: Record<string, string> = {};
  for (const [name, doc] of Object.entries(allDocs)) {
    summary[name] = doc.essentials.description;
  }

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({
          availableTools: summary,
          tip: 'Use tool_name parameter to get detailed documentation for a specific tool',
        }, null, 2),
      },
    ],
  };
}

function getToolsDocumentation(): Record<string, any> {
  return {
    search_plugins: {
      essentials: {
        description:
          'Search for KeeperHub plugins by name, description, or functionality',
        keyParameters: ['query', 'limit', 'category'],
        example:
          'Search for Web3 plugins: {"query": "ethereum", "category": "web3"}',
        performance: 'Returns results in <20ms using FTS5 full-text search',
        tips: [
          'Use specific keywords like "ethereum", "discord", "email" for best results',
          'Filter by category to narrow down results',
          'Results are ranked by relevance',
        ],
      },
      full: {
        description:
          'Search for KeeperHub plugins by name, description, or functionality. Returns Web3, messaging, and integration plugins available in KeeperHub.',
        parameters: {
          query: {
            type: 'string',
            description:
              'Search keywords (e.g., "web3", "discord", "email", "webhook")',
            required: true,
          },
          limit: {
            type: 'number',
            description: 'Maximum number of results to return',
            required: false,
            default: 10,
          },
          category: {
            type: 'string',
            description: 'Filter by plugin category',
            required: false,
            default: 'all',
          },
        },
        returns:
          'Array of plugin search results with type, label, description, category, step count, and relevance score',
        examples: [
          'Search for blockchain plugins: {"query": "blockchain"}',
          'Find messaging plugins: {"query": "message", "category": "messaging"}',
          'Discover all plugins: {"query": "*"}',
        ],
        useCases: [
          'Discover available Web3 automation capabilities',
          'Find plugins for specific integration needs',
          'Explore messaging and notification options',
        ],
        performance: 'SQLite FTS5 search, typically <20ms response time',
        bestPractices: [
          'Use specific keywords for better relevance',
          'Start with broad searches, then narrow with category filters',
          'Check stepCount to see available actions per plugin',
        ],
        pitfalls: [
          'Generic queries may return many results',
          'Category filter requires exact match',
        ],
        relatedTools: ['get_plugin', 'validate_plugin_config'],
      },
    },
    get_plugin: {
      essentials: {
        description:
          'Get complete documentation for a specific plugin including all steps and schemas',
        keyParameters: ['plugin_type', 'include_examples'],
        example:
          'Get Web3 plugin details: {"plugin_type": "web3", "include_examples": true}',
        performance: 'Returns plugin details in <10ms',
        tips: [
          'Use include_examples for working configuration examples',
          'Review configFields to understand required parameters',
          'Check outputFields to know what data each step returns',
        ],
      },
      full: {
        description:
          'Get complete documentation for a KeeperHub plugin including all available steps, input/output schemas, and credential requirements.',
        parameters: {
          plugin_type: {
            type: 'string',
            description:
              'Plugin type identifier (e.g., "web3", "discord", "sendgrid")',
            required: true,
          },
          include_examples: {
            type: 'boolean',
            description: 'Include configuration examples for each step',
            required: false,
            default: false,
          },
        },
        returns:
          'Complete plugin details including credentials, steps with config fields, output fields, and optional examples',
        examples: [
          'Get Web3 plugin: {"plugin_type": "web3"}',
          'Get Discord plugin with examples: {"plugin_type": "discord", "include_examples": true}',
        ],
        useCases: [
          'Understand plugin capabilities before building workflows',
          'Get field schemas for validation',
          'Learn configuration requirements',
        ],
        performance: 'Direct database lookup, <10ms response time',
        bestPractices: [
          'Always check credentials.required before using a plugin',
          'Review all configFields to ensure you have necessary data',
          'Use include_examples to see working configurations',
        ],
        pitfalls: [
          'Some fields may have complex types (chain-select, token-select)',
          'Template variables are allowed in most string fields',
        ],
        relatedTools: ['search_plugins', 'validate_plugin_config'],
      },
    },
    validate_plugin_config: {
      essentials: {
        description:
          'Validate plugin step configuration against schema before deployment',
        keyParameters: ['plugin_type', 'step_slug', 'config'],
        example:
          'Validate Web3 transfer: {"plugin_type": "web3", "step_slug": "transfer-funds", "config": {"network": "ethereum", "amount": "0.1", "recipientAddress": "0x..."}}',
        performance: 'Validates configuration in <5ms',
        tips: [
          'Always validate before deploying to catch errors early',
          'Check both errors and warnings in the result',
          'Use runtime mode for production, strict for development',
        ],
      },
      full: {
        description:
          'Validate a plugin step configuration against its schema. Checks required fields, data types, and plugin-specific constraints.',
        parameters: {
          plugin_type: {
            type: 'string',
            description: 'Plugin type',
            required: true,
          },
          step_slug: {
            type: 'string',
            description: 'Step slug',
            required: true,
          },
          config: {
            type: 'object',
            description: 'Configuration object to validate',
            required: true,
          },
          validation_mode: {
            type: 'string',
            description: 'Validation strictness level',
            required: false,
            default: 'runtime',
          },
        },
        returns:
          'Validation result with valid flag, errors array, warnings array, and optional suggestions',
        examples: [
          'Validate balance check: {"plugin_type": "web3", "step_slug": "check-balance", "config": {"network": "ethereum", "address": "0x..."}}',
        ],
        useCases: [
          'Prevent runtime errors by validating before deployment',
          'Get helpful error messages for configuration issues',
          'Ensure address formats, amounts, and URLs are correct',
        ],
        performance: 'Schema validation, <5ms response time',
        bestPractices: [
          'Validate all configurations before creating workflows',
          'Review warnings even if validation passes',
          'Use strict mode during development',
        ],
        pitfalls: [
          'Template variables are not validated (they are runtime values)',
          'Some validations are format-only, not semantic',
        ],
        relatedTools: ['get_plugin', 'deploy_template'],
      },
    },
    search_templates: {
      essentials: {
        description: 'Search for pre-built workflow templates',
        keyParameters: ['query', 'category', 'difficulty'],
        example:
          'Find monitoring templates: {"query": "balance monitor", "category": "monitoring"}',
        performance: 'Returns results in <20ms',
        tips: [
          'Use specific use case keywords for best results',
          'Filter by difficulty to match your expertise',
          'Check requiredPlugins to ensure you have necessary integrations',
        ],
      },
      full: {
        description:
          'Search for pre-built Web3 workflow templates. Find templates for wallet monitoring, token transfers, DeFi alerts, and more.',
        parameters: {
          query: {
            type: 'string',
            description: 'Search keywords',
            required: true,
          },
          category: {
            type: 'string',
            description: 'Filter by template category',
            required: false,
            default: 'all',
          },
          difficulty: {
            type: 'string',
            description: 'Filter by difficulty level',
            required: false,
            default: 'all',
          },
          limit: {
            type: 'number',
            description: 'Maximum results to return',
            required: false,
            default: 10,
          },
        },
        returns:
          'Array of template search results with metadata and node count',
        examples: [
          'Find all monitoring templates: {"query": "monitor"}',
          'Find beginner templates: {"query": "*", "difficulty": "beginner"}',
        ],
        useCases: [
          'Quickly deploy common Web3 automation patterns',
          'Learn workflow best practices from examples',
          'Accelerate development with pre-built solutions',
        ],
        performance: 'FTS5 search, <20ms response time',
        bestPractices: [
          'Start with beginner templates if new to KeeperHub',
          'Review requiredPlugins before deployment',
          'Check estimatedSetupTime to plan configuration',
        ],
        pitfalls: [
          'Templates may require environment variables',
          'Some templates need specific integrations configured',
        ],
        relatedTools: ['get_template', 'deploy_template'],
      },
    },
    get_template: {
      essentials: {
        description: 'Get complete workflow template with setup instructions',
        keyParameters: ['template_id', 'include_setup_guide'],
        example:
          'Get ETH monitor: {"template_id": "eth-balance-monitor-topup"}',
        performance: 'Returns template in <10ms',
        tips: [
          'Always review setup guide before deployment',
          'Check required environment variables',
          'Understand the workflow flow before customizing',
        ],
      },
      full: {
        description:
          'Get complete workflow template configuration including nodes, edges, and setup instructions.',
        parameters: {
          template_id: {
            type: 'string',
            description: 'Template ID from search_templates',
            required: true,
          },
          include_setup_guide: {
            type: 'boolean',
            description: 'Include step-by-step setup instructions',
            required: false,
            default: true,
          },
        },
        returns:
          'Complete template with nodes, edges, and optional setup guide',
        examples: [
          'Get template: {"template_id": "eth-balance-monitor-topup"}',
        ],
        useCases: [
          'Review template before deployment',
          'Understand required configuration',
          'Plan customizations',
        ],
        performance: 'Direct database lookup, <10ms',
        bestPractices: [
          'Read setup guide completely before deploying',
          'Configure all required environment variables',
          'Test on testnet first if available',
        ],
        pitfalls: [
          'Templates use environment variable references',
          'Some nodes may need integration credentials',
        ],
        relatedTools: ['search_templates', 'deploy_template'],
      },
    },
    list_projects: {
      essentials: {
        description: 'List all projects in the organization for grouping workflows',
        keyParameters: [],
        example: 'List projects: {}',
        performance: 'Returns all projects in one API call',
        tips: [
          'Call this before create_workflow/update_workflow to discover valid project IDs',
          'Use the returned id as project_id in workflow tools',
        ],
      },
      full: {
        description:
          'List all projects in the organization. Projects group related workflows together. Returns id, name, description, workflowCount, and createdAt for each project.',
        parameters: {},
        returns:
          'Object with projects array (id, name, description, workflowCount, createdAt) and a usage hint',
        examples: ['List all projects: {}'],
        useCases: [
          'Discover available project IDs before creating or updating workflows',
          'Understand how workflows are organized in the organization',
        ],
        bestPractices: [
          'Call list_projects at the start of workflow management tasks',
          'Pass the project id directly as project_id in create_workflow or update_workflow',
        ],
        relatedTools: ['list_tags', 'list_workflows', 'create_workflow', 'update_workflow'],
      },
    },
    list_tags: {
      essentials: {
        description: 'List all tags in the organization for labeling workflows',
        keyParameters: [],
        example: 'List tags: {}',
        performance: 'Returns all tags in one API call',
        tips: [
          'Call this before create_workflow/update_workflow to discover valid tag IDs',
          'Use the returned id as tag_id in workflow tools',
        ],
      },
      full: {
        description:
          'List all tags in the organization. Tags label workflows for categorization (e.g., production, monitoring, liquidation). Returns id, name, color, workflowCount, and createdAt for each tag.',
        parameters: {},
        returns:
          'Object with tags array (id, name, color, workflowCount, createdAt) and a usage hint',
        examples: ['List all tags: {}'],
        useCases: [
          'Discover available tag IDs before creating or updating workflows',
          'See how workflows are categorized across the organization',
        ],
        bestPractices: [
          'Call list_tags at the start of workflow management tasks',
          'Pass the tag id directly as tag_id in create_workflow or update_workflow',
        ],
        relatedTools: ['list_projects', 'list_workflows', 'create_workflow', 'update_workflow'],
      },
    },
    deploy_template: {
      essentials: {
        description: 'Deploy a template as a new workflow with customizations',
        keyParameters: ['template_id', 'workflow_name', 'customizations'],
        example:
          'Deploy monitor: {"template_id": "eth-balance-monitor-topup", "workflow_name": "My ETH Monitor"}',
        performance: 'Deploys in <2 seconds',
        tips: [
          'Configure environment variables before deploying',
          'Use customizations to override specific node configs',
          'Validation is enabled by default',
        ],
      },
      full: {
        description:
          'Deploy a workflow template to KeeperHub with customization options. Validates configuration before deployment.',
        parameters: {
          template_id: {
            type: 'string',
            description: 'Template ID to deploy',
            required: true,
          },
          workflow_name: {
            type: 'string',
            description: 'Custom name for the deployed workflow',
            required: true,
          },
          customizations: {
            type: 'object',
            description: 'Node-specific customizations',
            required: false,
          },
          validate_before_deploy: {
            type: 'boolean',
            description: 'Validate template before deployment',
            required: false,
            default: true,
          },
        },
        returns: 'Deployment result with success flag and workflow ID',
        examples: [
          'Deploy with defaults: {"template_id": "eth-balance-monitor-topup", "workflow_name": "Monitor"}',
          'Deploy with customizations: {"template_id": "eth-balance-monitor-topup", "workflow_name": "Monitor", "customizations": {"check-balance": {"network": "polygon"}}}',
        ],
        useCases: [
          'Quickly deploy proven workflow patterns',
          'Create multiple workflows from same template',
          'Customize templates for specific needs',
        ],
        performance: 'Deploys in <2 seconds including validation',
        bestPractices: [
          'Always validate before deployment',
          'Set up all required integrations first',
          'Test workflows manually after deployment',
        ],
        pitfalls: [
          'Customizations are merged with template config',
          'Environment variables must be set in KeeperHub',
        ],
        relatedTools: ['get_template', 'validate_plugin_config'],
      },
    },
  };
}
