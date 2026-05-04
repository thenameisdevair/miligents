import { z } from 'zod';
import type { PluginRepository } from '../database/plugin-repository.js';

export const searchPluginsSchema = z.object({
  query: z.string(),
  limit: z.number().default(10).optional(),
  category: z.enum(['all', 'web3', 'messaging', 'integration', 'notification']).default('all').optional(),
});

export const getPluginSchema = z.object({
  plugin_type: z.string(),
  include_examples: z.boolean().default(false).optional(),
  include_config_fields: z.boolean().default(false).optional().describe('Include full configFields/outputFields for each step (default: false, returns step summaries only)'),
});

export const validatePluginConfigSchema = z.object({
  plugin_type: z.string(),
  step_slug: z.string(),
  config: z.record(z.any()),
  validation_mode: z.enum(['strict', 'runtime', 'minimal']).default('runtime').optional(),
});

export async function handleSearchPlugins(
  pluginRepo: PluginRepository,
  args: z.infer<typeof searchPluginsSchema>
) {
  const { query, limit = 10, category = 'all' } = args;

  const results = pluginRepo.searchPlugins(query, limit, category);

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(results, null, 2),
      },
    ],
  };
}

export async function handleGetPlugin(
  pluginRepo: PluginRepository,
  args: z.infer<typeof getPluginSchema>
) {
  const { plugin_type, include_examples = false, include_config_fields = false } = args;

  const plugin = pluginRepo.getPlugin(plugin_type);

  if (!plugin) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Plugin not found: ${plugin_type}`,
        },
      ],
      isError: true,
    };
  }

  // Transform steps based on options
  plugin.steps = plugin.steps.map((step: any) => {
    let transformedStep = { ...step };

    // Add examples if requested
    if (include_examples) {
      transformedStep.examples = generateStepExamples(plugin_type, step);
    }

    // Strip configFields/outputFields unless requested (return summary only)
    if (!include_config_fields) {
      const { configFields, outputFields, ...summary } = transformedStep;
      transformedStep = {
        ...summary,
        configFieldCount: configFields?.length ?? 0,
        outputFieldCount: outputFields?.length ?? 0,
      };
    }

    return transformedStep;
  });

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(plugin, null, 2),
      },
    ],
  };
}

export async function handleValidatePluginConfig(
  pluginRepo: PluginRepository,
  args: z.infer<typeof validatePluginConfigSchema>
) {
  const { plugin_type, step_slug, config, validation_mode = 'runtime' } = args;

  const step = pluginRepo.getStep(plugin_type, step_slug);

  if (!step) {
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            valid: false,
            errors: [
              {
                field: 'plugin',
                message: `Plugin step not found: ${plugin_type}/${step_slug}`,
                severity: 'error',
              },
            ],
            warnings: [],
          }, null, 2),
        },
      ],
    };
  }

  const result = validateConfig(step, config, validation_mode);

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}

function generateStepExamples(pluginType: string, step: any): any[] {
  const examples: any[] = [];

  if (pluginType === 'web3' && step.slug === 'check-balance') {
    examples.push({
      name: 'Check Ethereum Balance',
      description: 'Check ETH balance of a wallet on Ethereum mainnet',
      config: {
        network: 'ethereum',
        address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb3',
      },
    });
  }

  if (pluginType === 'discord' && step.slug === 'send-message') {
    examples.push({
      name: 'Send Simple Message',
      description: 'Send a text message to Discord',
      config: {
        discordMessage: 'Hello from KeeperHub!',
      },
    });
  }

  if (pluginType === 'web3' && step.slug === 'transfer-funds') {
    examples.push({
      name: 'Transfer 0.1 ETH',
      description: 'Transfer ETH to a recipient address',
      config: {
        network: 'ethereum',
        amount: '0.1',
        recipientAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb3',
      },
    });
  }

  return examples;
}

interface ValidationResult {
  valid: boolean;
  errors: Array<{
    field: string;
    message: string;
    severity: 'error' | 'warning';
  }>;
  warnings: Array<{
    field: string;
    message: string;
  }>;
  suggestions?: Array<{
    field: string;
    suggestion: string;
  }>;
}

function validateConfig(
  step: any,
  config: Record<string, any>,
  validationMode: string
): ValidationResult {
  const errors: any[] = [];
  const warnings: any[] = [];
  const suggestions: any[] = [];

  for (const field of step.configFields) {
    const value = config[field.key];

    if (field.required && (value === undefined || value === null || value === '')) {
      errors.push({
        field: field.key,
        message: `Required field '${field.label}' is missing`,
        severity: 'error',
      });
      continue;
    }

    if (value === undefined || value === null) {
      continue;
    }

    if (field.key === 'address' || field.key === 'contractAddress' || field.key === 'recipientAddress') {
      if (typeof value === 'string' && !value.match(/^(0x[a-fA-F0-9]{40}|\{\{.+\}\})$/)) {
        errors.push({
          field: field.key,
          message: `Invalid Ethereum address format. Expected 0x followed by 40 hex characters or a template variable`,
          severity: 'error',
        });
      }
    }

    if (field.key === 'amount') {
      const numValue = parseFloat(value);
      if (isNaN(numValue)) {
        if (!value.toString().match(/^\{\{.+\}\}$/)) {
          errors.push({
            field: field.key,
            message: `Invalid amount. Must be a number or template variable`,
            severity: 'error',
          });
        }
      } else if (numValue < 0) {
        errors.push({
          field: field.key,
          message: `Amount must be positive`,
          severity: 'error',
        });
      } else if (numValue < 0.01 && field.key === 'amount') {
        warnings.push({
          field: field.key,
          message: `Very small amount (${numValue}). Ensure this is intentional and covers gas costs`,
        });
      }
    }

    if (field.key === 'webhookUrl') {
      if (typeof value === 'string' && !value.startsWith('https://discord.com/api/webhooks/')) {
        errors.push({
          field: field.key,
          message: `Discord webhook URL must start with 'https://discord.com/api/webhooks/'`,
          severity: 'error',
        });
      }
    }

    if (field.key === 'to' || field.key === 'from') {
      if (typeof value === 'string' && !value.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
        if (!value.match(/^\{\{.+\}\}$/)) {
          errors.push({
            field: field.key,
            message: `Invalid email format`,
            severity: 'error',
          });
        }
      }
    }

    if (field.key === 'url') {
      if (typeof value === 'string' && !value.match(/^https?:\/\/.+/)) {
        if (!value.match(/^\{\{.+\}\}$/)) {
          errors.push({
            field: field.key,
            message: `URL must start with http:// or https://`,
            severity: 'error',
          });
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    suggestions: suggestions.length > 0 ? suggestions : undefined,
  };
}
