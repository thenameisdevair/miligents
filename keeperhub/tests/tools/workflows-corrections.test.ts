import { describe, it, expect, vi } from 'vitest';
import { handleCreateWorkflow, handleUpdateWorkflow } from '../../src/tools/workflows.js';
import type { KeeperHubClient } from '../../src/client/keeperhub.js';

/**
 * Tests for field name auto-correction, node.type auto-correction,
 * and edge validation in workflow handlers.
 *
 * Private helpers (normalizeNodeConfigs, ensureNodeDataFields, validateConditionNodes)
 * are tested through their effects on handleCreateWorkflow / handleUpdateWorkflow.
 */

// Mock client that captures the params passed to createWorkflow/updateWorkflow
function mockClient(): KeeperHubClient & { lastParams: unknown } {
  const client = {
    lastParams: null as unknown,
    createWorkflow: vi.fn(async (params: unknown) => {
      client.lastParams = params;
      return {
        id: 'wf-test',
        name: 'test',
        organizationId: 'org-1',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
        ...(params as Record<string, unknown>),
      };
    }),
    updateWorkflow: vi.fn(async (params: unknown) => {
      client.lastParams = params;
      return {
        id: 'wf-test',
        name: 'test',
        organizationId: 'org-1',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
        ...(params as Record<string, unknown>),
      };
    }),
  } as unknown as KeeperHubClient & { lastParams: unknown };
  return client;
}

// ────────────────────────────────────────────
// Phase 1B: node.type auto-correction
// ────────────────────────────────────────────
describe('node.type auto-correction', () => {
  it('corrects node.type from actionType string to "action"', async () => {
    const client = mockClient();
    const result = await handleCreateWorkflow(client, {
      name: 'test',
      nodes: [
        {
          id: 'trigger-1',
          type: 'trigger',
          data: { label: 'Trigger', config: { triggerType: 'Manual' } },
        },
        {
          id: 'read-1',
          // Common mistake: using actionType as node.type
          type: 'web3/read-contract',
          data: {
            label: 'Read Contract',
            config: { actionType: 'web3/read-contract', network: '1', contractAddress: '0x123', abiFunction: 'balanceOf' },
          },
        },
      ],
      edges: [{ id: 'e1', source: 'trigger-1', target: 'read-1' }],
    });

    const text = result.content[0].text;
    expect(text).toContain('Auto-corrected');
    expect(text).toContain('node.type');
    expect(text).toContain('"web3/read-contract"');
    expect(text).toContain('"action"');

    // Verify the node was actually corrected in what was sent to the API
    const params = (client as unknown as { lastParams: { nodes: Array<{ id: string; type: string }> } }).lastParams;
    const readNode = params.nodes.find((n: { id: string }) => n.id === 'read-1');
    expect(readNode?.type).toBe('action');
  });

  it('corrects node.type to "trigger" when triggerType is present', async () => {
    const client = mockClient();
    const result = await handleCreateWorkflow(client, {
      name: 'test',
      nodes: [
        {
          id: 'trigger-1',
          type: 'schedule',  // Wrong - should be "trigger"
          data: { label: 'My Trigger', config: { triggerType: 'Schedule', scheduleCron: '* * * * *' } },
        },
      ],
      edges: [],
    });

    const text = result.content[0].text;
    expect(text).toContain('Auto-corrected');

    const params = (client as unknown as { lastParams: { nodes: Array<{ id: string; type: string }> } }).lastParams;
    const triggerNode = params.nodes.find((n: { id: string }) => n.id === 'trigger-1');
    expect(triggerNode?.type).toBe('trigger');
  });

  it('leaves correct node.type values unchanged', async () => {
    const client = mockClient();
    const result = await handleCreateWorkflow(client, {
      name: 'test',
      nodes: [
        {
          id: 'trigger-1',
          type: 'trigger',
          data: { label: 'Trigger', config: { triggerType: 'Manual' } },
        },
        {
          id: 'action-1',
          type: 'action',
          data: { label: 'Check', config: { actionType: 'web3/check-balance', network: '1', address: '0x123' } },
        },
      ],
      edges: [{ id: 'e1', source: 'trigger-1', target: 'action-1' }],
    });

    const text = result.content[0].text;
    // Should NOT mention corrections since types are already correct
    expect(text).not.toContain('Auto-corrected');
  });
});

// ────────────────────────────────────────────
// Phase 1C: Field name auto-corrections
// ────────────────────────────────────────────
describe('action field name auto-corrections', () => {
  it('corrects toAddress → recipientAddress for web3/transfer-funds', async () => {
    const client = mockClient();
    const result = await handleCreateWorkflow(client, {
      name: 'test',
      nodes: [
        {
          id: 'trigger-1',
          type: 'trigger',
          data: { label: 'Trigger', config: { triggerType: 'Manual' } },
        },
        {
          id: 'transfer-1',
          type: 'action',
          data: {
            label: 'Transfer',
            config: {
              actionType: 'web3/transfer-funds',
              network: '1',
              toAddress: '0xRecipient',  // Wrong field name
              amount: '1.0',
              walletId: 'w1',
            },
          },
        },
      ],
      edges: [{ id: 'e1', source: 'trigger-1', target: 'transfer-1' }],
    });

    const text = result.content[0].text;
    expect(text).toContain('Auto-corrected');
    expect(text).toContain('"toAddress"');
    expect(text).toContain('"recipientAddress"');

    const params = (client as unknown as { lastParams: { nodes: Array<{ id: string; data: { config: Record<string, unknown> } }> } }).lastParams;
    const transferNode = params.nodes.find((n: { id: string }) => n.id === 'transfer-1');
    expect(transferNode?.data.config.recipientAddress).toBe('0xRecipient');
    expect(transferNode?.data.config.toAddress).toBeUndefined();
  });

  it('corrects tokenAddress → tokenConfig for web3/check-token-balance', async () => {
    const client = mockClient();
    const result = await handleCreateWorkflow(client, {
      name: 'test',
      nodes: [
        {
          id: 'trigger-1',
          type: 'trigger',
          data: { label: 'Trigger', config: { triggerType: 'Manual' } },
        },
        {
          id: 'balance-1',
          type: 'action',
          data: {
            label: 'Check Token Balance',
            config: {
              actionType: 'web3/check-token-balance',
              network: '1',
              address: '0xAddr',
              tokenAddress: '0xToken',  // Wrong field name
            },
          },
        },
      ],
      edges: [{ id: 'e1', source: 'trigger-1', target: 'balance-1' }],
    });

    const text = result.content[0].text;
    expect(text).toContain('"tokenAddress"');
    expect(text).toContain('"tokenConfig"');

    const params = (client as unknown as { lastParams: { nodes: Array<{ id: string; data: { config: Record<string, unknown> } }> } }).lastParams;
    const balanceNode = params.nodes.find((n: { id: string }) => n.id === 'balance-1');
    expect(balanceNode?.data.config.tokenConfig).toBe('0xToken');
    expect(balanceNode?.data.config.tokenAddress).toBeUndefined();
  });

  it('corrects functionName → abiFunction for web3/read-contract', async () => {
    const client = mockClient();
    const result = await handleCreateWorkflow(client, {
      name: 'test',
      nodes: [
        {
          id: 'trigger-1',
          type: 'trigger',
          data: { label: 'Trigger', config: { triggerType: 'Manual' } },
        },
        {
          id: 'read-1',
          type: 'action',
          data: {
            label: 'Read Contract',
            config: {
              actionType: 'web3/read-contract',
              network: '1',
              contractAddress: '0xContract',
              functionName: 'balanceOf',  // Wrong field name
            },
          },
        },
      ],
      edges: [{ id: 'e1', source: 'trigger-1', target: 'read-1' }],
    });

    const text = result.content[0].text;
    expect(text).toContain('"functionName"');
    expect(text).toContain('"abiFunction"');

    const params = (client as unknown as { lastParams: { nodes: Array<{ id: string; data: { config: Record<string, unknown> } }> } }).lastParams;
    const readNode = params.nodes.find((n: { id: string }) => n.id === 'read-1');
    expect(readNode?.data.config.abiFunction).toBe('balanceOf');
    expect(readNode?.data.config.functionName).toBeUndefined();
  });

  it('corrects functionName → abiFunction for web3/write-contract', async () => {
    const client = mockClient();
    const result = await handleCreateWorkflow(client, {
      name: 'test',
      nodes: [
        {
          id: 'trigger-1',
          type: 'trigger',
          data: { label: 'Trigger', config: { triggerType: 'Manual' } },
        },
        {
          id: 'write-1',
          type: 'action',
          data: {
            label: 'Write Contract',
            config: {
              actionType: 'web3/write-contract',
              network: '1',
              contractAddress: '0xContract',
              functionName: 'transfer',  // Wrong field name
              walletId: 'w1',
            },
          },
        },
      ],
      edges: [{ id: 'e1', source: 'trigger-1', target: 'write-1' }],
    });

    const text = result.content[0].text;
    expect(text).toContain('"functionName"');
    expect(text).toContain('"abiFunction"');
  });

  it('corrects query → dbQuery for Database Query', async () => {
    const client = mockClient();
    const result = await handleCreateWorkflow(client, {
      name: 'test',
      nodes: [
        {
          id: 'trigger-1',
          type: 'trigger',
          data: { label: 'Trigger', config: { triggerType: 'Manual' } },
        },
        {
          id: 'db-1',
          type: 'action',
          data: {
            label: 'Query DB',
            config: {
              actionType: 'Database Query',
              integrationId: 'int-1',
              query: 'SELECT * FROM users',  // Wrong field name
            },
          },
        },
      ],
      edges: [{ id: 'e1', source: 'trigger-1', target: 'db-1' }],
    });

    const text = result.content[0].text;
    expect(text).toContain('"query"');
    expect(text).toContain('"dbQuery"');

    const params = (client as unknown as { lastParams: { nodes: Array<{ id: string; data: { config: Record<string, unknown> } }> } }).lastParams;
    const dbNode = params.nodes.find((n: { id: string }) => n.id === 'db-1');
    expect(dbNode?.data.config.dbQuery).toBe('SELECT * FROM users');
    expect(dbNode?.data.config.query).toBeUndefined();
  });

  it('corrects tokenAddress → tokenConfig for web3/transfer-token', async () => {
    const client = mockClient();
    const result = await handleCreateWorkflow(client, {
      name: 'test',
      nodes: [
        {
          id: 'trigger-1',
          type: 'trigger',
          data: { label: 'Trigger', config: { triggerType: 'Manual' } },
        },
        {
          id: 'transfer-1',
          type: 'action',
          data: {
            label: 'Transfer Token',
            config: {
              actionType: 'web3/transfer-token',
              network: '1',
              toAddress: '0xRecipient',
              tokenAddress: '0xToken',  // Wrong field name
              amount: '100',
              walletId: 'w1',
            },
          },
        },
      ],
      edges: [{ id: 'e1', source: 'trigger-1', target: 'transfer-1' }],
    });

    const text = result.content[0].text;
    // Both toAddress and tokenAddress should be corrected
    expect(text).toContain('"toAddress"');
    expect(text).toContain('"recipientAddress"');
    expect(text).toContain('"tokenAddress"');
    expect(text).toContain('"tokenConfig"');
  });

  it('does not correct fields that are already correct', async () => {
    const client = mockClient();
    const result = await handleCreateWorkflow(client, {
      name: 'test',
      nodes: [
        {
          id: 'trigger-1',
          type: 'trigger',
          data: { label: 'Trigger', config: { triggerType: 'Manual' } },
        },
        {
          id: 'read-1',
          type: 'action',
          data: {
            label: 'Read Contract',
            config: {
              actionType: 'web3/read-contract',
              network: '1',
              contractAddress: '0xContract',
              abiFunction: 'balanceOf',  // Already correct
            },
          },
        },
      ],
      edges: [{ id: 'e1', source: 'trigger-1', target: 'read-1' }],
    });

    const text = result.content[0].text;
    expect(text).not.toContain('Auto-corrected');
  });
});

// ────────────────────────────────────────────
// Phase 1C: Combined node.type + field corrections
// ────────────────────────────────────────────
describe('combined corrections', () => {
  it('corrects both node.type and field names in one pass', async () => {
    const client = mockClient();
    const result = await handleCreateWorkflow(client, {
      name: 'test',
      nodes: [
        {
          id: 'trigger-1',
          type: 'trigger',
          data: { label: 'Trigger', config: { triggerType: 'Manual' } },
        },
        {
          id: 'read-1',
          type: 'web3/read-contract',  // Wrong node.type
          data: {
            label: 'Read',
            config: {
              actionType: 'web3/read-contract',
              network: '1',
              contractAddress: '0x123',
              functionName: 'balanceOf',  // Wrong field name
            },
          },
        },
      ],
      edges: [{ id: 'e1', source: 'trigger-1', target: 'read-1' }],
    });

    const text = result.content[0].text;
    expect(text).toContain('Auto-corrected');
    // Both corrections should be reported
    expect(text).toContain('node.type');
    expect(text).toContain('"abiFunction"');
  });
});

// ────────────────────────────────────────────
// Condition node edge validation
// ────────────────────────────────────────────
describe('condition node edge validation', () => {
  it('rejects condition node with 2 edges but no true/false handles', async () => {
    const client = mockClient();
    const result = await handleCreateWorkflow(client, {
      name: 'test',
      nodes: [
        {
          id: 'trigger-1',
          type: 'trigger',
          data: { label: 'Trigger', config: { triggerType: 'Manual' } },
        },
        {
          id: 'cond-1',
          type: 'action',
          data: { label: 'Condition', config: { actionType: 'Condition', condition: 'true' } },
        },
        {
          id: 'a1',
          type: 'action',
          data: { label: 'A', config: { actionType: 'HTTP Request', endpoint: 'http://a', httpMethod: 'GET' } },
        },
        {
          id: 'a2',
          type: 'action',
          data: { label: 'B', config: { actionType: 'HTTP Request', endpoint: 'http://b', httpMethod: 'GET' } },
        },
      ],
      edges: [
        { id: 'e1', source: 'trigger-1', target: 'cond-1' },
        { id: 'e2', source: 'cond-1', target: 'a1' },  // No sourceHandle
        { id: 'e3', source: 'cond-1', target: 'a2' },  // No sourceHandle
      ],
    });

    const text = result.content[0].text;
    expect(text).toContain('ERROR');
    expect(text).toContain('Condition node');
  });

  it('accepts condition node with proper true/false sourceHandle edges', async () => {
    const client = mockClient();
    const result = await handleCreateWorkflow(client, {
      name: 'test',
      nodes: [
        {
          id: 'trigger-1',
          type: 'trigger',
          data: { label: 'Trigger', config: { triggerType: 'Manual' } },
        },
        {
          id: 'cond-1',
          type: 'action',
          data: { label: 'Condition', config: { actionType: 'Condition', condition: 'true' } },
        },
        {
          id: 'a1',
          type: 'action',
          data: { label: 'A', config: { actionType: 'HTTP Request', endpoint: 'http://a', httpMethod: 'GET' } },
        },
        {
          id: 'a2',
          type: 'action',
          data: { label: 'B', config: { actionType: 'HTTP Request', endpoint: 'http://b', httpMethod: 'GET' } },
        },
      ],
      edges: [
        { id: 'e1', source: 'trigger-1', target: 'cond-1' },
        { id: 'e2', source: 'cond-1', target: 'a1', sourceHandle: 'true' },
        { id: 'e3', source: 'cond-1', target: 'a2', sourceHandle: 'false' },
      ],
    });

    const text = result.content[0].text;
    expect(text).not.toContain('ERROR');
  });
});

// ────────────────────────────────────────────
// updateWorkflow handler applies same corrections
// ────────────────────────────────────────────
describe('updateWorkflow corrections', () => {
  it('applies field name corrections on update too', async () => {
    const client = mockClient();
    const result = await handleUpdateWorkflow(client, {
      workflow_id: 'wf-1',
      nodes: [
        {
          id: 'trigger-1',
          type: 'trigger',
          data: { label: 'Trigger', config: { triggerType: 'Manual' } },
        },
        {
          id: 'read-1',
          type: 'action',
          data: {
            label: 'Read',
            config: {
              actionType: 'web3/read-contract',
              network: '1',
              contractAddress: '0x123',
              functionName: 'totalSupply',  // Wrong
            },
          },
        },
      ],
      edges: [{ id: 'e1', source: 'trigger-1', target: 'read-1' }],
    });

    const text = result.content[0].text;
    expect(text).toContain('Auto-corrected');
    expect(text).toContain('"functionName"');
    expect(text).toContain('"abiFunction"');
  });
});

// ────────────────────────────────────────────
// data.type field is set correctly
// ────────────────────────────────────────────
describe('data.type field population', () => {
  it('sets data.type to match node.type', async () => {
    const client = mockClient();
    await handleCreateWorkflow(client, {
      name: 'test',
      nodes: [
        {
          id: 'trigger-1',
          type: 'trigger',
          data: { label: 'Trigger', config: { triggerType: 'Manual' } },
          // data.type is missing — should be populated
        },
        {
          id: 'action-1',
          type: 'action',
          data: { label: 'Check', config: { actionType: 'web3/check-balance', network: '1', address: '0x123' } },
        },
      ],
      edges: [{ id: 'e1', source: 'trigger-1', target: 'action-1' }],
    });

    const params = (client as unknown as { lastParams: { nodes: Array<{ id: string; type: string; data: Record<string, unknown> }> } }).lastParams;
    const trigger = params.nodes.find((n: { id: string }) => n.id === 'trigger-1');
    const action = params.nodes.find((n: { id: string }) => n.id === 'action-1');

    expect(trigger?.data.type).toBe('trigger');
    expect(action?.data.type).toBe('action');
  });
});
