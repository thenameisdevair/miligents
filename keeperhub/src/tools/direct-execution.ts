import { z } from 'zod';
import type { KeeperHubClient } from '../client/keeperhub.js';

export const executeTransferSchema = z.object({
  network: z
    .string()
    .describe(
      'Blockchain network (e.g., "ethereum", "sepolia", "polygon", "base")'
    ),
  recipient_address: z
    .string()
    .describe('Destination wallet address (0x...)'),
  amount: z
    .string()
    .describe(
      'Amount to send in human-readable units (e.g., "0.1" for 0.1 ETH)'
    ),
  token_address: z
    .string()
    .optional()
    .describe(
      'ERC-20 token contract address. Omit for native ETH/MATIC/etc.'
    ),
  token_config: z
    .string()
    .optional()
    .describe(
      'JSON string with token config (decimals, symbol) for non-standard tokens'
    ),
});

export const executeContractCallSchema = z.object({
  contract_address: z
    .string()
    .describe('Target smart contract address (0x...)'),
  network: z
    .string()
    .describe(
      'Blockchain network (e.g., "ethereum", "sepolia", "polygon", "base")'
    ),
  function_name: z
    .string()
    .describe(
      'Contract function to call (e.g., "balanceOf", "transfer", "approve")'
    ),
  function_args: z
    .string()
    .optional()
    .describe(
      'Function arguments as JSON array string (e.g., \'["0xAddress", "1000"]\')'
    ),
  abi: z
    .string()
    .optional()
    .describe(
      'Contract ABI as JSON string. Auto-fetched from block explorer if omitted.'
    ),
  value: z
    .string()
    .optional()
    .describe('ETH value to send with the call in wei (for payable functions)'),
  gas_limit_multiplier: z
    .string()
    .optional()
    .describe('Gas limit multiplier (e.g., "1.5" for 50% buffer)'),
});

export const executeCheckAndExecuteSchema = z.object({
  contract_address: z
    .string()
    .describe('Contract address to read for condition check (0x...)'),
  network: z
    .string()
    .describe(
      'Blockchain network (e.g., "ethereum", "sepolia", "polygon", "base")'
    ),
  function_name: z
    .string()
    .describe('Read function to call for condition evaluation'),
  function_args: z
    .string()
    .optional()
    .describe('Arguments for the read function as JSON array string'),
  abi: z
    .string()
    .optional()
    .describe('ABI for the read contract. Auto-fetched if omitted.'),
  condition: z.object({
    operator: z
      .enum(['eq', 'neq', 'gt', 'lt', 'gte', 'lte'])
      .describe('Comparison operator'),
    value: z
      .string()
      .describe('Target value to compare against (supports BigInt strings)'),
  }),
  action: z.object({
    contract_address: z
      .string()
      .describe('Contract address for the write action'),
    function_name: z.string().describe('Function to call if condition is met'),
    function_args: z
      .string()
      .optional()
      .describe('Arguments for the action function as JSON array string'),
    abi: z
      .string()
      .optional()
      .describe('ABI for the action contract. Auto-fetched if omitted.'),
    gas_limit_multiplier: z
      .string()
      .optional()
      .describe('Gas limit multiplier for the action transaction'),
  }),
});

export const getDirectExecutionStatusSchema = z.object({
  execution_id: z.string().describe('The execution ID returned from a direct execution call'),
});

type ToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

function jsonContent(data: unknown, isError = false): ToolResult {
  const result: ToolResult = {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
  if (isError) {
    result.isError = true;
  }
  return result;
}

function hasFailedStatus(data: unknown): boolean {
  return (
    typeof data === 'object' &&
    data !== null &&
    'status' in data &&
    (data as Record<string, unknown>).status === 'failed'
  );
}

export async function handleExecuteTransfer(
  client: KeeperHubClient,
  args: z.infer<typeof executeTransferSchema>
): Promise<ToolResult> {
  const result = await client.executeTransfer({
    network: args.network,
    recipientAddress: args.recipient_address,
    amount: args.amount,
    tokenAddress: args.token_address,
    tokenConfig: args.token_config,
  });
  return jsonContent(result, hasFailedStatus(result));
}

export async function handleExecuteContractCall(
  client: KeeperHubClient,
  args: z.infer<typeof executeContractCallSchema>
): Promise<ToolResult> {
  const result = await client.executeContractCall({
    contractAddress: args.contract_address,
    network: args.network,
    functionName: args.function_name,
    functionArgs: args.function_args,
    abi: args.abi,
    value: args.value,
    gasLimitMultiplier: args.gas_limit_multiplier,
  });
  return jsonContent(result, hasFailedStatus(result));
}

export async function handleExecuteCheckAndExecute(
  client: KeeperHubClient,
  args: z.infer<typeof executeCheckAndExecuteSchema>
): Promise<ToolResult> {
  const result = await client.executeCheckAndExecute({
    contractAddress: args.contract_address,
    network: args.network,
    functionName: args.function_name,
    functionArgs: args.function_args,
    abi: args.abi,
    condition: args.condition,
    action: {
      contractAddress: args.action.contract_address,
      functionName: args.action.function_name,
      functionArgs: args.action.function_args,
      abi: args.action.abi,
      gasLimitMultiplier: args.action.gas_limit_multiplier,
    },
  });
  return jsonContent(result, hasFailedStatus(result));
}

export async function handleGetDirectExecutionStatus(
  client: KeeperHubClient,
  args: z.infer<typeof getDirectExecutionStatusSchema>
): Promise<ToolResult> {
  const result = await client.getDirectExecutionStatus(args.execution_id);
  return jsonContent(result, hasFailedStatus(result));
}
