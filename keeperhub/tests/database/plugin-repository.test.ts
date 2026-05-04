import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';

describe('Plugin Repository', () => {
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

      CREATE TRIGGER plugins_ad AFTER DELETE ON plugins BEGIN
        DELETE FROM plugins_fts WHERE rowid = old.rowid;
      END;

      CREATE TRIGGER plugins_au AFTER UPDATE ON plugins BEGIN
        UPDATE plugins_fts SET
          plugin_type = new.plugin_type,
          label = new.label,
          description = new.description,
          category = new.category
        WHERE rowid = new.rowid;
      END;

      CREATE TRIGGER steps_ai AFTER INSERT ON plugin_steps BEGIN
        INSERT INTO steps_fts(rowid, plugin_type, step_slug, label, description, category)
        VALUES (new.id, new.plugin_type, new.step_slug, new.label, new.description, new.category);
      END;

      CREATE TRIGGER steps_ad AFTER DELETE ON plugin_steps BEGIN
        DELETE FROM steps_fts WHERE rowid = old.id;
      END;

      CREATE TRIGGER steps_au AFTER UPDATE ON plugin_steps BEGIN
        UPDATE steps_fts SET
          plugin_type = new.plugin_type,
          step_slug = new.step_slug,
          label = new.label,
          description = new.description,
          category = new.category
        WHERE rowid = new.id;
      END;
    `);
  });

  afterEach(() => {
    db.close();
  });

  describe('Plugin CRUD Operations', () => {
    it('should insert a plugin successfully', () => {
      const stmt = db.prepare(`
        INSERT INTO plugins (plugin_type, label, description, category, has_credentials)
        VALUES (?, ?, ?, ?, ?)
      `);

      const result = stmt.run('web3', 'Web3', 'Blockchain integration plugin', 'Web3', 1);

      expect(result.changes).toBe(1);

      const plugin = db.prepare('SELECT * FROM plugins WHERE plugin_type = ?').get('web3');
      expect(plugin).toMatchObject({
        plugin_type: 'web3',
        label: 'Web3',
        description: 'Blockchain integration plugin',
        category: 'Web3',
        has_credentials: 1,
      });
    });

    it('should retrieve a plugin by type', () => {
      db.prepare(`
        INSERT INTO plugins (plugin_type, label, description, category)
        VALUES ('discord', 'Discord', 'Send Discord messages', 'Messaging')
      `).run();

      const plugin = db.prepare('SELECT * FROM plugins WHERE plugin_type = ?').get('discord');

      expect(plugin).toBeDefined();
      expect(plugin.label).toBe('Discord');
    });

    it('should update a plugin', () => {
      db.prepare(`
        INSERT INTO plugins (plugin_type, label, description, category)
        VALUES ('webhook', 'Webhook', 'HTTP webhook integration', 'Integration')
      `).run();

      db.prepare(`
        UPDATE plugins
        SET description = ?
        WHERE plugin_type = ?
      `).run('Send HTTP webhooks to external services', 'webhook');

      const plugin = db.prepare('SELECT * FROM plugins WHERE plugin_type = ?').get('webhook');
      expect(plugin.description).toBe('Send HTTP webhooks to external services');
    });

    it('should delete a plugin', () => {
      db.prepare(`
        INSERT INTO plugins (plugin_type, label, description, category)
        VALUES ('sendgrid', 'SendGrid', 'Email service', 'Notification')
      `).run();

      db.prepare('DELETE FROM plugins WHERE plugin_type = ?').run('sendgrid');

      const plugin = db.prepare('SELECT * FROM plugins WHERE plugin_type = ?').get('sendgrid');
      expect(plugin).toBeUndefined();
    });

    it('should enforce unique plugin_type constraint', () => {
      db.prepare(`
        INSERT INTO plugins (plugin_type, label, description, category)
        VALUES ('web3', 'Web3', 'Blockchain plugin', 'Web3')
      `).run();

      expect(() => {
        db.prepare(`
          INSERT INTO plugins (plugin_type, label, description, category)
          VALUES ('web3', 'Web3 V2', 'Updated plugin', 'Web3')
        `).run();
      }).toThrow();
    });

    it('should list all plugins', () => {
      const plugins = [
        ['web3', 'Web3', 'Blockchain integration', 'Web3'],
        ['discord', 'Discord', 'Discord messaging', 'Messaging'],
        ['sendgrid', 'SendGrid', 'Email service', 'Notification'],
      ];

      const stmt = db.prepare(`
        INSERT INTO plugins (plugin_type, label, description, category)
        VALUES (?, ?, ?, ?)
      `);

      plugins.forEach((p) => stmt.run(...p));

      const results = db.prepare('SELECT * FROM plugins ORDER BY plugin_type').all();
      expect(results).toHaveLength(3);
      expect(results[0].plugin_type).toBe('discord');
    });
  });

  describe('Plugin Steps CRUD Operations', () => {
    beforeEach(() => {
      db.prepare(`
        INSERT INTO plugins (plugin_type, label, description, category)
        VALUES ('web3', 'Web3', 'Blockchain plugin', 'Web3')
      `).run();
    });

    it('should insert a plugin step', () => {
      const stmt = db.prepare(`
        INSERT INTO plugin_steps (
          plugin_type, step_slug, label, description, category,
          step_function, step_import_path, config_fields, output_fields
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const configFields = JSON.stringify([
        { key: 'network', label: 'Network', type: 'chain-select', required: true },
        { key: 'address', label: 'Address', type: 'text', required: true },
      ]);

      const outputFields = JSON.stringify([
        { field: 'balance', description: 'Wallet balance in ETH' },
      ]);

      const result = stmt.run(
        'web3',
        'check-balance',
        'Check Balance',
        'Get ETH balance of address',
        'Query',
        'checkBalance',
        './steps/check-balance',
        configFields,
        outputFields
      );

      expect(result.changes).toBe(1);

      const step = db.prepare('SELECT * FROM plugin_steps WHERE step_slug = ?').get('check-balance');
      expect(step).toBeDefined();
      expect(step.label).toBe('Check Balance');
    });

    it('should retrieve steps for a plugin', () => {
      const stmt = db.prepare(`
        INSERT INTO plugin_steps (
          plugin_type, step_slug, label, description, category,
          step_function, step_import_path, config_fields, output_fields
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run('web3', 'check-balance', 'Check Balance', 'Check balance', 'Query', 'fn', 'path', '[]', '[]');
      stmt.run('web3', 'transfer-funds', 'Transfer Funds', 'Transfer ETH', 'Action', 'fn', 'path', '[]', '[]');

      const steps = db.prepare('SELECT * FROM plugin_steps WHERE plugin_type = ?').all('web3');
      expect(steps).toHaveLength(2);
    });

    it('should enforce foreign key constraint on plugin deletion', () => {
      db.prepare(`
        INSERT INTO plugin_steps (
          plugin_type, step_slug, label, description, category,
          step_function, step_import_path, config_fields, output_fields
        ) VALUES ('web3', 'check-balance', 'Check Balance', 'desc', 'Query', 'fn', 'path', '[]', '[]')
      `).run();

      db.prepare('PRAGMA foreign_keys = ON').run();
      db.prepare('DELETE FROM plugins WHERE plugin_type = ?').run('web3');

      const steps = db.prepare('SELECT * FROM plugin_steps WHERE plugin_type = ?').all('web3');
      expect(steps).toHaveLength(0);
    });

    it('should parse JSON config_fields correctly', () => {
      const configFields = [
        { key: 'network', label: 'Network', type: 'chain-select', required: true },
        { key: 'address', label: 'Address', type: 'text', required: true },
      ];

      db.prepare(`
        INSERT INTO plugin_steps (
          plugin_type, step_slug, label, description, category,
          step_function, step_import_path, config_fields, output_fields
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('web3', 'check-balance', 'Check Balance', 'desc', 'Query', 'fn', 'path', JSON.stringify(configFields), '[]');

      const step = db.prepare('SELECT * FROM plugin_steps WHERE step_slug = ?').get('check-balance');
      const parsed = JSON.parse(step.config_fields);

      expect(parsed).toHaveLength(2);
      expect(parsed[0].key).toBe('network');
      expect(parsed[1].required).toBe(true);
    });

    it('should enforce unique constraint on plugin_type and step_slug', () => {
      const stmt = db.prepare(`
        INSERT INTO plugin_steps (
          plugin_type, step_slug, label, description, category,
          step_function, step_import_path, config_fields, output_fields
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run('web3', 'check-balance', 'Check Balance', 'desc', 'Query', 'fn', 'path', '[]', '[]');

      expect(() => {
        stmt.run('web3', 'check-balance', 'Check Balance V2', 'desc', 'Query', 'fn', 'path', '[]', '[]');
      }).toThrow();
    });
  });

  describe('Full-Text Search (FTS5)', () => {
    beforeEach(() => {
      const plugins = [
        ['web3', 'Web3', 'Blockchain and cryptocurrency operations', 'Web3'],
        ['discord', 'Discord', 'Send messages to Discord channels', 'Messaging'],
        ['sendgrid', 'SendGrid', 'Email delivery service integration', 'Notification'],
        ['webhook', 'Webhook', 'HTTP webhook integration', 'Integration'],
      ];

      const stmt = db.prepare(`
        INSERT INTO plugins (plugin_type, label, description, category)
        VALUES (?, ?, ?, ?)
      `);

      plugins.forEach((p) => stmt.run(...p));
    });

    it('should search plugins by keyword', () => {
      const results = db.prepare(`
        SELECT p.* FROM plugins p
        JOIN plugins_fts ON p.rowid = plugins_fts.rowid
        WHERE plugins_fts MATCH ?
        ORDER BY rank
      `).all('blockchain');

      expect(results).toHaveLength(1);
      expect(results[0].plugin_type).toBe('web3');
    });

    it('should search plugins by multiple keywords', () => {
      const results = db.prepare(`
        SELECT p.* FROM plugins p
        JOIN plugins_fts ON p.rowid = plugins_fts.rowid
        WHERE plugins_fts MATCH ?
        ORDER BY rank
      `).all('email OR messaging');

      expect(results.length).toBeGreaterThanOrEqual(2);
    });

    it('should search case-insensitively', () => {
      const results = db.prepare(`
        SELECT p.* FROM plugins p
        JOIN plugins_fts ON p.rowid = plugins_fts.rowid
        WHERE plugins_fts MATCH ?
      `).all('WEBHOOK');

      expect(results).toHaveLength(1);
      expect(results[0].plugin_type).toBe('webhook');
    });

    it('should return empty results for non-matching search', () => {
      const results = db.prepare(`
        SELECT p.* FROM plugins p
        JOIN plugins_fts ON p.rowid = plugins_fts.rowid
        WHERE plugins_fts MATCH ?
      `).all('nonexistent');

      expect(results).toHaveLength(0);
    });

    it('should search plugin steps', () => {
      db.prepare(`
        INSERT INTO plugin_steps (
          plugin_type, step_slug, label, description, category,
          step_function, step_import_path, config_fields, output_fields
        ) VALUES ('web3', 'check-balance', 'Check Balance', 'Get ETH balance of wallet address', 'Query', 'fn', 'path', '[]', '[]')
      `).run();

      const results = db.prepare(`
        SELECT ps.* FROM plugin_steps ps
        JOIN steps_fts ON ps.id = steps_fts.rowid
        WHERE steps_fts MATCH ?
      `).all('balance');

      expect(results).toHaveLength(1);
      expect(results[0].step_slug).toBe('check-balance');
    });

    it('should handle FTS triggers on update', () => {
      db.prepare(`
        UPDATE plugins
        SET description = 'Smart contract and DeFi operations'
        WHERE plugin_type = 'web3'
      `).run();

      const results = db.prepare(`
        SELECT p.* FROM plugins p
        JOIN plugins_fts ON p.rowid = plugins_fts.rowid
        WHERE plugins_fts MATCH ?
      `).all('DeFi');

      expect(results).toHaveLength(1);
      expect(results[0].plugin_type).toBe('web3');
    });

    it('should handle FTS triggers on delete', () => {
      db.prepare('DELETE FROM plugins WHERE plugin_type = ?').run('discord');

      const results = db.prepare(`
        SELECT p.* FROM plugins p
        JOIN plugins_fts ON p.rowid = plugins_fts.rowid
        WHERE plugins_fts MATCH ?
      `).all('Discord');

      expect(results).toHaveLength(0);
    });
  });

  describe('Database Performance', () => {
    it('should handle bulk inserts efficiently', () => {
      const start = Date.now();
      const stmt = db.prepare(`
        INSERT INTO plugins (plugin_type, label, description, category)
        VALUES (?, ?, ?, ?)
      `);

      db.transaction(() => {
        for (let i = 0; i < 100; i++) {
          stmt.run(`plugin-${i}`, `Plugin ${i}`, `Description ${i}`, 'Integration');
        }
      })();

      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(1000);

      const count = db.prepare('SELECT COUNT(*) as count FROM plugins').get();
      expect(count.count).toBe(100);
    });

    it('should search large dataset quickly', () => {
      const stmt = db.prepare(`
        INSERT INTO plugins (plugin_type, label, description, category)
        VALUES (?, ?, ?, ?)
      `);

      db.transaction(() => {
        for (let i = 0; i < 1000; i++) {
          stmt.run(
            `plugin-${i}`,
            `Plugin ${i}`,
            `This is a test plugin for ${i % 10 === 0 ? 'blockchain' : 'integration'} operations`,
            'Integration'
          );
        }
      })();

      const start = Date.now();
      const results = db.prepare(`
        SELECT p.* FROM plugins p
        JOIN plugins_fts ON p.rowid = plugins_fts.rowid
        WHERE plugins_fts MATCH ?
      `).all('blockchain');

      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(100);
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle special characters in plugin descriptions', () => {
      db.prepare(`
        INSERT INTO plugins (plugin_type, label, description, category)
        VALUES ('test', 'Test', 'Description with "quotes" and \\backslashes\\', 'Test')
      `).run();

      const plugin = db.prepare('SELECT * FROM plugins WHERE plugin_type = ?').get('test');
      expect(plugin.description).toContain('quotes');
    });

    it('should handle empty JSON arrays', () => {
      db.prepare(`
        INSERT INTO plugins (plugin_type, label, description, category, form_fields)
        VALUES ('test', 'Test', 'Test plugin', 'Test', '[]')
      `).run();

      const plugin = db.prepare('SELECT * FROM plugins WHERE plugin_type = ?').get('test');
      expect(JSON.parse(plugin.form_fields)).toEqual([]);
    });

    it('should handle NULL values correctly', () => {
      db.prepare(`
        INSERT INTO plugins (plugin_type, label, description, category, icon_name)
        VALUES ('test', 'Test', 'Test plugin', 'Test', NULL)
      `).run();

      const plugin = db.prepare('SELECT * FROM plugins WHERE plugin_type = ?').get('test');
      expect(plugin.icon_name).toBeNull();
    });

    it('should handle very long descriptions', () => {
      const longDesc = 'A'.repeat(10000);

      db.prepare(`
        INSERT INTO plugins (plugin_type, label, description, category)
        VALUES ('test', 'Test', ?, 'Test')
      `).run(longDesc);

      const plugin = db.prepare('SELECT * FROM plugins WHERE plugin_type = ?').get('test');
      expect(plugin.description.length).toBe(10000);
    });
  });
});
