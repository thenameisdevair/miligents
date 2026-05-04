import { z } from 'zod';
import type { KeeperHubClient } from '../client/keeperhub.js';
import type { IntegrationType } from '../types/index.js';

const integrationTypes = [
  'ai-gateway',
  'clerk',
  'database',
  'discord',
  'linear',
  'resend',
  'sendgrid',
  'slack',
  'v0',
  'web3',
  'webflow',
  'webhook',
] as const;

export const listIntegrationsSchema = z.object({
  type: z
    .enum(integrationTypes)
    .optional()
    .describe('Filter by integration type (e.g., "web3" for wallet integrations)'),
});

export const getWalletIntegrationSchema = z.object({});

export async function handleListIntegrations(
  client: KeeperHubClient,
  args: z.infer<typeof listIntegrationsSchema>
) {
  const integrations = await client.listIntegrations({
    type: args.type as IntegrationType | undefined,
  });

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(
          {
            integrations,
            hint: 'Use the id field as integrationId in workflow nodes (e.g., web3/write-contract). Use get_wallet_integration to quickly find your web3 wallet integration.',
          },
          null,
          2
        ),
      },
    ],
  };
}

export async function handleGetWalletIntegration(client: KeeperHubClient) {
  const integrations = await client.listIntegrations({ type: 'web3' });

  if (integrations.length === 0) {
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              error: 'No wallet integration found',
              message:
                'No web3 wallet integration is configured for this organization. Please set up a wallet integration in the KeeperHub dashboard first.',
            },
            null,
            2
          ),
        },
      ],
    };
  }

  // Return the first (and typically only) wallet integration
  const wallet = integrations[0];

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(
          {
            integrationId: wallet.id,
            name: wallet.name,
            type: wallet.type,
            isManaged: wallet.isManaged,
            createdAt: wallet.createdAt,
            updatedAt: wallet.updatedAt,
            hint: 'Use this integrationId when creating web3/write-contract or web3/transfer-funds workflow nodes.',
          },
          null,
          2
        ),
      },
    ],
  };
}
