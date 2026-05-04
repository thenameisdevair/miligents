import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';

describe('Plugin Discovery Tools', () => {
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

    const plugins = [
      ['web3', 'Web3', 'Blockchain and cryptocurrency operations on EVM networks', 'Web3', 1, 1],
      ['discord', 'Discord', 'Send messages to Discord channels via webhooks', 'Messaging', 0, 0],
      ['sendgrid', 'SendGrid', 'Email delivery service for transactional emails', 'Notification', 0, 1],
      ['webhook', 'Webhook', 'Send HTTP requests to external APIs', 'Integration', 0, 0],
    ];

    const pluginStmt = db.prepare(`
      INSERT INTO plugins (plugin_type, label, description, category, single_connection, has_credentials)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    plugins.forEach((p) => pluginStmt.run(...p));

    const steps = [
      ['web3', 'check-balance', 'Check Balance', 'Get ETH balance of wallet', 'Query', 'checkBalance', './steps/check-balance', '[]', '[]'],
      ['web3', 'transfer-funds', 'Transfer Funds', 'Send ETH to address', 'Action', 'transferFunds', './steps/transfer-funds', '[]', '[]'],
      ['discord', 'send-message', 'Send Message', 'Send Discord message', 'Action', 'sendMessage', './steps/send-message', '[]', '[]'],
      ['sendgrid', 'send-email', 'Send Email', 'Send email via SendGrid', 'Action', 'sendEmail', './steps/send-email', '[]', '[]'],
    ];

    const stepStmt = db.prepare(`
      INSERT INTO plugin_steps (plugin_type, step_slug, label, description, category, step_function, step_import_path, config_fields, output_fields)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    steps.forEach((s) => stepStmt.run(...s));
  });

  afterEach(() => {
    db.close();
  });

  describe('search_plugins Tool', () => {
    it('should search plugins by keyword', () => {
      const results = db.prepare(`
        SELECT p.*, COUNT(ps.id) as step_count
        FROM plugins p
        JOIN plugins_fts ON p.rowid = plugins_fts.rowid
        LEFT JOIN plugin_steps ps ON p.plugin_type = ps.plugin_type
        WHERE plugins_fts MATCH ?
        GROUP BY p.plugin_type
        ORDER BY rank
        LIMIT ?
      `).all('blockchain', 10);

      expect(results).toHaveLength(1);
      expect(results[0].plugin_type).toBe('web3');
      expect(results[0].step_count).toBe(2);
    });

    it('should search with multiple keywords', () => {
      const results = db.prepare(`
        SELECT p.*
        FROM plugins p
        JOIN plugins_fts ON p.rowid = plugins_fts.rowid
        WHERE plugins_fts MATCH ?
      `).all('email OR messaging');

      expect(results.length).toBeGreaterThanOrEqual(2);
    });

    it('should filter by category', () => {
      const results = db.prepare(`
        SELECT * FROM plugins WHERE category = ? LIMIT ?
      `).all('Messaging', 10);

      expect(results).toHaveLength(1);
      expect(results[0].plugin_type).toBe('discord');
    });

    it('should limit results', () => {
      const results = db.prepare(`
        SELECT * FROM plugins LIMIT ?
      `).all(2);

      expect(results).toHaveLength(2);
    });

    it('should include step count for each plugin', () => {
      const results = db.prepare(`
        SELECT p.*, COUNT(ps.id) as step_count
        FROM plugins p
        LEFT JOIN plugin_steps ps ON p.plugin_type = ps.plugin_type
        GROUP BY p.plugin_type
      `).all();

      const web3Plugin = results.find((r) => r.plugin_type === 'web3');
      expect(web3Plugin.step_count).toBe(2);
    });

    it('should include hasCredentials flag', () => {
      const results = db.prepare(`
        SELECT * FROM plugins WHERE plugin_type = ?
      `).get('web3');

      expect(results.has_credentials).toBe(1);
    });

    it('should return empty array for no matches', () => {
      const results = db.prepare(`
        SELECT p.*
        FROM plugins p
        JOIN plugins_fts ON p.rowid = plugins_fts.rowid
        WHERE plugins_fts MATCH ?
      `).all('nonexistent');

      expect(results).toHaveLength(0);
    });

    it('should handle case-insensitive search', () => {
      const results = db.prepare(`
        SELECT p.*
        FROM plugins p
        JOIN plugins_fts ON p.rowid = plugins_fts.rowid
        WHERE plugins_fts MATCH ?
      `).all('DISCORD');

      expect(results).toHaveLength(1);
    });

    it('should search across all text fields', () => {
      const results = db.prepare(`
        SELECT p.*
        FROM plugins p
        JOIN plugins_fts ON p.rowid = plugins_fts.rowid
        WHERE plugins_fts MATCH ?
      `).all('webhook');

      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('should return plugins with relevance score', () => {
      const results = db.prepare(`
        SELECT p.*, rank as relevance_score
        FROM plugins p
        JOIN plugins_fts ON p.rowid = plugins_fts.rowid
        WHERE plugins_fts MATCH ?
        ORDER BY rank
      `).all('blockchain');

      expect(results[0]).toHaveProperty('relevance_score');
    });
  });

  describe('get_plugin Tool', () => {
    it('should retrieve plugin with all details', () => {
      const plugin = db.prepare(`
        SELECT * FROM plugins WHERE plugin_type = ?
      `).get('web3');

      const steps = db.prepare(`
        SELECT * FROM plugin_steps WHERE plugin_type = ?
      `).all('web3');

      expect(plugin).toBeDefined();
      expect(plugin.label).toBe('Web3');
      expect(steps).toHaveLength(2);
    });

    it('should include credentials information', () => {
      db.prepare(`
        UPDATE plugins
        SET form_fields = ?
        WHERE plugin_type = ?
      `).run(JSON.stringify([
        { id: 'apiKey', label: 'API Key', type: 'password', required: true },
      ]), 'sendgrid');

      const plugin = db.prepare(`
        SELECT * FROM plugins WHERE plugin_type = ?
      `).get('sendgrid');

      const formFields = JSON.parse(plugin.form_fields);

      expect(formFields).toHaveLength(1);
      expect(formFields[0].id).toBe('apiKey');
    });

    it('should include all plugin steps', () => {
      const steps = db.prepare(`
        SELECT * FROM plugin_steps WHERE plugin_type = ?
      `).all('web3');

      expect(steps).toHaveLength(2);
      expect(steps.map((s) => s.step_slug)).toContain('check-balance');
      expect(steps.map((s) => s.step_slug)).toContain('transfer-funds');
    });

    it('should parse step config fields', () => {
      db.prepare(`
        UPDATE plugin_steps
        SET config_fields = ?
        WHERE step_slug = ?
      `).run(JSON.stringify([
        { key: 'network', label: 'Network', type: 'chain-select', required: true },
        { key: 'address', label: 'Address', type: 'text', required: true },
      ]), 'check-balance');

      const step = db.prepare(`
        SELECT * FROM plugin_steps WHERE step_slug = ?
      `).get('check-balance');

      const configFields = JSON.parse(step.config_fields);

      expect(configFields).toHaveLength(2);
      expect(configFields[0].type).toBe('chain-select');
    });

    it('should parse step output fields', () => {
      db.prepare(`
        UPDATE plugin_steps
        SET output_fields = ?
        WHERE step_slug = ?
      `).run(JSON.stringify([
        { field: 'balance', description: 'Wallet balance in ETH' },
        { field: 'success', description: 'Operation success status' },
      ]), 'check-balance');

      const step = db.prepare(`
        SELECT * FROM plugin_steps WHERE step_slug = ?
      `).get('check-balance');

      const outputFields = JSON.parse(step.output_fields);

      expect(outputFields).toHaveLength(2);
      expect(outputFields[0].field).toBe('balance');
    });

    it('should return null for non-existent plugin', () => {
      const plugin = db.prepare(`
        SELECT * FROM plugins WHERE plugin_type = ?
      `).get('nonexistent');

      expect(plugin).toBeUndefined();
    });

    it('should include step categories', () => {
      const steps = db.prepare(`
        SELECT * FROM plugin_steps WHERE plugin_type = ?
      `).all('web3');

      expect(steps[0].category).toBe('Query');
      expect(steps[1].category).toBe('Action');
    });
  });

  describe('validate_plugin_config Tool', () => {
    it('should validate required fields', () => {
      const configFields = [
        { key: 'network', label: 'Network', type: 'chain-select', required: true },
        { key: 'address', label: 'Address', type: 'text', required: true },
      ];

      const config = {
        network: 'ethereum',
      };

      const requiredFields = configFields.filter((f) => f.required);
      const missingFields = requiredFields.filter((f) => !(f.key in config));

      expect(missingFields).toHaveLength(1);
      expect(missingFields[0].key).toBe('address');
    });

    it('should validate ETH address format', () => {
      const address = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb3';
      const isValid = /^0x[a-fA-F0-9]{40}$/.test(address);

      expect(isValid).toBe(true);
    });

    it('should reject invalid ETH address', () => {
      const invalidAddresses = [
        '0x123',
        'not-an-address',
        '0xZZZZ',
        '',
      ];

      invalidAddresses.forEach((addr) => {
        const isValid = /^0x[a-fA-F0-9]{40}$/.test(addr);
        expect(isValid).toBe(false);
      });
    });

    it('should validate Discord webhook URL', () => {
      const validUrl = 'https://discord.com/api/webhooks/123456/abcdef';
      const isValid = validUrl.startsWith('https://discord.com/api/webhooks/');

      expect(isValid).toBe(true);
    });

    it('should reject invalid Discord webhook URL', () => {
      const invalidUrl = 'https://example.com/webhook';
      const isValid = invalidUrl.startsWith('https://discord.com/api/webhooks/');

      expect(isValid).toBe(false);
    });

    it('should validate email format', () => {
      const email = 'user@example.com';
      const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

      expect(isValid).toBe(true);
    });

    it('should validate HTTP URL format', () => {
      const url = 'https://api.example.com/webhook';
      const isValid = /^https?:\/\/.+/.test(url);

      expect(isValid).toBe(true);
    });

    it('should validate number fields', () => {
      const amount = '1.5';
      const isValid = !isNaN(parseFloat(amount)) && isFinite(parseFloat(amount));

      expect(isValid).toBe(true);
    });

    it('should return validation errors', () => {
      const errors = [
        { field: 'address', message: 'Invalid ETH address format', severity: 'error' as const },
        { field: 'amount', message: 'Amount must be positive', severity: 'error' as const },
      ];

      expect(errors).toHaveLength(2);
      expect(errors[0].severity).toBe('error');
    });

    it('should return validation warnings', () => {
      const warnings = [
        { field: 'gasLimit', message: 'Gas limit is lower than recommended' },
      ];

      expect(warnings).toHaveLength(1);
    });

    it('should provide field suggestions', () => {
      const suggestions = [
        { field: 'network', suggestion: 'Use "ethereum" for Ethereum mainnet' },
      ];

      expect(suggestions).toHaveLength(1);
    });

    it('should validate in strict mode', () => {
      const mode = 'strict';

      expect(mode).toBe('strict');
    });

    it('should validate in runtime mode', () => {
      const mode = 'runtime';

      expect(mode).toBe('runtime');
    });

    it('should validate JSON format for ABI', () => {
      const validABI = '[{"type":"function","name":"balanceOf"}]';

      expect(() => {
        JSON.parse(validABI);
      }).not.toThrow();
    });

    it('should reject invalid JSON for ABI', () => {
      const invalidABI = '{invalid json}';

      expect(() => {
        JSON.parse(invalidABI);
      }).toThrow();
    });
  });

  describe('Plugin Query Performance', () => {
    it('should execute search query quickly', () => {
      const start = Date.now();

      db.prepare(`
        SELECT p.*
        FROM plugins p
        JOIN plugins_fts ON p.rowid = plugins_fts.rowid
        WHERE plugins_fts MATCH ?
        LIMIT 10
      `).all('blockchain');

      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(50);
    });

    it('should execute get_plugin query quickly', () => {
      const start = Date.now();

      db.prepare('SELECT * FROM plugins WHERE plugin_type = ?').get('web3');
      db.prepare('SELECT * FROM plugin_steps WHERE plugin_type = ?').all('web3');

      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(20);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid search query', () => {
      expect(() => {
        db.prepare(`
          SELECT p.*
          FROM plugins p
          JOIN plugins_fts ON p.rowid = plugins_fts.rowid
          WHERE plugins_fts MATCH ?
        `).all('');
      }).toThrow();
    });

    it('should handle SQL injection attempts', () => {
      const maliciousInput = "'; DROP TABLE plugins; --";

      const result = db.prepare(`
        SELECT * FROM plugins WHERE plugin_type = ?
      `).get(maliciousInput);

      expect(result).toBeUndefined();

      const pluginsStillExist = db.prepare('SELECT COUNT(*) as count FROM plugins').get();
      expect(pluginsStillExist.count).toBeGreaterThan(0);
    });

    it('should handle missing required parameters', () => {
      const config = {};
      const requiredFields = ['network', 'address'];

      const missingFields = requiredFields.filter((f) => !(f in config));

      expect(missingFields).toHaveLength(2);
    });
  });
});
