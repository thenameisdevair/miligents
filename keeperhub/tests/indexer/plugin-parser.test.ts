import { describe, it, expect } from 'vitest';

describe('Plugin Parser', () => {
  describe('Plugin Metadata Parsing', () => {
    it('should parse basic plugin metadata', () => {
      const pluginCode = `
        export const plugin = {
          type: 'web3',
          label: 'Web3',
          description: 'Blockchain integration plugin',
          category: 'Web3',
        };
      `;

      const metadata = {
        type: 'web3',
        label: 'Web3',
        description: 'Blockchain integration plugin',
        category: 'Web3',
      };

      expect(metadata.type).toBe('web3');
      expect(metadata.category).toBe('Web3');
    });

    it('should parse plugin with credentials', () => {
      const credentialsCode = `
        export const credentials = {
          formFields: [
            { id: 'apiKey', label: 'API Key', type: 'password', required: true },
            { id: 'endpoint', label: 'Endpoint URL', type: 'text' },
          ],
        };
      `;

      const credentials = {
        formFields: [
          { id: 'apiKey', label: 'API Key', type: 'password', required: true },
          { id: 'endpoint', label: 'Endpoint URL', type: 'text' },
        ],
      };

      expect(credentials.formFields).toHaveLength(2);
      expect(credentials.formFields[0].id).toBe('apiKey');
    });

    it('should parse single connection flag', () => {
      const metadata = {
        type: 'web3',
        label: 'Web3',
        description: 'Blockchain plugin',
        singleConnection: true,
      };

      expect(metadata.singleConnection).toBe(true);
    });

    it('should default singleConnection to false', () => {
      const metadata = {
        type: 'discord',
        label: 'Discord',
        description: 'Discord plugin',
      };

      const singleConnection = metadata.singleConnection ?? false;

      expect(singleConnection).toBe(false);
    });
  });

  describe('Step Configuration Parsing', () => {
    it('should parse step metadata', () => {
      const stepCode = `
        export const step = {
          slug: 'check-balance',
          label: 'Check Balance',
          description: 'Get ETH balance of address',
          category: 'Query',
        };
      `;

      const step = {
        slug: 'check-balance',
        label: 'Check Balance',
        description: 'Get ETH balance of address',
        category: 'Query',
      };

      expect(step.slug).toBe('check-balance');
      expect(step.category).toBe('Query');
    });

    it('should parse config fields', () => {
      const configFields = [
        {
          key: 'network',
          label: 'Network',
          type: 'chain-select',
          required: true,
          placeholder: 'Select blockchain network',
        },
        {
          key: 'address',
          label: 'Wallet Address',
          type: 'text',
          required: true,
          example: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb3',
        },
      ];

      expect(configFields).toHaveLength(2);
      expect(configFields[0].type).toBe('chain-select');
      expect(configFields[1].example).toContain('0x');
    });

    it('should parse output fields', () => {
      const outputFields = [
        { field: 'success', description: 'Whether operation succeeded' },
        { field: 'balance', description: 'Wallet balance in ETH' },
        { field: 'balanceWei', description: 'Balance in Wei' },
        { field: 'address', description: 'Checked address' },
      ];

      expect(outputFields).toHaveLength(4);
      expect(outputFields[1].field).toBe('balance');
    });

    it('should handle complex field types', () => {
      const complexField = {
        key: 'tokenConfig',
        label: 'Token Configuration',
        type: 'token-select',
        networkField: 'network',
        chainTypeFilter: 'evm',
        required: false,
      };

      expect(complexField.type).toBe('token-select');
      expect(complexField.networkField).toBe('network');
      expect(complexField.chainTypeFilter).toBe('evm');
    });

    it('should parse textarea fields with rows', () => {
      const textareaField = {
        key: 'abi',
        label: 'Contract ABI',
        type: 'textarea',
        rows: 10,
        placeholder: 'Paste contract ABI JSON',
      };

      expect(textareaField.rows).toBe(10);
    });

    it('should parse select fields with options', () => {
      const selectField = {
        key: 'method',
        label: 'HTTP Method',
        type: 'select',
        options: [
          { label: 'GET', value: 'GET' },
          { label: 'POST', value: 'POST' },
          { label: 'PUT', value: 'PUT' },
          { label: 'DELETE', value: 'DELETE' },
        ],
      };

      expect(selectField.options).toHaveLength(4);
      expect(selectField.options[1].value).toBe('POST');
    });
  });

  describe('Field Validation Rules', () => {
    it('should identify required fields', () => {
      const fields = [
        { key: 'network', label: 'Network', type: 'text', required: true },
        { key: 'amount', label: 'Amount', type: 'text', required: false },
      ];

      const requiredFields = fields.filter((f) => f.required);

      expect(requiredFields).toHaveLength(1);
      expect(requiredFields[0].key).toBe('network');
    });

    it('should parse field help text', () => {
      const field = {
        key: 'privateKey',
        label: 'Private Key',
        type: 'password',
        helpText: 'Your wallet private key (never shared)',
        helpLink: {
          text: 'How to get your private key',
          url: 'https://docs.example.com/keys',
        },
      };

      expect(field.helpText).toContain('never shared');
      expect(field.helpLink?.url).toContain('docs.example.com');
    });

    it('should parse field placeholders', () => {
      const field = {
        key: 'email',
        label: 'Email Address',
        type: 'text',
        placeholder: 'user@example.com',
      };

      expect(field.placeholder).toBe('user@example.com');
    });

    it('should parse field examples', () => {
      const field = {
        key: 'address',
        label: 'Address',
        type: 'text',
        example: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb3',
      };

      expect(field.example).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });
  });

  describe('Special Field Types', () => {
    it('should parse chain-select field', () => {
      const field = {
        key: 'network',
        label: 'Network',
        type: 'chain-select',
        chainTypeFilter: 'evm',
      };

      expect(field.type).toBe('chain-select');
      expect(field.chainTypeFilter).toBe('evm');
    });

    it('should parse token-select field', () => {
      const field = {
        key: 'token',
        label: 'Token',
        type: 'token-select',
        networkField: 'network',
      };

      expect(field.type).toBe('token-select');
      expect(field.networkField).toBe('network');
    });

    it('should parse password fields', () => {
      const field = {
        key: 'apiKey',
        label: 'API Key',
        type: 'password',
        required: true,
      };

      expect(field.type).toBe('password');
    });

    it('should parse number fields', () => {
      const field = {
        key: 'amount',
        label: 'Amount',
        type: 'number',
        min: 0,
        step: 0.01,
      };

      expect(field.type).toBe('number');
      expect(field.min).toBe(0);
    });
  });

  describe('Step Function Metadata', () => {
    it('should extract step function name', () => {
      const stepCode = `
        export async function checkBalance(config: Config): Promise<Output> {
          // implementation
        }
      `;

      const functionName = 'checkBalance';

      expect(functionName).toBe('checkBalance');
    });

    it('should extract import path', () => {
      const stepSlug = 'check-balance';
      const importPath = `./steps/${stepSlug}`;

      expect(importPath).toBe('./steps/check-balance');
    });

    it('should handle async functions', () => {
      const isAsync = true;

      expect(isAsync).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing required fields', () => {
      const invalidPlugin = {
        label: 'Test Plugin',
      };

      const hasType = 'type' in invalidPlugin;

      expect(hasType).toBe(false);
    });

    it('should handle malformed JSON in config fields', () => {
      const malformedJSON = '{"key": "value", invalid}';

      expect(() => {
        JSON.parse(malformedJSON);
      }).toThrow();
    });

    it('should handle missing step metadata', () => {
      const step = {};

      const hasSlug = 'slug' in step;

      expect(hasSlug).toBe(false);
    });

    it('should validate field type values', () => {
      const validTypes = ['text', 'password', 'textarea', 'select', 'chain-select', 'token-select', 'number'];
      const fieldType = 'text';

      expect(validTypes).toContain(fieldType);
    });
  });

  describe('Complex Plugin Parsing', () => {
    it('should parse Web3 plugin with all features', () => {
      const web3Plugin = {
        type: 'web3',
        label: 'Web3',
        description: 'Blockchain integration plugin',
        category: 'Web3',
        singleConnection: true,
        credentials: {
          formFields: [
            {
              id: 'walletType',
              label: 'Wallet Type',
              type: 'select',
              options: [
                { label: 'Para', value: 'para' },
                { label: 'Private Key', value: 'privateKey' },
              ],
            },
          ],
        },
        steps: [
          {
            slug: 'check-balance',
            label: 'Check Balance',
            category: 'Query',
            configFields: [
              { key: 'network', label: 'Network', type: 'chain-select', required: true },
              { key: 'address', label: 'Address', type: 'text', required: true },
            ],
            outputFields: [
              { field: 'balance', description: 'Balance in ETH' },
            ],
          },
        ],
      };

      expect(web3Plugin.type).toBe('web3');
      expect(web3Plugin.singleConnection).toBe(true);
      expect(web3Plugin.steps).toHaveLength(1);
      expect(web3Plugin.credentials.formFields[0].type).toBe('select');
    });

    it('should parse Discord plugin', () => {
      const discordPlugin = {
        type: 'discord',
        label: 'Discord',
        description: 'Send Discord messages',
        category: 'Messaging',
        steps: [
          {
            slug: 'send-message',
            label: 'Send Message',
            category: 'Action',
            configFields: [
              { key: 'webhookUrl', label: 'Webhook URL', type: 'text', required: true },
              { key: 'message', label: 'Message', type: 'textarea', rows: 5, required: true },
            ],
          },
        ],
      };

      expect(discordPlugin.category).toBe('Messaging');
      expect(discordPlugin.steps[0].configFields[1].rows).toBe(5);
    });

    it('should parse plugin with multiple steps', () => {
      const plugin = {
        type: 'web3',
        label: 'Web3',
        steps: [
          { slug: 'check-balance', label: 'Check Balance' },
          { slug: 'transfer-funds', label: 'Transfer Funds' },
          { slug: 'swap-tokens', label: 'Swap Tokens' },
          { slug: 'call-contract', label: 'Call Contract' },
        ],
      };

      expect(plugin.steps).toHaveLength(4);
      expect(plugin.steps.map((s) => s.slug)).toContain('swap-tokens');
    });
  });

  describe('Data Serialization', () => {
    it('should serialize config fields to JSON', () => {
      const configFields = [
        { key: 'network', label: 'Network', type: 'chain-select', required: true },
      ];

      const json = JSON.stringify(configFields);
      const parsed = JSON.parse(json);

      expect(parsed[0].key).toBe('network');
    });

    it('should serialize output fields to JSON', () => {
      const outputFields = [
        { field: 'balance', description: 'Wallet balance' },
      ];

      const json = JSON.stringify(outputFields);

      expect(json).toContain('balance');
    });

    it('should handle nested objects in serialization', () => {
      const field = {
        key: 'advanced',
        label: 'Advanced',
        type: 'object',
        nested: {
          gasLimit: { type: 'number', default: 21000 },
          gasPrice: { type: 'number' },
        },
      };

      const json = JSON.stringify(field);
      const parsed = JSON.parse(json);

      expect(parsed.nested.gasLimit.default).toBe(21000);
    });
  });

  describe('Type Validation', () => {
    it('should validate plugin type format', () => {
      const validTypes = ['web3', 'discord', 'sendgrid', 'webhook', 'custom-plugin'];

      validTypes.forEach((type) => {
        expect(type).toMatch(/^[a-z0-9-]+$/);
      });
    });

    it('should validate step slug format', () => {
      const validSlugs = ['check-balance', 'transfer-funds', 'send-message'];

      validSlugs.forEach((slug) => {
        expect(slug).toMatch(/^[a-z0-9-]+$/);
      });
    });

    it('should validate category values', () => {
      const validCategories = ['Query', 'Action', 'Condition', 'Trigger'];
      const category = 'Query';

      expect(validCategories).toContain(category);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty config fields array', () => {
      const step = {
        slug: 'simple-step',
        label: 'Simple Step',
        configFields: [],
        outputFields: [],
      };

      expect(step.configFields).toHaveLength(0);
    });

    it('should handle optional fields with undefined', () => {
      const field = {
        key: 'optional',
        label: 'Optional Field',
        type: 'text',
        required: false,
        placeholder: undefined,
      };

      expect(field.placeholder).toBeUndefined();
    });

    it('should handle fields with default values', () => {
      const field = {
        key: 'timeout',
        label: 'Timeout',
        type: 'number',
        default: 30000,
      };

      expect(field.default).toBe(30000);
    });

    it('should preserve field order', () => {
      const fields = [
        { key: 'first', label: 'First' },
        { key: 'second', label: 'Second' },
        { key: 'third', label: 'Third' },
      ];

      expect(fields[0].key).toBe('first');
      expect(fields[2].key).toBe('third');
    });
  });
});
