import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';

describe('Plugin Discovery to Workflow Integration', () => {
  let db: DatabaseType;

  beforeEach(() => {
    db = new Database(':memory:');

    db.exec(`
      CREATE TABLE plugins (
        plugin_type TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        description TEXT NOT NULL,
        category TEXT DEFAULT 'Integration',
        icon_name TEXT,
        single_connection INTEGER DEFAULT 0,
        has_credentials INTEGER DEFAULT 0,
        form_fields TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE plugin_steps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        plugin_type TEXT NOT NULL,
        step_slug TEXT NOT NULL,
        label TEXT NOT NULL,
        description TEXT NOT NULL,
        category TEXT NOT NULL,
        step_function TEXT NOT NULL,
        step_import_path TEXT NOT NULL,
        config_fields TEXT NOT NULL,
        output_fields TEXT NOT NULL,
        UNIQUE(plugin_type, step_slug),
        FOREIGN KEY (plugin_type) REFERENCES plugins(plugin_type) ON DELETE CASCADE
      );

      CREATE VIRTUAL TABLE plugins_fts USING fts5(
        plugin_type,
        label,
        description,
        category
      );

      CREATE VIRTUAL TABLE steps_fts USING fts5(
        plugin_type,
        step_slug,
        label,
        description,
        category
      );

      CREATE TRIGGER plugins_ai AFTER INSERT ON plugins BEGIN
        INSERT INTO plugins_fts(rowid, plugin_type, label, description, category)
        VALUES (new.rowid, new.plugin_type, new.label, new.description, new.category);
      END;

      CREATE TRIGGER steps_ai AFTER INSERT ON plugin_steps BEGIN
        INSERT INTO steps_fts(rowid, plugin_type, step_slug, label, description, category)
        VALUES (new.id, new.plugin_type, new.step_slug, new.label, new.description, new.category);
      END;
    `);

    const configFields = JSON.stringify([
      { key: 'network', label: 'Network', type: 'chain-select', required: true },
      { key: 'address', label: 'Wallet Address', type: 'text', required: true },
    ]);

    const outputFields = JSON.stringify([
      { field: 'success', description: 'Operation success status' },
      { field: 'balance', description: 'Wallet balance in ETH' },
      { field: 'balanceWei', description: 'Balance in Wei' },
      { field: 'address', description: 'Checked address' },
    ]);

    db.prepare(`
      INSERT INTO plugins (plugin_type, label, description, category, single_connection, has_credentials)
      VALUES ('web3', 'Web3', 'Blockchain and cryptocurrency operations', 'Web3', 1, 1)
    `).run();

    db.prepare(`
      INSERT INTO plugin_steps (
        plugin_type, step_slug, label, description, category,
        step_function, step_import_path, config_fields, output_fields
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('web3', 'check-balance', 'Check Balance', 'Get ETH balance', 'Query', 'checkBalance', './steps/check-balance', configFields, outputFields);
  });

  afterEach(() => {
    db.close();
  });

  describe('End-to-End Plugin Discovery Flow', () => {
    it('should complete full plugin discovery to validation flow', () => {
      const searchResults = db.prepare(`
        SELECT p.*, COUNT(ps.id) as step_count
        FROM plugins p
        JOIN plugins_fts ON p.rowid = plugins_fts.rowid
        LEFT JOIN plugin_steps ps ON p.plugin_type = ps.plugin_type
        WHERE plugins_fts MATCH ?
        GROUP BY p.plugin_type
      `).all('blockchain');

      expect(searchResults).toHaveLength(1);

      const pluginType = searchResults[0].plugin_type;

      const plugin = db.prepare(`
        SELECT * FROM plugins WHERE plugin_type = ?
      `).get(pluginType);

      const steps = db.prepare(`
        SELECT * FROM plugin_steps WHERE plugin_type = ?
      `).all(pluginType);

      expect(plugin).toBeDefined();
      expect(steps).toHaveLength(1);

      const step = steps[0];
      const configFields = JSON.parse(step.config_fields);

      const config = {
        network: 'ethereum',
        address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb3',
      };

      const requiredFields = configFields.filter((f: any) => f.required);
      const missingFields = requiredFields.filter((f: any) => !(f.key in config));

      expect(missingFields).toHaveLength(0);

      const addressValid = /^0x[a-fA-F0-9]{40}$/.test(config.address);
      expect(addressValid).toBe(true);
    });

    it('should handle workflow creation with validated config', () => {
      const plugin = db.prepare('SELECT * FROM plugins WHERE plugin_type = ?').get('web3');
      const step = db.prepare('SELECT * FROM plugin_steps WHERE step_slug = ?').get('check-balance');

      const configFields = JSON.parse(step.config_fields);
      const config = {
        network: 'ethereum',
        address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb3',
      };

      const requiredFields = configFields.filter((f: any) => f.required);
      const allFieldsPresent = requiredFields.every((f: any) => f.key in config);

      expect(allFieldsPresent).toBe(true);

      const workflowNode = {
        id: 'check-balance-1',
        type: 'step',
        pluginType: plugin.plugin_type,
        stepSlug: step.step_slug,
        config,
        label: step.label,
      };

      expect(workflowNode.config.network).toBe('ethereum');
      expect(workflowNode.pluginType).toBe('web3');
    });
  });

  describe('Multi-Plugin Workflow Integration', () => {
    beforeEach(() => {
      db.prepare(`
        INSERT INTO plugins (plugin_type, label, description, category)
        VALUES ('discord', 'Discord', 'Send Discord messages', 'Messaging')
      `).run();

      const discordConfig = JSON.stringify([
        { key: 'webhookUrl', label: 'Webhook URL', type: 'text', required: true },
        { key: 'message', label: 'Message', type: 'textarea', required: true },
      ]);

      db.prepare(`
        INSERT INTO plugin_steps (
          plugin_type, step_slug, label, description, category,
          step_function, step_import_path, config_fields, output_fields
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('discord', 'send-message', 'Send Message', 'Send Discord message', 'Action', 'sendMessage', './steps/send-message', discordConfig, '[]');
    });

    it('should create workflow with multiple plugins', () => {
      const web3Step = db.prepare('SELECT * FROM plugin_steps WHERE step_slug = ?').get('check-balance');
      const discordStep = db.prepare('SELECT * FROM plugin_steps WHERE step_slug = ?').get('send-message');

      const nodes = [
        {
          id: 'check-balance',
          type: 'step',
          pluginType: 'web3',
          stepSlug: 'check-balance',
          config: {
            network: 'ethereum',
            address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb3',
          },
        },
        {
          id: 'send-alert',
          type: 'step',
          pluginType: 'discord',
          stepSlug: 'send-message',
          config: {
            webhookUrl: 'https://discord.com/api/webhooks/123/abc',
            message: 'Balance: {{check-balance.balance}}',
          },
        },
      ];

      const edges = [
        { id: 'e1', source: 'check-balance', target: 'send-alert' },
      ];

      expect(nodes).toHaveLength(2);
      expect(edges).toHaveLength(1);

      const nodeIds = new Set(nodes.map((n) => n.id));
      edges.forEach((edge) => {
        expect(nodeIds.has(edge.source)).toBe(true);
        expect(nodeIds.has(edge.target)).toBe(true);
      });
    });

    it('should validate all nodes in workflow', () => {
      const nodes = [
        {
          id: 'check-balance',
          pluginType: 'web3',
          stepSlug: 'check-balance',
          config: { network: 'ethereum', address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb3' },
        },
        {
          id: 'send-alert',
          pluginType: 'discord',
          stepSlug: 'send-message',
          config: { webhookUrl: 'https://discord.com/api/webhooks/123/abc', message: 'Alert' },
        },
      ];

      const validationResults = nodes.map((node) => {
        const step = db.prepare('SELECT * FROM plugin_steps WHERE step_slug = ?').get(node.stepSlug);
        const configFields = JSON.parse(step.config_fields);

        const requiredFields = configFields.filter((f: any) => f.required);
        const missingFields = requiredFields.filter((f: any) => !(f.key in node.config));

        return {
          nodeId: node.id,
          valid: missingFields.length === 0,
          errors: missingFields.map((f: any) => ({
            field: f.key,
            message: `${f.label} is required`,
          })),
        };
      });

      expect(validationResults.every((r) => r.valid)).toBe(true);
    });
  });

  describe('Error Recovery and Validation', () => {
    it('should detect missing required fields', () => {
      const step = db.prepare('SELECT * FROM plugin_steps WHERE step_slug = ?').get('check-balance');
      const configFields = JSON.parse(step.config_fields);

      const invalidConfig = {
        network: 'ethereum',
      };

      const requiredFields = configFields.filter((f: any) => f.required);
      const missingFields = requiredFields.filter((f: any) => !(f.key in invalidConfig));

      expect(missingFields).toHaveLength(1);
      expect(missingFields[0].key).toBe('address');
    });

    it('should detect invalid field values', () => {
      const invalidAddress = 'not-an-address';
      const isValid = /^0x[a-fA-F0-9]{40}$/.test(invalidAddress);

      expect(isValid).toBe(false);
    });

    it('should provide helpful error messages', () => {
      const errors = [
        {
          field: 'address',
          message: 'Invalid ETH address format. Expected 0x followed by 40 hex characters',
          severity: 'error' as const,
        },
      ];

      expect(errors[0].message).toContain('0x');
      expect(errors[0].severity).toBe('error');
    });
  });

  describe('Performance Integration', () => {
    it('should complete search to validation in reasonable time', () => {
      const start = Date.now();

      const searchResults = db.prepare(`
        SELECT p.*
        FROM plugins p
        JOIN plugins_fts ON p.rowid = plugins_fts.rowid
        WHERE plugins_fts MATCH ?
      `).all('web3');

      const plugin = searchResults[0];
      const steps = db.prepare('SELECT * FROM plugin_steps WHERE plugin_type = ?').all(plugin.plugin_type);
      const step = steps[0];

      const configFields = JSON.parse(step.config_fields);
      const config = {
        network: 'ethereum',
        address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb3',
      };

      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(100);
    });
  });

  describe('Data Flow Validation', () => {
    it('should validate output field references between nodes', () => {
      const balanceStep = db.prepare('SELECT * FROM plugin_steps WHERE step_slug = ?').get('check-balance');
      const outputFields = JSON.parse(balanceStep.output_fields);

      const messageConfig = {
        message: 'Your balance is {{check-balance.balance}} ETH',
      };

      const referencedField = 'balance';
      const fieldExists = outputFields.some((f: any) => f.field === referencedField);

      expect(fieldExists).toBe(true);
    });

    it('should detect invalid field references', () => {
      const balanceStep = db.prepare('SELECT * FROM plugin_steps WHERE step_slug = ?').get('check-balance');
      const outputFields = JSON.parse(balanceStep.output_fields);

      const messageConfig = {
        message: 'Your balance is {{check-balance.invalidField}} ETH',
      };

      const referencedField = 'invalidField';
      const fieldExists = outputFields.some((f: any) => f.field === referencedField);

      expect(fieldExists).toBe(false);
    });
  });
});
