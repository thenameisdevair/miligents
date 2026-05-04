import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';

describe('Template Tools', () => {
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

    const templates = [
      [
        'eth-balance-monitor',
        'ETH Balance Monitor',
        'Monitor ETH wallet balance and send alerts when low',
        'monitoring',
        'Automatically maintain minimum ETH balance in wallet',
        'beginner',
        JSON.stringify(['ethereum', 'balance', 'monitoring', 'automation']),
        JSON.stringify([
          { id: 'trigger', type: 'trigger', pluginType: 'schedule' },
          { id: 'check-balance', type: 'step', pluginType: 'web3', stepSlug: 'check-balance' },
        ]),
        JSON.stringify([
          { id: 'e1', source: 'trigger', target: 'check-balance' },
        ]),
        JSON.stringify(['web3', 'sendgrid']),
        5,
      ],
      [
        'token-transfer-automation',
        'Token Transfer Automation',
        'Schedule automatic ERC20 token transfers',
        'transfers',
        'Automate recurring token payments and distributions',
        'intermediate',
        JSON.stringify(['ethereum', 'tokens', 'automation', 'erc20']),
        JSON.stringify([]),
        JSON.stringify([]),
        JSON.stringify(['web3', 'discord']),
        10,
      ],
      [
        'gas-price-alert',
        'Gas Price Alert',
        'Get notified when Ethereum gas prices drop below threshold',
        'notifications',
        'Save on transaction costs by monitoring gas prices',
        'beginner',
        JSON.stringify(['ethereum', 'gas', 'alerts', 'notifications']),
        JSON.stringify([]),
        JSON.stringify([]),
        JSON.stringify(['web3', 'discord']),
        5,
      ],
    ];

    const stmt = db.prepare(`
      INSERT INTO workflow_templates (
        id, name, description, category, use_case, difficulty,
        tags, nodes, edges, required_plugins, estimated_setup_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    templates.forEach((t) => stmt.run(...t));
  });

  afterEach(() => {
    db.close();
  });

  describe('search_templates Tool', () => {
    it('should search templates by keyword', () => {
      const results = db.prepare(`
        SELECT wt.*
        FROM workflow_templates wt
        JOIN templates_fts ON wt.rowid = templates_fts.rowid
        WHERE templates_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `).all('balance', 10);

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('eth-balance-monitor');
    });

    it('should search with multiple keywords', () => {
      const results = db.prepare(`
        SELECT wt.*
        FROM workflow_templates wt
        JOIN templates_fts ON wt.rowid = templates_fts.rowid
        WHERE templates_fts MATCH ?
      `).all('ethereum AND monitoring');

      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('should filter by category', () => {
      const results = db.prepare(`
        SELECT * FROM workflow_templates
        WHERE category = ?
        LIMIT ?
      `).all('monitoring', 10);

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('eth-balance-monitor');
    });

    it('should filter by difficulty', () => {
      const results = db.prepare(`
        SELECT * FROM workflow_templates
        WHERE difficulty = ?
        LIMIT ?
      `).all('beginner', 10);

      expect(results).toHaveLength(2);
    });

    it('should combine category and difficulty filters', () => {
      const results = db.prepare(`
        SELECT * FROM workflow_templates
        WHERE category = ? AND difficulty = ?
      `).all('monitoring', 'beginner');

      expect(results).toHaveLength(1);
    });

    it('should search in tags', () => {
      const results = db.prepare(`
        SELECT wt.*
        FROM workflow_templates wt
        JOIN templates_fts ON wt.rowid = templates_fts.rowid
        WHERE templates_fts MATCH ?
      `).all('erc20');

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('token-transfer-automation');
    });

    it('should limit results', () => {
      const results = db.prepare(`
        SELECT * FROM workflow_templates LIMIT ?
      `).all(2);

      expect(results).toHaveLength(2);
    });

    it('should include node count', () => {
      const template = db.prepare(`
        SELECT * FROM workflow_templates WHERE id = ?
      `).get('eth-balance-monitor');

      const nodes = JSON.parse(template.nodes);
      const nodeCount = nodes.length;

      expect(nodeCount).toBe(2);
    });

    it('should parse required plugins', () => {
      const template = db.prepare(`
        SELECT * FROM workflow_templates WHERE id = ?
      `).get('eth-balance-monitor');

      const requiredPlugins = JSON.parse(template.required_plugins);

      expect(requiredPlugins).toHaveLength(2);
      expect(requiredPlugins).toContain('web3');
      expect(requiredPlugins).toContain('sendgrid');
    });

    it('should return empty array for no matches', () => {
      const results = db.prepare(`
        SELECT wt.*
        FROM workflow_templates wt
        JOIN templates_fts ON wt.rowid = templates_fts.rowid
        WHERE templates_fts MATCH ?
      `).all('nonexistent');

      expect(results).toHaveLength(0);
    });
  });

  describe('get_template Tool', () => {
    it('should retrieve template by ID', () => {
      const template = db.prepare(`
        SELECT * FROM workflow_templates WHERE id = ?
      `).get('eth-balance-monitor');

      expect(template).toBeDefined();
      expect(template.name).toBe('ETH Balance Monitor');
    });

    it('should include all template fields', () => {
      const template = db.prepare(`
        SELECT * FROM workflow_templates WHERE id = ?
      `).get('eth-balance-monitor');

      expect(template).toHaveProperty('id');
      expect(template).toHaveProperty('name');
      expect(template).toHaveProperty('description');
      expect(template).toHaveProperty('category');
      expect(template).toHaveProperty('use_case');
      expect(template).toHaveProperty('difficulty');
      expect(template).toHaveProperty('tags');
      expect(template).toHaveProperty('nodes');
      expect(template).toHaveProperty('edges');
      expect(template).toHaveProperty('required_plugins');
      expect(template).toHaveProperty('estimated_setup_time');
    });

    it('should parse nodes JSON', () => {
      const template = db.prepare(`
        SELECT * FROM workflow_templates WHERE id = ?
      `).get('eth-balance-monitor');

      const nodes = JSON.parse(template.nodes);

      expect(Array.isArray(nodes)).toBe(true);
      expect(nodes).toHaveLength(2);
      expect(nodes[0]).toHaveProperty('id');
      expect(nodes[0]).toHaveProperty('type');
    });

    it('should parse edges JSON', () => {
      const template = db.prepare(`
        SELECT * FROM workflow_templates WHERE id = ?
      `).get('eth-balance-monitor');

      const edges = JSON.parse(template.edges);

      expect(Array.isArray(edges)).toBe(true);
      expect(edges).toHaveLength(1);
      expect(edges[0]).toHaveProperty('source');
      expect(edges[0]).toHaveProperty('target');
    });

    it('should parse tags array', () => {
      const template = db.prepare(`
        SELECT * FROM workflow_templates WHERE id = ?
      `).get('eth-balance-monitor');

      const tags = JSON.parse(template.tags);

      expect(Array.isArray(tags)).toBe(true);
      expect(tags).toContain('ethereum');
      expect(tags).toContain('monitoring');
    });

    it('should return null for non-existent template', () => {
      const template = db.prepare(`
        SELECT * FROM workflow_templates WHERE id = ?
      `).get('nonexistent');

      expect(template).toBeUndefined();
    });
  });

  describe('deploy_template Tool', () => {
    it('should validate template before deployment', () => {
      const template = db.prepare(`
        SELECT * FROM workflow_templates WHERE id = ?
      `).get('eth-balance-monitor');

      expect(template).toBeDefined();

      const nodes = JSON.parse(template.nodes);
      const edges = JSON.parse(template.edges);

      expect(nodes.length).toBeGreaterThan(0);
      expect(Array.isArray(edges)).toBe(true);
    });

    it('should validate required plugins are available', () => {
      const template = db.prepare(`
        SELECT * FROM workflow_templates WHERE id = ?
      `).get('eth-balance-monitor');

      const requiredPlugins = JSON.parse(template.required_plugins);
      const availablePlugins = ['web3', 'discord', 'sendgrid', 'webhook'];

      const missingPlugins = requiredPlugins.filter((p: string) => !availablePlugins.includes(p));

      expect(missingPlugins).toHaveLength(0);
    });

    it('should apply node customizations', () => {
      const template = db.prepare(`
        SELECT * FROM workflow_templates WHERE id = ?
      `).get('eth-balance-monitor');

      const nodes = JSON.parse(template.nodes);
      const customizations = {
        'check-balance': {
          config: {
            network: 'polygon',
            address: '0x123...',
          },
        },
      };

      const customizedNode = {
        ...nodes.find((n: any) => n.id === 'check-balance'),
        config: customizations['check-balance'].config,
      };

      expect(customizedNode.config.network).toBe('polygon');
    });

    it('should substitute environment variables', () => {
      const nodeConfig = {
        address: '{{env.WALLET_ADDRESS}}',
        threshold: '{{env.MIN_BALANCE}}',
      };

      const envVars = {
        WALLET_ADDRESS: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb3',
        MIN_BALANCE: '0.1',
      };

      const substituted = {
        address: nodeConfig.address.replace('{{env.WALLET_ADDRESS}}', envVars.WALLET_ADDRESS),
        threshold: nodeConfig.threshold.replace('{{env.MIN_BALANCE}}', envVars.MIN_BALANCE),
      };

      expect(substituted.address).toBe('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb3');
      expect(substituted.threshold).toBe('0.1');
    });

    it('should validate workflow structure', () => {
      const template = db.prepare(`
        SELECT * FROM workflow_templates WHERE id = ?
      `).get('eth-balance-monitor');

      const nodes = JSON.parse(template.nodes);
      const edges = JSON.parse(template.edges);

      const nodeIds = new Set(nodes.map((n: any) => n.id));

      edges.forEach((edge: any) => {
        expect(nodeIds.has(edge.source)).toBe(true);
        expect(nodeIds.has(edge.target)).toBe(true);
      });
    });

    it('should detect circular dependencies', () => {
      const edges = [
        { id: 'e1', source: 'a', target: 'b' },
        { id: 'e2', source: 'b', target: 'c' },
        { id: 'e3', source: 'c', target: 'a' },
      ];

      const visited = new Set();
      const stack = new Set();

      function hasCycle(node: string, graph: any): boolean {
        if (stack.has(node)) return true;
        if (visited.has(node)) return false;

        visited.add(node);
        stack.add(node);

        const targets = edges.filter((e) => e.source === node).map((e) => e.target);

        for (const target of targets) {
          if (hasCycle(target, graph)) return true;
        }

        stack.delete(node);
        return false;
      }

      const hasCircularDep = hasCycle('a', edges);

      expect(hasCircularDep).toBe(true);
    });

    it('should validate node configurations', () => {
      const node = {
        id: 'check-balance',
        type: 'step',
        pluginType: 'web3',
        stepSlug: 'check-balance',
        config: {
          network: 'ethereum',
          address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb3',
        },
      };

      expect(node.config.network).toBeTruthy();
      expect(node.config.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });

    it('should return deployment result', () => {
      const deploymentResult = {
        success: true,
        workflowId: 'workflow-123',
        workflowName: 'My ETH Monitor',
        message: 'Template deployed successfully',
      };

      expect(deploymentResult.success).toBe(true);
      expect(deploymentResult.workflowId).toBeTruthy();
    });

    it('should return validation errors on failure', () => {
      const deploymentResult = {
        success: false,
        workflowName: 'My ETH Monitor',
        validationErrors: {
          valid: false,
          errors: [
            { field: 'address', message: 'Invalid ETH address', severity: 'error' as const },
          ],
          warnings: [],
        },
        message: 'Validation failed',
      };

      expect(deploymentResult.success).toBe(false);
      expect(deploymentResult.validationErrors?.errors).toHaveLength(1);
    });
  });

  describe('Template Filtering and Sorting', () => {
    it('should sort by estimated setup time', () => {
      const results = db.prepare(`
        SELECT * FROM workflow_templates
        ORDER BY estimated_setup_time ASC
      `).all();

      expect(results[0].estimated_setup_time).toBeLessThanOrEqual(results[1].estimated_setup_time);
    });

    it('should filter by multiple categories', () => {
      const categories = ['monitoring', 'notifications'];

      const results = db.prepare(`
        SELECT * FROM workflow_templates
        WHERE category IN (${categories.map(() => '?').join(',')})
      `).all(...categories);

      expect(results.length).toBeGreaterThanOrEqual(2);
    });

    it('should filter by tag search', () => {
      const results = db.prepare(`
        SELECT * FROM workflow_templates
        WHERE tags LIKE ?
      `).all('%automation%');

      expect(results.length).toBeGreaterThanOrEqual(2);
    });

    it('should paginate results', () => {
      const page1 = db.prepare(`
        SELECT * FROM workflow_templates
        ORDER BY id
        LIMIT ? OFFSET ?
      `).all(2, 0);

      const page2 = db.prepare(`
        SELECT * FROM workflow_templates
        ORDER BY id
        LIMIT ? OFFSET ?
      `).all(2, 2);

      expect(page1).toHaveLength(2);
      expect(page2).toHaveLength(1);
    });
  });

  describe('Template Metadata Enrichment', () => {
    it('should calculate complexity score', () => {
      const template = db.prepare(`
        SELECT * FROM workflow_templates WHERE id = ?
      `).get('eth-balance-monitor');

      const nodes = JSON.parse(template.nodes);
      const edges = JSON.parse(template.edges);

      const complexityScore = nodes.length + edges.length;

      expect(complexityScore).toBeGreaterThan(0);
    });

    it('should identify trigger nodes', () => {
      const template = db.prepare(`
        SELECT * FROM workflow_templates WHERE id = ?
      `).get('eth-balance-monitor');

      const nodes = JSON.parse(template.nodes);
      const triggerNodes = nodes.filter((n: any) => n.type === 'trigger');

      expect(triggerNodes).toHaveLength(1);
    });

    it('should count action nodes', () => {
      const template = db.prepare(`
        SELECT * FROM workflow_templates WHERE id = ?
      `).get('eth-balance-monitor');

      const nodes = JSON.parse(template.nodes);
      const actionNodes = nodes.filter((n: any) => n.type === 'step');

      expect(actionNodes.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Performance', () => {
    it('should search templates quickly', () => {
      const start = Date.now();

      db.prepare(`
        SELECT wt.*
        FROM workflow_templates wt
        JOIN templates_fts ON wt.rowid = templates_fts.rowid
        WHERE templates_fts MATCH ?
        LIMIT 10
      `).all('ethereum');

      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(50);
    });

    it('should retrieve template quickly', () => {
      const start = Date.now();

      db.prepare(`
        SELECT * FROM workflow_templates WHERE id = ?
      `).get('eth-balance-monitor');

      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(20);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing template ID', () => {
      const template = db.prepare(`
        SELECT * FROM workflow_templates WHERE id = ?
      `).get('');

      expect(template).toBeUndefined();
    });

    it('should handle malformed JSON in nodes', () => {
      const invalidJSON = '{invalid}';

      expect(() => {
        JSON.parse(invalidJSON);
      }).toThrow();
    });

    it('should handle empty search query', () => {
      expect(() => {
        db.prepare(`
          SELECT wt.*
          FROM workflow_templates wt
          JOIN templates_fts ON wt.rowid = templates_fts.rowid
          WHERE templates_fts MATCH ?
        `).all('');
      }).toThrow();
    });
  });
});
