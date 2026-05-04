import { z } from 'zod';

export const listActionSchemasSchema = z.object({
  category: z.string().optional().describe('Filter by category to get full schema (e.g., "web3", "discord", "sendgrid", "webhook", "system")'),
  include_full_schemas: z.boolean().optional().default(false).describe('Include full field definitions (default: false, returns action names/descriptions only)'),
});

const ACTION_SCHEMAS = {
  system: {
    category: 'System',
    description: 'Built-in system actions',
    actions: {
      'Condition': {
        actionType: 'Condition',
        description: 'Conditional gate - only continues to connected nodes if condition evaluates to true. For if/else logic, create TWO separate Condition nodes from the same source: one with the condition (e.g., balance < 1) and one with the inverse (e.g., balance >= 1), each leading to different actions.',
        requiredFields: {
          condition: 'string - Expression using {{@nodeId:Label.field}} syntax, e.g., "{{@check-balance:Check Balance.balance}} < 0.1"',
        },
        optionalFields: {},
        behavior: 'GATE (not branch) - execution only continues if condition is TRUE. No false branch exists.',
        example: {
          description: 'If/else pattern for balance check with two parallel conditions',
          nodes: [
            { id: 'condition-low', config: { actionType: 'Condition', condition: '{{@check-balance:Check Balance.balance}} < 1' }, label: 'Balance < 1 ETH' },
            { id: 'condition-ok', config: { actionType: 'Condition', condition: '{{@check-balance:Check Balance.balance}} >= 1' }, label: 'Balance >= 1 ETH' },
          ],
          edges: [
            { id: 'e1', source: 'check-balance', target: 'condition-low' },
            { id: 'e2', source: 'check-balance', target: 'condition-ok' },
            { id: 'e3', source: 'condition-low', target: 'action-on-true' },
            { id: 'e4', source: 'condition-ok', target: 'action-on-false' },
          ],
          note: 'Both conditions receive output from check-balance. Each acts as a gate - only passes through if its condition is true.',
        },
      },
      'HTTP Request': {
        actionType: 'HTTP Request',
        description: 'Make HTTP requests to external APIs',
        requiredFields: {
          endpoint: 'string - Full URL to call',
          httpMethod: 'string - GET, POST, PUT, DELETE, or PATCH',
        },
        optionalFields: {
          httpHeaders: 'string - JSON object of headers',
          httpBody: 'string - JSON request body',
        },
      },
      'Database Query': {
        actionType: 'Database Query',
        description: 'Execute database queries',
        requiredFields: {
          integrationId: 'string - ID of the database integration',
          query: 'string - SQL query to execute',
        },
        optionalFields: {},
      },
    },
  },
  web3: {
    category: 'Web3',
    description: 'Blockchain and cryptocurrency actions',
    actions: {
      'web3/check-balance': {
        actionType: 'web3/check-balance',
        description: 'Check ETH balance of a wallet address',
        requiredFields: {
          network: 'string - Chain ID (e.g., "1" for mainnet, "11155111" for sepolia)',
          address: 'string - Ethereum wallet address to check',
        },
        optionalFields: {},
        outputFields: {
          balance: 'string - Balance in ETH',
          balanceWei: 'string - Balance in Wei',
        },
      },
      'web3/check-token-balance': {
        actionType: 'web3/check-token-balance',
        description: 'Check ERC-20 token balance',
        requiredFields: {
          network: 'string - Chain ID',
          address: 'string - Wallet address',
          tokenAddress: 'string - Token contract address',
        },
        optionalFields: {},
      },
      'web3/transfer-funds': {
        actionType: 'web3/transfer-funds',
        description: 'Transfer ETH to another address',
        requiredFields: {
          network: 'string - Chain ID',
          toAddress: 'string - Recipient address',
          amount: 'string - Amount in ETH',
          walletId: 'string - ID of the wallet integration to use',
        },
        optionalFields: {},
      },
      'web3/transfer-token': {
        actionType: 'web3/transfer-token',
        description: 'Transfer ERC-20 tokens',
        requiredFields: {
          network: 'string - Chain ID',
          toAddress: 'string - Recipient address',
          tokenAddress: 'string - Token contract address',
          amount: 'string - Amount to transfer',
          walletId: 'string - ID of the wallet integration',
        },
        optionalFields: {},
      },
      'web3/read-contract': {
        actionType: 'web3/read-contract',
        description: 'Read data from a smart contract',
        requiredFields: {
          network: 'string - Chain ID',
          contractAddress: 'string - Contract address',
          functionName: 'string - Function to call',
        },
        optionalFields: {
          functionArgs: 'string - JSON array of function arguments',
          abi: 'string - Contract ABI JSON (optional if contract is verified)',
        },
      },
      'web3/write-contract': {
        actionType: 'web3/write-contract',
        description: 'Write to a smart contract (execute transaction)',
        requiredFields: {
          network: 'string - Chain ID',
          contractAddress: 'string - Contract address',
          functionName: 'string - Function to call',
          walletId: 'string - ID of the wallet integration',
        },
        optionalFields: {
          functionArgs: 'string - JSON array of function arguments',
          abi: 'string - Contract ABI JSON',
          value: 'string - ETH value to send with transaction',
        },
      },
    },
  },
  webhook: {
    category: 'Webhook',
    description: 'Send HTTP webhooks to external services',
    actions: {
      'webhook/send-webhook': {
        actionType: 'webhook/send-webhook',
        description: 'Send a webhook request',
        requiredFields: {
          webhookUrl: 'string - Full URL to send webhook to',
          webhookMethod: 'string - GET, POST, PUT, DELETE, or PATCH',
        },
        optionalFields: {
          webhookHeaders: 'string - JSON object of headers',
          webhookPayload: 'string - JSON request body',
        },
      },
    },
  },
  discord: {
    category: 'Discord',
    description: 'Discord messaging integration',
    actions: {
      'discord/send-message': {
        actionType: 'discord/send-message',
        description: 'Send a message to a Discord channel',
        requiredFields: {
          integrationId: 'string - ID of the Discord integration (from integrations list)',
          discordMessage: 'string - Message content to send',
        },
        optionalFields: {},
      },
    },
  },
  sendgrid: {
    category: 'Email (SendGrid)',
    description: 'Send emails via SendGrid',
    actions: {
      'sendgrid/send-email': {
        actionType: 'sendgrid/send-email',
        description: 'Send an email via SendGrid',
        requiredFields: {
          emailTo: 'string - Recipient email address',
          emailSubject: 'string - Email subject',
          emailBody: 'string - Email body (HTML supported)',
        },
        optionalFields: {
          integrationId: 'string - ID of the SendGrid integration (optional - uses KeeperHub default if not provided)',
        },
      },
    },
  },
};

const TRIGGER_SCHEMAS = {
  Manual: {
    triggerType: 'Manual',
    description: 'Manually triggered workflow',
    requiredFields: {},
    optionalFields: {},
  },
  Schedule: {
    triggerType: 'Schedule',
    description: 'Time-based scheduled trigger',
    requiredFields: {
      scheduleCron: 'string - Cron expression (e.g., "*/5 * * * *" for every 5 minutes)',
    },
    optionalFields: {
      scheduleTimezone: 'string - Timezone (e.g., "America/New_York")',
    },
  },
  Webhook: {
    triggerType: 'Webhook',
    description: 'HTTP webhook trigger - workflow is triggered by incoming HTTP request',
    requiredFields: {},
    optionalFields: {
      webhookSchema: 'string - JSON schema for expected payload',
      webhookMockRequest: 'string - Sample JSON payload for testing',
    },
  },
  Event: {
    triggerType: 'Event',
    description: 'Blockchain event trigger - listens for smart contract events',
    requiredFields: {
      network: 'string - Chain ID to listen on (e.g., "11155111" for Sepolia)',
      contractAddress: 'string - Contract address to watch',
      contractABI: 'string - Contract ABI JSON for event parsing',
      eventName: 'string - Event name to listen for, or "*" for all events',
    },
    optionalFields: {},
  },
};

const NODE_STRUCTURE_EXAMPLE = {
  id: 'unique-node-id',
  type: 'action',
  position: { x: 350, y: 200 },
  data: {
    label: 'Node Label',
    description: 'What this node does',
    type: 'action',
    config: {
      actionType: 'web3/check-balance',
      network: '11155111',
      address: '0x...',
    },
    status: 'idle',
  },
};

const EDGE_STRUCTURE_EXAMPLE = {
  id: 'edge-1',
  source: 'source-node-id',
  target: 'target-node-id',
  // NOTE: Do NOT use sourceHandle or targetHandle - KeeperHub nodes use simple handles without IDs
};

/**
 * Creates a summary of actions (actionType + description only) for a category.
 */
function summarizeActions(actions: Record<string, any>): Record<string, string> {
  const summary: Record<string, string> = {};
  for (const [actionType, schema] of Object.entries(actions)) {
    summary[actionType] = schema.description;
  }
  return summary;
}

/**
 * Creates a summary of triggers (triggerType + description only).
 */
function summarizeTriggers(triggers: Record<string, any>): Record<string, string> {
  const summary: Record<string, string> = {};
  for (const [triggerType, schema] of Object.entries(triggers)) {
    summary[triggerType] = schema.description;
  }
  return summary;
}

export async function handleListActionSchemas(
  args: z.infer<typeof listActionSchemasSchema>
) {
  let result: Record<string, unknown> = {};
  const includeFullSchemas = args.include_full_schemas ?? false;

  if (args.category) {
    // When category specified, always return full schema for that category
    const category = args.category.toLowerCase();
    if (category in ACTION_SCHEMAS) {
      result = {
        actions: { [category]: ACTION_SCHEMAS[category as keyof typeof ACTION_SCHEMAS] },
      };
    } else {
      result = {
        error: `Unknown category: ${args.category}`,
        availableCategories: Object.keys(ACTION_SCHEMAS),
      };
    }
  } else if (includeFullSchemas) {
    // Full schemas requested
    result = {
      actions: ACTION_SCHEMAS,
      triggers: TRIGGER_SCHEMAS,
      nodeStructure: NODE_STRUCTURE_EXAMPLE,
      edgeStructure: EDGE_STRUCTURE_EXAMPLE,
      tips: [
        'actionType must match exactly (e.g., "web3/check-balance", not "Get Wallet Balance")',
        'integrationId is required for discord and sendgrid actions - get from integrations list',
        'Use {{@nodeId:Label.field}} syntax to reference outputs from previous nodes',
        'network should be chain ID as string (e.g., "1" for mainnet, "11155111" for sepolia)',
        'Edges only need id, source, and target - do NOT use sourceHandle or targetHandle',
        'TRIGGER FIELDS: Use "scheduleCron" (not "schedule"), "network" and "contractAddress" (not "eventNetwork"/"eventAddress")',
        'NODE POSITIONS: Positions are optional - nodes will be auto-laid out horizontally (left-to-right) based on edge connections',
        'CONDITION NODES: Act as gates, NOT branches. For if/else logic, create TWO Condition nodes from the same source with opposite conditions (e.g., "balance < 1" and "balance >= 1"), each leading to different actions.',
      ],
    };
  } else {
    // Default: return summary only (action names + descriptions)
    const actionsSummary: Record<string, { category: string; description: string; actions: Record<string, string> }> = {};
    for (const [key, value] of Object.entries(ACTION_SCHEMAS)) {
      actionsSummary[key] = {
        category: value.category,
        description: value.description,
        actions: summarizeActions(value.actions),
      };
    }

    result = {
      actions: actionsSummary,
      triggers: summarizeTriggers(TRIGGER_SCHEMAS),
      tips: [
        'Use category parameter to get full schema for a specific category (e.g., category: "web3")',
        'Use include_full_schemas: true to get all field definitions',
      ],
    };
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
