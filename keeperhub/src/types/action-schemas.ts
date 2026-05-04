/**
 * Action Schemas for KeeperHub Workflow Builder
 *
 * This file documents the expected config field names for each action type.
 * Use these schemas when creating workflows via the MCP to ensure correct field names.
 *
 * IMPORTANT: Field names must match exactly - the UI expects specific field names
 * and will not display values if the wrong field name is used.
 *
 * NODE STRUCTURE HIERARCHY:
 *   node.type:              MUST be "trigger" or "action" (NOT the action type string)
 *   data.type:              MUST match node.type
 *   data.config.actionType: The specific action (e.g., "web3/read-contract", "Condition")
 *   data.config.triggerType: The specific trigger (e.g., "Manual", "Schedule", "Event")
 *
 * Common mistake: setting node.type to "web3/read-contract" instead of "action".
 * The MCP will auto-correct this, but always use "trigger" or "action" for node.type.
 */

/**
 * System Actions (built-in, no plugin required)
 */
export interface ConditionConfig {
  actionType: "Condition";
  /** The condition expression - MUST be "condition", NOT "conditionExpression" */
  condition: string; // e.g., "{{@nodeId:Label.balance}} < 0.5"
  /** Optional structured condition config for complex rules */
  conditionConfig?: {
    group: {
      id: string;
      logic: "AND" | "OR";
      rules: Array<{
        id: string;
        leftOperand: string;
        operator: string;
        rightOperand: string;
      }>;
    };
  };
}

export interface HttpRequestConfig {
  actionType: "HTTP Request";
  endpoint: string;
  httpMethod: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  httpHeaders?: string; // JSON string
  httpBody?: string; // JSON string
}

export interface DatabaseQueryConfig {
  actionType: "Database Query";
  integrationId: string;
  /** The SQL query - MUST be "dbQuery", NOT "query" */
  dbQuery: string;
  /** Optional schema name */
  dbSchema?: string;
}

/**
 * Web3 Plugin Actions
 */
export interface CheckBalanceConfig {
  actionType: "web3/check-balance";
  network: string; // Chain ID as string, e.g., "1" for mainnet
  address: string; // Ethereum address
}

export interface CheckTokenBalanceConfig {
  actionType: "web3/check-token-balance";
  network: string;
  address: string;
  /** Token config - MUST be "tokenConfig", NOT "tokenAddress". JSON string format: {"mode":"custom","customToken":{"address":"0x...","symbol":"USDC"}} */
  tokenConfig: string;
}

export interface TransferFundsConfig {
  actionType: "web3/transfer-funds";
  network: string;
  /** Recipient address - MUST be "recipientAddress", NOT "toAddress" */
  recipientAddress: string;
  amount: string;
  walletId: string;
  gasLimitMultiplier?: string;
}

export interface TransferTokenConfig {
  actionType: "web3/transfer-token";
  network: string;
  /** Recipient address - MUST be "recipientAddress", NOT "toAddress" */
  recipientAddress: string;
  /** Token config - MUST be "tokenConfig", NOT "tokenAddress". JSON string format: {"mode":"custom","customToken":{"address":"0x...","symbol":"USDC"}} */
  tokenConfig: string;
  amount: string;
  walletId: string;
  gasLimitMultiplier?: string;
}

/**
 * Read contract config.
 * NOTE: The `result` output may be a string OR an array for multi-output functions
 * (e.g., ["353846984796182301"]). Avoid wrapping in Number() without checking type first.
 */
export interface ReadContractConfig {
  actionType: "web3/read-contract";
  network: string;
  contractAddress: string;
  /** ABI function selector - MUST be "abiFunction", NOT "functionName" */
  abiFunction: string;
  functionArgs?: string; // JSON array string
  abi?: string; // JSON string
}

export interface WriteContractConfig {
  actionType: "web3/write-contract";
  network: string;
  contractAddress: string;
  /** ABI function selector - MUST be "abiFunction", NOT "functionName" */
  abiFunction: string;
  functionArgs?: string;
  abi?: string;
  walletId: string;
  value?: string; // ETH value to send
}

/**
 * Webhook Plugin Actions
 */
export interface SendWebhookConfig {
  actionType: "webhook/send-webhook";
  webhookUrl: string;
  webhookMethod: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  webhookHeaders?: string; // JSON string, e.g., '{"Content-Type": "application/json"}'
  webhookPayload?: string; // JSON string
}

/**
 * Discord Plugin Actions
 */
export interface SendDiscordMessageConfig {
  actionType: "discord/send-message";
  integrationId: string;
  discordMessage: string;
}

/**
 * SendGrid Plugin Actions
 */
export interface SendEmailConfig {
  actionType: "sendgrid/send-email";
  integrationId?: string; // Optional - uses KeeperHub default if not provided
  emailTo: string;
  emailSubject: string;
  emailBody: string;
}

/**
 * Trigger Configuration
 */
export interface ManualTriggerConfig {
  triggerType: "Manual";
}

export interface ScheduleTriggerConfig {
  triggerType: "Schedule";
  /** Cron expression - MUST be "scheduleCron", NOT "schedule" */
  scheduleCron: string; // e.g., "*/5 * * * *" for every 5 minutes
  scheduleTimezone?: string; // e.g., "America/New_York"
}

export interface WebhookTriggerConfig {
  triggerType: "Webhook";
}

export interface EventTriggerConfig {
  triggerType: "Event";
  /** Chain ID - MUST be "network", NOT "eventNetwork" */
  network: string; // e.g., "11155111" for Sepolia
  /** Contract address - MUST be "contractAddress", NOT "eventAddress" */
  contractAddress: string; // Contract address to watch
  /** Contract ABI - required for event parsing */
  contractABI: string; // JSON string of the contract ABI
  /** Event name to listen for */
  eventName: string; // e.g., "Transfer", "*" for all events
}

/**
 * Union types for convenience
 */
/**
 * Code Plugin Actions
 */
export interface RunCodeConfig {
  actionType: "code/run-code";
  /** JavaScript code to execute */
  code: string;
  /** Execution timeout in milliseconds */
  timeout?: number;
  /**
   * Output fields: success (boolean), result (any), logs (string), error (string), line (number).
   * Downstream templates reference output via: {{@nodeId:Label.result}} or {{@nodeId:Label.result.yourField}}
   */
}

export type ActionConfig =
  | ConditionConfig
  | HttpRequestConfig
  | DatabaseQueryConfig
  | CheckBalanceConfig
  | CheckTokenBalanceConfig
  | TransferFundsConfig
  | TransferTokenConfig
  | ReadContractConfig
  | WriteContractConfig
  | SendWebhookConfig
  | SendDiscordMessageConfig
  | SendEmailConfig
  | RunCodeConfig;

export type TriggerConfig =
  | ManualTriggerConfig
  | ScheduleTriggerConfig
  | WebhookTriggerConfig
  | EventTriggerConfig;

/**
 * Common field name mistakes to avoid:
 *
 * WRONG                    CORRECT
 * -----                    -------
 * conditionExpression  ->  condition
 * url                  ->  webhookUrl (for webhook) or endpoint (for HTTP Request)
 * method               ->  webhookMethod (for webhook) or httpMethod (for HTTP Request)
 * headers              ->  webhookHeaders (for webhook) or httpHeaders (for HTTP Request)
 * body/payload         ->  webhookPayload (for webhook) or httpBody (for HTTP Request)
 * message              ->  discordMessage (for Discord)
 * to/subject/body      ->  emailTo/emailSubject/emailBody (for SendGrid)
 * chainId              ->  network (use string, not number)
 * query                ->  dbQuery (for Database Query)
 * toAddress            ->  recipientAddress (for transfer-funds and transfer-token)
 * tokenAddress         ->  tokenConfig (for check-token-balance and transfer-token)
 * functionName         ->  abiFunction (for read-contract and write-contract)
 *
 * TRIGGER FIELD NAMES (these are critical!):
 * WRONG                    CORRECT
 * -----                    -------
 * schedule             ->  scheduleCron (for Schedule trigger)
 * cron                 ->  scheduleCron (for Schedule trigger)
 * eventNetwork         ->  network (for Event trigger)
 * eventAddress         ->  contractAddress (for Event trigger)
 */

/**
 * Example: Creating a condition node with correct field names
 *
 * ```typescript
 * const conditionNode = {
 *   id: "condition-1",
 *   type: "action",
 *   data: {
 *     type: "action",
 *     label: "Check Balance",
 *     config: {
 *       actionType: "Condition",
 *       condition: "{{@check-balance:Check Balance.balance}} < 0.5", // NOT conditionExpression!
 *     },
 *   },
 *   position: { x: 0, y: 0 },
 * };
 * ```
 */

/**
 * Edge structure - sourceHandle rules:
 *
 * sourceHandle IS REQUIRED for Condition (if/else) and For Each nodes:
 *   - Condition nodes: use sourceHandle "true" or "false" to route if/else branches
 *   - For Each nodes: use sourceHandle "loop" (iteration body) or "done" (after completion)
 *
 * sourceHandle should be OMITTED for all other node types (simple sequential edges).
 *
 * ```typescript
 * // Simple edge (non-branching nodes):
 * const simpleEdge = { id: "e1", source: "node-1", target: "node-2" };
 *
 * // Condition true/false edges:
 * const trueEdge = { id: "e2", source: "condition-1", target: "action-a", sourceHandle: "true" };
 * const falseEdge = { id: "e3", source: "condition-1", target: "action-b", sourceHandle: "false" };
 *
 * // For Each loop/done edges:
 * const loopEdge = { id: "e4", source: "foreach-1", target: "loop-body", sourceHandle: "loop" };
 * const doneEdge = { id: "e5", source: "foreach-1", target: "after-loop", sourceHandle: "done" };
 * ```
 */
