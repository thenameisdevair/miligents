import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface DatabaseAdapter {
  prepare(sql: string): PreparedStatement;
  exec(sql: string): void;
  close(): void;
  transaction<T>(fn: () => T): T;
}

export interface PreparedStatement {
  run(...params: any[]): RunResult;
  get(...params: any[]): any;
  all(...params: any[]): any[];
}

export interface RunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

export async function createDatabaseAdapter(
  dbPath: string
): Promise<DatabaseAdapter> {
  try {
    const Database = (await import('better-sqlite3')).default;
    const db = new Database(dbPath);

    await initializeSchema(db);

    return new BetterSQLiteAdapter(db);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to create database adapter: ${errorMessage}`);
  }
}

async function initializeSchema(db: any): Promise<void> {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = await fs.readFile(schemaPath, 'utf-8');
  db.exec(schema);
}

class BetterSQLiteAdapter implements DatabaseAdapter {
  constructor(private db: any) {}

  prepare(sql: string): PreparedStatement {
    const stmt = this.db.prepare(sql);
    return new BetterSQLiteStatement(stmt);
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  close(): void {
    this.db.close();
  }

  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }
}

class BetterSQLiteStatement implements PreparedStatement {
  constructor(private stmt: any) {}

  run(...params: any[]): RunResult {
    return this.stmt.run(...params);
  }

  get(...params: any[]): any {
    return this.stmt.get(...params);
  }

  all(...params: any[]): any[] {
    return this.stmt.all(...params);
  }
}
