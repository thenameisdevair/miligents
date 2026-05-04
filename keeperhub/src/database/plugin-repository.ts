import type { DatabaseAdapter } from './database-adapter.js';

export interface Plugin {
  pluginType: string;
  label: string;
  description: string;
  category: string;
  iconName?: string;
  singleConnection: boolean;
  hasCredentials: boolean;
  formFields?: any[];
}

export interface PluginStep {
  id?: number;
  pluginType: string;
  stepSlug: string;
  label: string;
  description: string;
  category: string;
  stepFunction: string;
  stepImportPath: string;
  configFields: any[];
  outputFields: any[];
}

export interface PluginSearchResult {
  pluginType: string;
  label: string;
  description: string;
  category: string;
  stepCount: number;
  hasCredentials: boolean;
  relevanceScore?: number;
}

export class PluginRepository {
  constructor(private db: DatabaseAdapter) {}

  insertPlugin(plugin: Plugin): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO plugins (
        plugin_type, label, description, category, icon_name,
        single_connection, has_credentials, form_fields
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      plugin.pluginType,
      plugin.label,
      plugin.description,
      plugin.category,
      plugin.iconName || null,
      plugin.singleConnection ? 1 : 0,
      plugin.hasCredentials ? 1 : 0,
      plugin.formFields ? JSON.stringify(plugin.formFields) : null
    );
  }

  insertStep(step: PluginStep): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO plugin_steps (
        plugin_type, step_slug, label, description, category,
        step_function, step_import_path, config_fields, output_fields
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      step.pluginType,
      step.stepSlug,
      step.label,
      step.description,
      step.category,
      step.stepFunction,
      step.stepImportPath,
      JSON.stringify(step.configFields),
      JSON.stringify(step.outputFields)
    );
  }

  searchPlugins(
    query: string,
    limit: number = 10,
    category?: string
  ): PluginSearchResult[] {
    let sql = `
      SELECT
        p.plugin_type as pluginType,
        p.label,
        p.description,
        p.category,
        p.has_credentials as hasCredentials,
        COUNT(s.id) as stepCount,
        fts.rank as relevanceScore
      FROM plugins_fts fts
      JOIN plugins p ON p.rowid = fts.rowid
      LEFT JOIN plugin_steps s ON s.plugin_type = p.plugin_type
      WHERE plugins_fts MATCH ?
    `;

    const params: any[] = [query];

    if (category && category !== 'all') {
      sql += ' AND p.category = ?';
      params.push(category);
    }

    sql += `
      GROUP BY p.plugin_type
      ORDER BY fts.rank
      LIMIT ?
    `;
    params.push(limit);

    const stmt = this.db.prepare(sql);
    const results = stmt.all(...params);

    return results.map((row: any) => ({
      pluginType: row.pluginType,
      label: row.label,
      description: row.description,
      category: row.category,
      stepCount: row.stepCount,
      hasCredentials: row.hasCredentials === 1,
      relevanceScore: row.relevanceScore,
    }));
  }

  getPlugin(pluginType: string): any {
    const pluginStmt = this.db.prepare(`
      SELECT
        plugin_type as pluginType,
        label,
        description,
        category,
        single_connection as singleConnection,
        has_credentials as hasCredentials,
        form_fields as formFields
      FROM plugins
      WHERE plugin_type = ?
    `);

    const plugin = pluginStmt.get(pluginType);
    if (!plugin) {
      return null;
    }

    const stepsStmt = this.db.prepare(`
      SELECT
        step_slug as slug,
        label,
        description,
        category,
        step_function as stepFunction,
        step_import_path as stepImportPath,
        config_fields as configFields,
        output_fields as outputFields
      FROM plugin_steps
      WHERE plugin_type = ?
    `);

    const steps = stepsStmt.all(pluginType);

    return {
      pluginType: plugin.pluginType,
      label: plugin.label,
      description: plugin.description,
      category: plugin.category,
      singleConnection: plugin.singleConnection === 1,
      credentials: {
        required: plugin.hasCredentials === 1,
        fields: plugin.formFields ? JSON.parse(plugin.formFields) : [],
      },
      steps: steps.map((step: any) => ({
        slug: step.slug,
        label: step.label,
        description: step.description,
        category: step.category,
        stepFunction: step.stepFunction,
        stepImportPath: step.stepImportPath,
        configFields: JSON.parse(step.configFields),
        outputFields: JSON.parse(step.outputFields),
      })),
    };
  }

  getStep(pluginType: string, stepSlug: string): any {
    const stmt = this.db.prepare(`
      SELECT
        plugin_type as pluginType,
        step_slug as stepSlug,
        label,
        description,
        category,
        step_function as stepFunction,
        step_import_path as stepImportPath,
        config_fields as configFields,
        output_fields as outputFields
      FROM plugin_steps
      WHERE plugin_type = ? AND step_slug = ?
    `);

    const step = stmt.get(pluginType, stepSlug);
    if (!step) {
      return null;
    }

    return {
      pluginType: step.pluginType,
      stepSlug: step.stepSlug,
      label: step.label,
      description: step.description,
      category: step.category,
      stepFunction: step.stepFunction,
      stepImportPath: step.stepImportPath,
      configFields: JSON.parse(step.configFields),
      outputFields: JSON.parse(step.outputFields),
    };
  }

  getAllPlugins(): PluginSearchResult[] {
    const stmt = this.db.prepare(`
      SELECT
        p.plugin_type as pluginType,
        p.label,
        p.description,
        p.category,
        p.has_credentials as hasCredentials,
        COUNT(s.id) as stepCount
      FROM plugins p
      LEFT JOIN plugin_steps s ON s.plugin_type = p.plugin_type
      GROUP BY p.plugin_type
      ORDER BY p.label
    `);

    const results = stmt.all();

    return results.map((row: any) => ({
      pluginType: row.pluginType,
      label: row.label,
      description: row.description,
      category: row.category,
      stepCount: row.stepCount,
      hasCredentials: row.hasCredentials === 1,
    }));
  }

  clearAll(): void {
    this.db.exec('DELETE FROM plugin_steps');
    this.db.exec('DELETE FROM plugins');
  }
}
