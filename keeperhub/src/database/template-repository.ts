import type { DatabaseAdapter } from './database-adapter.js';

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  useCase: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  tags: string[];
  nodes: any[];
  edges: any[];
  requiredPlugins: string[];
  estimatedSetupTime: number;
}

export interface TemplateSearchResult {
  id: string;
  name: string;
  description: string;
  category: string;
  useCase: string;
  difficulty: string;
  tags: string[];
  requiredPlugins: string[];
  estimatedSetupTime: number;
  nodeCount: number;
  relevanceScore?: number;
}

export class TemplateRepository {
  constructor(private db: DatabaseAdapter) {}

  insertTemplate(template: WorkflowTemplate): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO workflow_templates (
        id, name, description, category, use_case, difficulty,
        tags, nodes, edges, required_plugins, estimated_setup_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      template.id,
      template.name,
      template.description,
      template.category,
      template.useCase,
      template.difficulty,
      JSON.stringify(template.tags),
      JSON.stringify(template.nodes),
      JSON.stringify(template.edges),
      JSON.stringify(template.requiredPlugins),
      template.estimatedSetupTime
    );
  }

  searchTemplates(
    query: string,
    limit: number = 10,
    category?: string,
    difficulty?: string
  ): TemplateSearchResult[] {
    let sql = `
      SELECT
        t.id,
        t.name,
        t.description,
        t.category,
        t.use_case as useCase,
        t.difficulty,
        t.tags,
        t.required_plugins as requiredPlugins,
        t.estimated_setup_time as estimatedSetupTime,
        t.nodes,
        fts.rank as relevanceScore
      FROM templates_fts fts
      JOIN workflow_templates t ON t.rowid = fts.rowid
      WHERE templates_fts MATCH ?
    `;

    const params: any[] = [query];

    if (category && category !== 'all') {
      sql += ' AND t.category = ?';
      params.push(category);
    }

    if (difficulty && difficulty !== 'all') {
      sql += ' AND t.difficulty = ?';
      params.push(difficulty);
    }

    sql += `
      ORDER BY fts.rank
      LIMIT ?
    `;
    params.push(limit);

    const stmt = this.db.prepare(sql);
    const results = stmt.all(...params);

    return results.map((row: any) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      category: row.category,
      useCase: row.useCase,
      difficulty: row.difficulty,
      tags: JSON.parse(row.tags),
      requiredPlugins: JSON.parse(row.requiredPlugins),
      estimatedSetupTime: row.estimatedSetupTime,
      nodeCount: JSON.parse(row.nodes).length,
      relevanceScore: row.relevanceScore,
    }));
  }

  getTemplate(id: string): WorkflowTemplate | null {
    const stmt = this.db.prepare(`
      SELECT
        id,
        name,
        description,
        category,
        use_case as useCase,
        difficulty,
        tags,
        nodes,
        edges,
        required_plugins as requiredPlugins,
        estimated_setup_time as estimatedSetupTime
      FROM workflow_templates
      WHERE id = ?
    `);

    const row = stmt.get(id);
    if (!row) {
      return null;
    }

    return {
      id: row.id,
      name: row.name,
      description: row.description,
      category: row.category,
      useCase: row.useCase,
      difficulty: row.difficulty,
      tags: JSON.parse(row.tags),
      nodes: JSON.parse(row.nodes),
      edges: JSON.parse(row.edges),
      requiredPlugins: JSON.parse(row.requiredPlugins),
      estimatedSetupTime: row.estimatedSetupTime,
    };
  }

  getAllTemplates(): TemplateSearchResult[] {
    const stmt = this.db.prepare(`
      SELECT
        id,
        name,
        description,
        category,
        use_case as useCase,
        difficulty,
        tags,
        required_plugins as requiredPlugins,
        estimated_setup_time as estimatedSetupTime,
        nodes
      FROM workflow_templates
      ORDER BY name
    `);

    const results = stmt.all();

    return results.map((row: any) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      category: row.category,
      useCase: row.useCase,
      difficulty: row.difficulty,
      tags: JSON.parse(row.tags),
      requiredPlugins: JSON.parse(row.requiredPlugins),
      estimatedSetupTime: row.estimatedSetupTime,
      nodeCount: JSON.parse(row.nodes).length,
    }));
  }

  clearAll(): void {
    this.db.exec('DELETE FROM workflow_templates');
  }
}
