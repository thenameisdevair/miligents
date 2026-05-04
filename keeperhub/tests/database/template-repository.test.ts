import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';

describe('Template Repository', () => {
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

      CREATE TRIGGER templates_ad AFTER DELETE ON workflow_templates BEGIN
        DELETE FROM templates_fts WHERE rowid = old.rowid;
      END;

      CREATE TRIGGER templates_au AFTER UPDATE ON workflow_templates BEGIN
        UPDATE templates_fts SET
          template_id = new.id,
          name = new.name,
          description = new.description,
          use_case = new.use_case,
          tags = new.tags
        WHERE rowid = new.rowid;
      END;
    `);
  });

  afterEach(() => {
    db.close();
  });

  describe('Template CRUD Operations', () => {
    it('should insert a workflow template', () => {
      const nodes = JSON.stringify([
        { id: 'trigger', type: 'trigger', pluginType: 'schedule' },
      ]);

      const edges = JSON.stringify([
        { id: 'e1', source: 'trigger', target: 'action' },
      ]);

      const tags = JSON.stringify(['ethereum', 'monitoring']);
      const requiredPlugins = JSON.stringify(['web3', 'sendgrid']);

      const stmt = db.prepare(`
        INSERT INTO workflow_templates (
          id, name, description, category, use_case, difficulty,
          tags, nodes, edges, required_plugins, estimated_setup_time
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        'eth-balance-monitor',
        'ETH Balance Monitor',
        'Monitor ETH balance and send alerts',
        'monitoring',
        'Monitor wallet balance for low ETH',
        'beginner',
        tags,
        nodes,
        edges,
        requiredPlugins,
        5
      );

      expect(result.changes).toBe(1);

      const template = db.prepare('SELECT * FROM workflow_templates WHERE id = ?').get('eth-balance-monitor');
      expect(template).toBeDefined();
      expect(template.name).toBe('ETH Balance Monitor');
    });

    it('should retrieve a template by ID', () => {
      db.prepare(`
        INSERT INTO workflow_templates (
          id, name, description, category, use_case, nodes, edges
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        'test-template',
        'Test Template',
        'Test description',
        'testing',
        'For testing purposes',
        '[]',
        '[]'
      );

      const template = db.prepare('SELECT * FROM workflow_templates WHERE id = ?').get('test-template');

      expect(template).toBeDefined();
      expect(template.category).toBe('testing');
    });

    it('should update a template', () => {
      db.prepare(`
        INSERT INTO workflow_templates (
          id, name, description, category, use_case, nodes, edges
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run('template-1', 'Template 1', 'Old description', 'monitoring', 'Use case', '[]', '[]');

      db.prepare(`
        UPDATE workflow_templates
        SET description = ?, difficulty = ?
        WHERE id = ?
      `).run('Updated description with new features', 'intermediate', 'template-1');

      const template = db.prepare('SELECT * FROM workflow_templates WHERE id = ?').get('template-1');
      expect(template.description).toBe('Updated description with new features');
      expect(template.difficulty).toBe('intermediate');
    });

    it('should delete a template', () => {
      db.prepare(`
        INSERT INTO workflow_templates (
          id, name, description, category, use_case, nodes, edges
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run('delete-me', 'Delete Me', 'Will be deleted', 'test', 'Testing', '[]', '[]');

      db.prepare('DELETE FROM workflow_templates WHERE id = ?').run('delete-me');

      const template = db.prepare('SELECT * FROM workflow_templates WHERE id = ?').get('delete-me');
      expect(template).toBeUndefined();
    });

    it('should enforce unique template ID constraint', () => {
      db.prepare(`
        INSERT INTO workflow_templates (
          id, name, description, category, use_case, nodes, edges
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run('unique-id', 'Template', 'Description', 'category', 'Use case', '[]', '[]');

      expect(() => {
        db.prepare(`
          INSERT INTO workflow_templates (
            id, name, description, category, use_case, nodes, edges
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run('unique-id', 'Template 2', 'Different description', 'category', 'Use case', '[]', '[]');
      }).toThrow();
    });

    it('should list templates by category', () => {
      const templates = [
        ['mon-1', 'Monitor 1', 'Desc', 'monitoring', 'Use case', '[]', '[]'],
        ['mon-2', 'Monitor 2', 'Desc', 'monitoring', 'Use case', '[]', '[]'],
        ['trans-1', 'Transfer 1', 'Desc', 'transfers', 'Use case', '[]', '[]'],
      ];

      const stmt = db.prepare(`
        INSERT INTO workflow_templates (id, name, description, category, use_case, nodes, edges)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      templates.forEach((t) => stmt.run(...t));

      const results = db.prepare('SELECT * FROM workflow_templates WHERE category = ?').all('monitoring');
      expect(results).toHaveLength(2);
    });

    it('should filter templates by difficulty', () => {
      db.prepare(`
        INSERT INTO workflow_templates (
          id, name, description, category, use_case, difficulty, nodes, edges
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run('easy', 'Easy Template', 'Desc', 'cat', 'Use case', 'beginner', '[]', '[]');

      db.prepare(`
        INSERT INTO workflow_templates (
          id, name, description, category, use_case, difficulty, nodes, edges
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run('hard', 'Hard Template', 'Desc', 'cat', 'Use case', 'advanced', '[]', '[]');

      const beginnerTemplates = db.prepare(
        'SELECT * FROM workflow_templates WHERE difficulty = ?'
      ).all('beginner');

      expect(beginnerTemplates).toHaveLength(1);
      expect(beginnerTemplates[0].id).toBe('easy');
    });
  });

  describe('Template JSON Field Validation', () => {
    it('should store and retrieve nodes JSON correctly', () => {
      const nodes = [
        { id: 'trigger', type: 'trigger', pluginType: 'schedule', position: { x: 100, y: 200 } },
        { id: 'action', type: 'step', pluginType: 'web3', stepSlug: 'check-balance' },
      ];

      db.prepare(`
        INSERT INTO workflow_templates (
          id, name, description, category, use_case, nodes, edges
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run('test', 'Test', 'Desc', 'cat', 'Use case', JSON.stringify(nodes), '[]');

      const template = db.prepare('SELECT * FROM workflow_templates WHERE id = ?').get('test');
      const parsedNodes = JSON.parse(template.nodes);

      expect(parsedNodes).toHaveLength(2);
      expect(parsedNodes[0].id).toBe('trigger');
      expect(parsedNodes[1].stepSlug).toBe('check-balance');
    });

    it('should store and retrieve edges JSON correctly', () => {
      const edges = [
        { id: 'e1', source: 'trigger', target: 'action' },
        { id: 'e2', source: 'action', target: 'notify', condition: '{{action.success}}' },
      ];

      db.prepare(`
        INSERT INTO workflow_templates (
          id, name, description, category, use_case, nodes, edges
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run('test', 'Test', 'Desc', 'cat', 'Use case', '[]', JSON.stringify(edges));

      const template = db.prepare('SELECT * FROM workflow_templates WHERE id = ?').get('test');
      const parsedEdges = JSON.parse(template.edges);

      expect(parsedEdges).toHaveLength(2);
      expect(parsedEdges[1].condition).toBe('{{action.success}}');
    });

    it('should store and retrieve tags array correctly', () => {
      const tags = ['ethereum', 'monitoring', 'automation', 'wallet-management'];

      db.prepare(`
        INSERT INTO workflow_templates (
          id, name, description, category, use_case, tags, nodes, edges
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run('test', 'Test', 'Desc', 'cat', 'Use case', JSON.stringify(tags), '[]', '[]');

      const template = db.prepare('SELECT * FROM workflow_templates WHERE id = ?').get('test');
      const parsedTags = JSON.parse(template.tags);

      expect(parsedTags).toHaveLength(4);
      expect(parsedTags).toContain('ethereum');
    });

    it('should store and retrieve required_plugins array correctly', () => {
      const requiredPlugins = ['web3', 'sendgrid', 'discord'];

      db.prepare(`
        INSERT INTO workflow_templates (
          id, name, description, category, use_case, required_plugins, nodes, edges
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run('test', 'Test', 'Desc', 'cat', 'Use case', JSON.stringify(requiredPlugins), '[]', '[]');

      const template = db.prepare('SELECT * FROM workflow_templates WHERE id = ?').get('test');
      const parsedPlugins = JSON.parse(template.required_plugins);

      expect(parsedPlugins).toHaveLength(3);
      expect(parsedPlugins).toContain('web3');
    });

    it('should handle complex nested JSON in nodes', () => {
      const nodes = [
        {
          id: 'check-balance',
          type: 'step',
          pluginType: 'web3',
          stepSlug: 'check-balance',
          config: {
            network: 'ethereum',
            address: '{{env.WALLET_ADDRESS}}',
          },
          position: { x: 300, y: 200 },
        },
      ];

      db.prepare(`
        INSERT INTO workflow_templates (
          id, name, description, category, use_case, nodes, edges
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run('test', 'Test', 'Desc', 'cat', 'Use case', JSON.stringify(nodes), '[]');

      const template = db.prepare('SELECT * FROM workflow_templates WHERE id = ?').get('test');
      const parsedNodes = JSON.parse(template.nodes);

      expect(parsedNodes[0].config.network).toBe('ethereum');
      expect(parsedNodes[0].config.address).toBe('{{env.WALLET_ADDRESS}}');
    });
  });

  describe('Full-Text Search for Templates', () => {
    beforeEach(() => {
      const templates = [
        [
          'eth-monitor',
          'ETH Balance Monitor',
          'Monitor ETH wallet balance automatically',
          'monitoring',
          'Keep track of wallet balances and send alerts',
          JSON.stringify(['ethereum', 'balance', 'monitoring']),
        ],
        [
          'token-transfer',
          'Token Transfer Automation',
          'Automate ERC20 token transfers',
          'transfers',
          'Schedule and execute token transfers',
          JSON.stringify(['ethereum', 'tokens', 'automation']),
        ],
        [
          'gas-alert',
          'Gas Price Alert',
          'Get notified when gas prices drop',
          'notifications',
          'Monitor and alert on gas price changes',
          JSON.stringify(['ethereum', 'gas', 'alerts']),
        ],
      ];

      const stmt = db.prepare(`
        INSERT INTO workflow_templates (id, name, description, category, use_case, tags, nodes, edges)
        VALUES (?, ?, ?, ?, ?, ?, '[]', '[]')
      `);

      templates.forEach((t) => stmt.run(...t));
    });

    it('should search templates by name', () => {
      const results = db.prepare(`
        SELECT wt.* FROM workflow_templates wt
        JOIN templates_fts ON wt.rowid = templates_fts.rowid
        WHERE templates_fts MATCH ?
        ORDER BY rank
      `).all('balance');

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('eth-monitor');
    });

    it('should search templates by description', () => {
      const results = db.prepare(`
        SELECT wt.* FROM workflow_templates wt
        JOIN templates_fts ON wt.rowid = templates_fts.rowid
        WHERE templates_fts MATCH ?
      `).all('automate');

      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('should search templates by use case', () => {
      const results = db.prepare(`
        SELECT wt.* FROM workflow_templates wt
        JOIN templates_fts ON wt.rowid = templates_fts.rowid
        WHERE templates_fts MATCH ?
      `).all('alert');

      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('should search templates by tags', () => {
      const results = db.prepare(`
        SELECT wt.* FROM workflow_templates wt
        JOIN templates_fts ON wt.rowid = templates_fts.rowid
        WHERE templates_fts MATCH ?
      `).all('ethereum');

      expect(results).toHaveLength(3);
    });

    it('should support multi-keyword search', () => {
      const results = db.prepare(`
        SELECT wt.* FROM workflow_templates wt
        JOIN templates_fts ON wt.rowid = templates_fts.rowid
        WHERE templates_fts MATCH ?
      `).all('ethereum AND monitoring');

      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle FTS triggers on template update', () => {
      db.prepare(`
        UPDATE workflow_templates
        SET description = 'Monitor BTC balance automatically'
        WHERE id = 'eth-monitor'
      `).run();

      const results = db.prepare(`
        SELECT wt.* FROM workflow_templates wt
        JOIN templates_fts ON wt.rowid = templates_fts.rowid
        WHERE templates_fts MATCH ?
      `).all('BTC');

      expect(results).toHaveLength(1);
    });

    it('should handle FTS triggers on template delete', () => {
      db.prepare('DELETE FROM workflow_templates WHERE id = ?').run('gas-alert');

      const results = db.prepare(`
        SELECT wt.* FROM workflow_templates wt
        JOIN templates_fts ON wt.rowid = templates_fts.rowid
        WHERE templates_fts MATCH ?
      `).all('gas');

      expect(results).toHaveLength(0);
    });
  });

  describe('Template Queries and Filtering', () => {
    beforeEach(() => {
      const templates = [
        ['t1', 'Template 1', 'Desc 1', 'monitoring', 'UC1', 'beginner', JSON.stringify(['web3']), 5],
        ['t2', 'Template 2', 'Desc 2', 'transfers', 'UC2', 'intermediate', JSON.stringify(['web3', 'discord']), 10],
        ['t3', 'Template 3', 'Desc 3', 'monitoring', 'UC3', 'advanced', JSON.stringify(['web3', 'sendgrid']), 15],
      ];

      const stmt = db.prepare(`
        INSERT INTO workflow_templates (
          id, name, description, category, use_case, difficulty, required_plugins, estimated_setup_time, nodes, edges
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, '[]', '[]')
      `);

      templates.forEach((t) => stmt.run(...t));
    });

    it('should filter by category and difficulty', () => {
      const results = db.prepare(`
        SELECT * FROM workflow_templates
        WHERE category = ? AND difficulty = ?
      `).all('monitoring', 'beginner');

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('t1');
    });

    it('should sort by estimated setup time', () => {
      const results = db.prepare(`
        SELECT * FROM workflow_templates
        ORDER BY estimated_setup_time ASC
      `).all();

      expect(results[0].id).toBe('t1');
      expect(results[2].id).toBe('t3');
    });

    it('should find templates by required plugin', () => {
      const results = db.prepare(`
        SELECT * FROM workflow_templates
        WHERE required_plugins LIKE ?
      `).all('%discord%');

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('t2');
    });

    it('should paginate results', () => {
      const page1 = db.prepare(`
        SELECT * FROM workflow_templates
        ORDER BY id
        LIMIT 2 OFFSET 0
      `).all();

      const page2 = db.prepare(`
        SELECT * FROM workflow_templates
        ORDER BY id
        LIMIT 2 OFFSET 2
      `).all();

      expect(page1).toHaveLength(2);
      expect(page2).toHaveLength(1);
      expect(page1[0].id).toBe('t1');
      expect(page2[0].id).toBe('t3');
    });
  });

  describe('Edge Cases and Data Integrity', () => {
    it('should handle empty JSON arrays', () => {
      db.prepare(`
        INSERT INTO workflow_templates (
          id, name, description, category, use_case, tags, required_plugins, nodes, edges
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('test', 'Test', 'Desc', 'cat', 'UC', '[]', '[]', '[]', '[]');

      const template = db.prepare('SELECT * FROM workflow_templates WHERE id = ?').get('test');

      expect(JSON.parse(template.tags)).toEqual([]);
      expect(JSON.parse(template.nodes)).toEqual([]);
      expect(JSON.parse(template.edges)).toEqual([]);
    });

    it('should handle NULL optional fields', () => {
      db.prepare(`
        INSERT INTO workflow_templates (
          id, name, description, category, use_case, nodes, edges
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run('test', 'Test', 'Desc', 'cat', 'UC', '[]', '[]');

      const template = db.prepare('SELECT * FROM workflow_templates WHERE id = ?').get('test');

      expect(template.tags).toBeNull();
      expect(template.required_plugins).toBeNull();
    });

    it('should default difficulty to beginner', () => {
      db.prepare(`
        INSERT INTO workflow_templates (
          id, name, description, category, use_case, nodes, edges
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run('test', 'Test', 'Desc', 'cat', 'UC', '[]', '[]');

      const template = db.prepare('SELECT * FROM workflow_templates WHERE id = ?').get('test');

      expect(template.difficulty).toBe('beginner');
    });

    it('should default estimated_setup_time to 5', () => {
      db.prepare(`
        INSERT INTO workflow_templates (
          id, name, description, category, use_case, nodes, edges
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run('test', 'Test', 'Desc', 'cat', 'UC', '[]', '[]');

      const template = db.prepare('SELECT * FROM workflow_templates WHERE id = ?').get('test');

      expect(template.estimated_setup_time).toBe(5);
    });

    it('should handle very long template IDs', () => {
      const longId = 'very-long-template-id-'.repeat(10);

      db.prepare(`
        INSERT INTO workflow_templates (
          id, name, description, category, use_case, nodes, edges
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(longId, 'Test', 'Desc', 'cat', 'UC', '[]', '[]');

      const template = db.prepare('SELECT * FROM workflow_templates WHERE id = ?').get(longId);

      expect(template).toBeDefined();
    });

    it('should handle special characters in template content', () => {
      const specialChars = 'Template with "quotes", \\backslashes\\, and <tags>';

      db.prepare(`
        INSERT INTO workflow_templates (
          id, name, description, category, use_case, nodes, edges
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run('test', specialChars, 'Desc', 'cat', 'UC', '[]', '[]');

      const template = db.prepare('SELECT * FROM workflow_templates WHERE id = ?').get('test');

      expect(template.name).toBe(specialChars);
    });
  });
});
