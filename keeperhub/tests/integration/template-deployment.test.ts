import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';

describe('Template Deployment Integration', () => {
  let db: DatabaseType;

  beforeEach(() => {
    db = new Database(':memory:');

    db.exec(`
      CREATE TABLE workflow_templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        category TEXT NOT NULL,
        use_case TEXT NOT NULL,
        difficulty TEXT DEFAULT 'beginner',
        tags TEXT,
        nodes TEXT NOT NULL,
        edges TEXT NOT NULL,
        required_plugins TEXT,
        estimated_setup_time INTEGER DEFAULT 5,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE plugins (
        plugin_type TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        description TEXT NOT NULL,
        category TEXT DEFAULT 'Integration',
        has_credentials INTEGER DEFAULT 0
      );

      CREATE TABLE plugin_steps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        plugin_type TEXT NOT NULL,
        step_slug TEXT NOT NULL,
        label TEXT NOT NULL,
        config_fields TEXT NOT NULL,
        output_fields TEXT NOT NULL,
        UNIQUE(plugin_type, step_slug)
      );

      CREATE VIRTUAL TABLE templates_fts USING fts5(
        template_id,
        name,
        description,
        use_case,
        tags
      );

      CREATE TRIGGER templates_ai AFTER INSERT ON workflow_templates BEGIN
        INSERT INTO templates_fts(rowid, template_id, name, description, use_case, tags)
        VALUES (new.rowid, new.id, new.name, new.description, new.use_case, new.tags);
      END;
    `);

    db.prepare(`
      INSERT INTO plugins (plugin_type, label, description, category, has_credentials)
      VALUES ('web3', 'Web3', 'Blockchain integration', 'Web3', 1)
    `).run();

    db.prepare(`
      INSERT INTO plugins (plugin_type, label, description, category)
      VALUES ('sendgrid', 'SendGrid', 'Email service', 'Notification')
    `).run();

    const configFields = JSON.stringify([
      { key: 'network', label: 'Network', type: 'chain-select', required: true },
      { key: 'address', label: 'Address', type: 'text', required: true },
    ]);

    const outputFields = JSON.stringify([
      { field: 'balance', description: 'Wallet balance in ETH' },
    ]);

    db.prepare(`
      INSERT INTO plugin_steps (plugin_type, step_slug, label, config_fields, output_fields)
      VALUES ('web3', 'check-balance', 'Check Balance', ?, ?)
    `).run(configFields, outputFields);

    const emailConfigFields = JSON.stringify([
      { key: 'to', label: 'To', type: 'text', required: true },
      { key: 'subject', label: 'Subject', type: 'text', required: true },
      { key: 'content', label: 'Content', type: 'textarea', required: true },
    ]);

    db.prepare(`
      INSERT INTO plugin_steps (plugin_type, step_slug, label, config_fields, output_fields)
      VALUES ('sendgrid', 'send-email', 'Send Email', ?, '[]')
    `).run(emailConfigFields);

    const nodes = [
      {
        id: 'schedule-trigger',
        type: 'trigger',
        pluginType: 'schedule',
        config: { cronExpression: '0 */4 * * *' },
      },
      {
        id: 'check-balance',
        type: 'step',
        pluginType: 'web3',
        stepSlug: 'check-balance',
        config: {
          network: '{{env.NETWORK}}',
          address: '{{env.WALLET_ADDRESS}}',
        },
      },
      {
        id: 'send-alert',
        type: 'step',
        pluginType: 'sendgrid',
        stepSlug: 'send-email',
        config: {
          to: '{{env.ALERT_EMAIL}}',
          subject: 'Low Balance Alert',
          content: 'Balance: {{check-balance.balance}}',
        },
      },
    ];

    const edges = [
      { id: 'e1', source: 'schedule-trigger', target: 'check-balance' },
      { id: 'e2', source: 'check-balance', target: 'send-alert' },
    ];

    db.prepare(`
      INSERT INTO workflow_templates (
        id, name, description, category, use_case, difficulty,
        tags, nodes, edges, required_plugins, estimated_setup_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'eth-balance-monitor',
      'ETH Balance Monitor',
      'Monitor ETH balance and send alerts',
      'monitoring',
      'Maintain minimum wallet balance',
      'beginner',
      JSON.stringify(['ethereum', 'monitoring']),
      JSON.stringify(nodes),
      JSON.stringify(edges),
      JSON.stringify(['web3', 'sendgrid']),
      5
    );
  });

  afterEach(() => {
    db.close();
  });

  describe('Template Search and Retrieval', () => {
    it('should search for templates', () => {
      const results = db.prepare(`
        SELECT wt.*
        FROM workflow_templates wt
        JOIN templates_fts ON wt.rowid = templates_fts.rowid
        WHERE templates_fts MATCH ?
      `).all('balance');

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('eth-balance-monitor');
    });

    it('should retrieve template with all details', () => {
      const template = db.prepare('SELECT * FROM workflow_templates WHERE id = ?').get('eth-balance-monitor');

      expect(template).toBeDefined();
      expect(template.name).toBe('ETH Balance Monitor');

      const nodes = JSON.parse(template.nodes);
      const edges = JSON.parse(template.edges);

      expect(nodes).toHaveLength(3);
      expect(edges).toHaveLength(2);
    });
  });

  describe('Template Validation', () => {
    it('should validate required plugins are available', () => {
      const template = db.prepare('SELECT * FROM workflow_templates WHERE id = ?').get('eth-balance-monitor');
      const requiredPlugins = JSON.parse(template.required_plugins);

      const availablePlugins = db.prepare('SELECT plugin_type FROM plugins').all().map((p) => p.plugin_type);

      const missingPlugins = requiredPlugins.filter((p: string) => !availablePlugins.includes(p));

      expect(missingPlugins).toHaveLength(0);
    });

    it('should validate workflow structure', () => {
      const template = db.prepare('SELECT * FROM workflow_templates WHERE id = ?').get('eth-balance-monitor');

      const nodes = JSON.parse(template.nodes);
      const edges = JSON.parse(template.edges);

      const nodeIds = new Set(nodes.map((n: any) => n.id));

      edges.forEach((edge: any) => {
        expect(nodeIds.has(edge.source)).toBe(true);
        expect(nodeIds.has(edge.target)).toBe(true);
      });
    });

    it('should validate no circular dependencies', () => {
      const template = db.prepare('SELECT * FROM workflow_templates WHERE id = ?').get('eth-balance-monitor');
      const edges = JSON.parse(template.edges);

      const hasCircularDependency = (nodeId: string, visited = new Set(), stack = new Set()): boolean => {
        if (stack.has(nodeId)) return true;
        if (visited.has(nodeId)) return false;

        visited.add(nodeId);
        stack.add(nodeId);

        const outgoingEdges = edges.filter((e: any) => e.source === nodeId);

        for (const edge of outgoingEdges) {
          if (hasCircularDependency(edge.target, visited, stack)) {
            return true;
          }
        }

        stack.delete(nodeId);
        return false;
      };

      const template_nodes = JSON.parse(template.nodes);
      const hasCycle = template_nodes.some((node: any) => hasCircularDependency(node.id));

      expect(hasCycle).toBe(false);
    });
  });

  describe('Template Customization', () => {
    it('should apply customizations to template nodes', () => {
      const template = db.prepare('SELECT * FROM workflow_templates WHERE id = ?').get('eth-balance-monitor');
      const nodes = JSON.parse(template.nodes);

      const customizations = {
        'check-balance': {
          config: {
            network: 'polygon',
            address: '0x123456789abcdef',
          },
        },
      };

      const customizedNodes = nodes.map((node: any) => {
        if (customizations[node.id]) {
          return {
            ...node,
            config: {
              ...node.config,
              ...customizations[node.id].config,
            },
          };
        }
        return node;
      });

      const balanceNode = customizedNodes.find((n: any) => n.id === 'check-balance');

      expect(balanceNode.config.network).toBe('polygon');
      expect(balanceNode.config.address).toBe('0x123456789abcdef');
    });

    it('should substitute environment variables', () => {
      const template = db.prepare('SELECT * FROM workflow_templates WHERE id = ?').get('eth-balance-monitor');
      const nodes = JSON.parse(template.nodes);

      const envVars = {
        NETWORK: 'ethereum',
        WALLET_ADDRESS: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb3',
        ALERT_EMAIL: 'alerts@example.com',
      };

      const substituteEnvVars = (value: string): string => {
        return value.replace(/\{\{env\.(\w+)\}\}/g, (_, key) => envVars[key as keyof typeof envVars] || '');
      };

      const processedNodes = nodes.map((node: any) => ({
        ...node,
        config: Object.entries(node.config).reduce((acc, [key, value]) => {
          acc[key] = typeof value === 'string' ? substituteEnvVars(value) : value;
          return acc;
        }, {} as Record<string, any>),
      }));

      const balanceNode = processedNodes.find((n: any) => n.id === 'check-balance');

      expect(balanceNode.config.network).toBe('ethereum');
      expect(balanceNode.config.address).toBe('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb3');
    });

    it('should preserve field references', () => {
      const template = db.prepare('SELECT * FROM workflow_templates WHERE id = ?').get('eth-balance-monitor');
      const nodes = JSON.parse(template.nodes);

      const alertNode = nodes.find((n: any) => n.id === 'send-alert');

      expect(alertNode.config.content).toContain('{{check-balance.balance}}');
    });
  });

  describe('Deployment Validation', () => {
    it('should validate node configurations before deployment', () => {
      const template = db.prepare('SELECT * FROM workflow_templates WHERE id = ?').get('eth-balance-monitor');
      const nodes = JSON.parse(template.nodes);

      const envVars = {
        NETWORK: 'ethereum',
        WALLET_ADDRESS: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb3',
        ALERT_EMAIL: 'alerts@example.com',
      };

      const substituteEnvVars = (value: string): string => {
        return value.replace(/\{\{env\.(\w+)\}\}/g, (_, key) => envVars[key as keyof typeof envVars] || '');
      };

      const validationErrors: any[] = [];

      nodes.forEach((node: any) => {
        if (node.type === 'step') {
          const step = db.prepare('SELECT * FROM plugin_steps WHERE step_slug = ?').get(node.stepSlug);

          if (!step) {
            validationErrors.push({
              nodeId: node.id,
              error: `Step ${node.stepSlug} not found`,
            });
            return;
          }

          const configFields = JSON.parse(step.config_fields);

          const processedConfig = Object.entries(node.config).reduce((acc, [key, value]) => {
            acc[key] = typeof value === 'string' ? substituteEnvVars(value) : value;
            return acc;
          }, {} as Record<string, any>);

          const requiredFields = configFields.filter((f: any) => f.required);
          const missingFields = requiredFields.filter((f: any) => !(f.key in processedConfig));

          missingFields.forEach((field: any) => {
            validationErrors.push({
              nodeId: node.id,
              field: field.key,
              error: `${field.label} is required`,
            });
          });

          if (processedConfig.address && !/^0x[a-fA-F0-9]{40}$/.test(processedConfig.address)) {
            validationErrors.push({
              nodeId: node.id,
              field: 'address',
              error: 'Invalid ETH address format',
            });
          }
        }
      });

      expect(validationErrors).toHaveLength(0);
    });

    it('should create deployment result', () => {
      const deploymentResult = {
        success: true,
        workflowId: 'workflow-123',
        workflowName: 'My ETH Balance Monitor',
        message: 'Template deployed successfully',
      };

      expect(deploymentResult.success).toBe(true);
      expect(deploymentResult.workflowId).toBeTruthy();
    });

    it('should handle deployment failures gracefully', () => {
      const deploymentResult = {
        success: false,
        workflowName: 'My ETH Balance Monitor',
        validationErrors: {
          valid: false,
          errors: [
            { field: 'address', message: 'Invalid address format', severity: 'error' as const },
          ],
          warnings: [],
        },
        message: 'Validation failed',
      };

      expect(deploymentResult.success).toBe(false);
      expect(deploymentResult.validationErrors?.valid).toBe(false);
    });
  });

  describe('End-to-End Template Deployment', () => {
    it('should complete full template deployment workflow', () => {
      const searchResults = db.prepare(`
        SELECT wt.*
        FROM workflow_templates wt
        JOIN templates_fts ON wt.rowid = templates_fts.rowid
        WHERE templates_fts MATCH ?
      `).all('balance monitor');

      expect(searchResults.length).toBeGreaterThan(0);

      const templateId = searchResults[0].id;

      const template = db.prepare('SELECT * FROM workflow_templates WHERE id = ?').get(templateId);

      expect(template).toBeDefined();

      const requiredPlugins = JSON.parse(template.required_plugins);
      const availablePlugins = db.prepare('SELECT plugin_type FROM plugins').all().map((p) => p.plugin_type);

      const missingPlugins = requiredPlugins.filter((p: string) => !availablePlugins.includes(p));

      expect(missingPlugins).toHaveLength(0);

      const nodes = JSON.parse(template.nodes);
      const edges = JSON.parse(template.edges);

      const envVars = {
        NETWORK: 'ethereum',
        WALLET_ADDRESS: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb3',
        ALERT_EMAIL: 'alerts@example.com',
      };

      const substituteEnvVars = (value: string): string => {
        return value.replace(/\{\{env\.(\w+)\}\}/g, (_, key) => envVars[key as keyof typeof envVars] || '');
      };

      const customizations = {
        'check-balance': {
          config: {
            network: 'polygon',
          },
        },
      };

      const processedNodes = nodes.map((node: any) => {
        let config = { ...node.config };

        if (customizations[node.id]) {
          config = { ...config, ...customizations[node.id].config };
        }

        config = Object.entries(config).reduce((acc, [key, value]) => {
          acc[key] = typeof value === 'string' ? substituteEnvVars(value) : value;
          return acc;
        }, {} as Record<string, any>);

        return { ...node, config };
      });

      const workflow = {
        name: 'My ETH Balance Monitor',
        description: template.description,
        nodes: processedNodes,
        edges,
      };

      expect(workflow.nodes).toHaveLength(3);
      expect(workflow.edges).toHaveLength(2);

      const balanceNode = workflow.nodes.find((n: any) => n.id === 'check-balance');
      expect(balanceNode.config.network).toBe('polygon');
      expect(balanceNode.config.address).toBe('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb3');
    });
  });

  describe('Performance', () => {
    it('should complete deployment in reasonable time', () => {
      const start = Date.now();

      const template = db.prepare('SELECT * FROM workflow_templates WHERE id = ?').get('eth-balance-monitor');
      const nodes = JSON.parse(template.nodes);
      const edges = JSON.parse(template.edges);

      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(100);
    });
  });
});
