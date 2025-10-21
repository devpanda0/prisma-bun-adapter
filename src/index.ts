import {
  SqlDriverAdapter,
  SqlQuery,
  SqlResultSet,
  Transaction,
  ColumnTypeEnum,
  ColumnType,
  IsolationLevel,
} from "@prisma/driver-adapter-utils";

// Common interfaces
interface BunSqlResult extends Array<any> {
  count: number;
  command: string;
  lastInsertRowid: number | null;
  affectedRows: number | null;
}

interface BunSqlConnection {
  (strings: TemplateStringsArray, ...values: any[]): Promise<BunSqlResult>;
  close(): Promise<void>;
  end(): Promise<void>;
  begin(): Promise<BunSqlTransaction>;
  transaction<T>(callback: (tx: BunSqlTransaction) => Promise<T>): Promise<T>;
}

interface BunSqlTransaction {
  (strings: TemplateStringsArray, ...values: any[]): Promise<BunSqlResult>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

// Configuration interfaces
export interface BunPostgresConfig {
  connectionString: string;
  maxConnections?: number;
  idleTimeout?: number;
  ssl?: boolean | {
    rejectUnauthorized?: boolean;
    ca?: string;
    cert?: string;
    key?: string;
  };
}

export interface BunMySQLConfig {
  connectionString: string;
  maxConnections?: number;
  idleTimeout?: number;
  ssl?: boolean | {
    rejectUnauthorized?: boolean;
    ca?: string;
    cert?: string;
    key?: string;
  };
}

export interface BunSQLiteConfig {
  filename: string;
  maxConnections?: number;
  readonly?: boolean;
  create?: boolean;
}

// Cache for template strings to avoid repeated parsing
const templateCache = new Map<string, { strings: TemplateStringsArray; paramCount: number }>();

// Pre-compiled column type matchers for better performance
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Base adapter class with shared functionality
abstract class BaseBunDriverAdapter implements SqlDriverAdapter {
  abstract readonly provider: "postgres" | "mysql" | "sqlite";
  abstract readonly adapterName: string;
  
  protected connection: BunSqlConnection | null = null;
  protected connectionString: string;
  protected maxConnections: number;

  constructor(connectionString: string, maxConnections: number = 5) {
    this.connectionString = connectionString;
    this.maxConnections = maxConnections;
  }

  protected async getConnection(): Promise<BunSqlConnection> {
    if (!this.connection) {
      this.connection = await this.createConnection();
    }
    return this.connection;
  }

  protected abstract createConnection(): Promise<BunSqlConnection>;

  async dispose(): Promise<void> {
    if (this.connection) {
      await this.connection.end();
      this.connection = null;
    }
    templateCache.clear();
  }

  async executeScript(script: string): Promise<void> {
    const connection = await this.getConnection();
    const statements = script.split(';').filter(stmt => stmt.trim());
    
    for (const statement of statements) {
      if (statement.trim()) {
        const strings = this.createTemplateStrings([statement.trim()]);
        await connection(strings);
      }
    }
  }

  async queryRaw(query: SqlQuery): Promise<SqlResultSet> {
    const connection = await this.getConnection();
    const result = await this.executeQueryOptimized(connection, query.sql, query.args || []);
    
    if (!Array.isArray(result) || result.length === 0) {
      return { columnNames: [], columnTypes: [], rows: [] };
    }

    const firstRow = result[0];
    const columnNames = Object.keys(firstRow);
    const columnCount = columnNames.length;
    const rowCount = result.length;
    
    const columnTypes = new Array(columnCount);
    const rows = new Array(rowCount);
    
    for (let i = 0; i < columnCount; i++) {
      columnTypes[i] = this.inferColumnTypeFast(firstRow[columnNames[i]]);
    }
    
    for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
      const row = result[rowIndex];
      const processedRow = new Array(columnCount);
      
      for (let colIndex = 0; colIndex < columnCount; colIndex++) {
        processedRow[colIndex] = this.serializeValueFast(row[columnNames[colIndex]]);
      }
      
      rows[rowIndex] = processedRow;
    }
    
    return { columnNames, columnTypes, rows };
  }

  async executeRaw(query: SqlQuery): Promise<number> {
    const connection = await this.getConnection();
    try {
      const result = await this.executeQueryOptimized(connection, query.sql, query.args || []);
      return result.affectedRows || result.count || 0;
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : String(error));
    }
  }

  protected executeQueryOptimized(connection: BunSqlConnection, sql: string, args: any[]): Promise<BunSqlResult> {
    if (args.length === 0) {
      const strings = this.createTemplateStrings([sql]);
      return connection(strings);
    }
    
    const cacheKey = sql;
    let cached = templateCache.get(cacheKey);
    
    if (!cached && this.hasParameterPlaceholders(sql)) {
      const templateSql = this.convertParameterPlaceholders(sql, args.length);
      const parts = templateSql.split(/\$\{\d+\}/);
      const strings = this.createTemplateStrings(parts);
      
      cached = { strings, paramCount: args.length };
      templateCache.set(cacheKey, cached);
    }
    
    if (cached) {
      return connection(cached.strings, ...args);
    }
    
    const strings = this.createTemplateStrings([sql]);
    return connection(strings);
  }

  protected abstract hasParameterPlaceholders(sql: string): boolean;
  protected abstract convertParameterPlaceholders(sql: string, paramCount: number): string;

  protected createTemplateStrings(parts: string[]): TemplateStringsArray {
    if (parts.length === 1) {
      parts = [...parts, ''];
    }
    return Object.assign(parts, { raw: parts }) as TemplateStringsArray;
  }

  async startTransaction(isolationLevel?: IsolationLevel): Promise<Transaction> {
    const connection = await this.getConnection();
    
    return {
      provider: this.provider,
      adapterName: this.adapterName,
      options: {
        usePhantomQuery: false,
      },
      queryRaw: async (query: SqlQuery) => {
        return await connection.transaction(async (tx) => {
          if (isolationLevel && this.provider !== "sqlite") {
            const strings = this.createTemplateStrings([`SET TRANSACTION ISOLATION LEVEL ${isolationLevel}`]);
            await tx(strings);
          }
          
          const result = await this.executeTransactionQueryOptimized(tx, query.sql, query.args || []);
          
          if (!Array.isArray(result) || result.length === 0) {
            return { columnNames: [], columnTypes: [], rows: [] };
          }

          const firstRow = result[0];
          const columnNames = Object.keys(firstRow);
          const columnCount = columnNames.length;
          
          const columnTypes = new Array(columnCount);
          const rows = new Array(result.length);
          
          for (let i = 0; i < columnCount; i++) {
            columnTypes[i] = this.inferColumnTypeFast(firstRow[columnNames[i]]);
          }
          
          for (let rowIndex = 0; rowIndex < result.length; rowIndex++) {
            const row = result[rowIndex];
            const processedRow = new Array(columnCount);
            
            for (let colIndex = 0; colIndex < columnCount; colIndex++) {
              processedRow[colIndex] = this.serializeValueFast(row[columnNames[colIndex]]);
            }
            
            rows[rowIndex] = processedRow;
          }
          
          return { columnNames, columnTypes, rows };
        });
      },
      executeRaw: async (query: SqlQuery) => {
        return await connection.transaction(async (tx) => {
          const result = await this.executeTransactionQueryOptimized(tx, query.sql, query.args || []);
          return result.affectedRows || result.count || 0;
        });
      },
      commit: async () => {},
      rollback: async () => {},
    };
  }

  protected executeTransactionQueryOptimized(tx: BunSqlTransaction, sql: string, args: any[]): Promise<BunSqlResult> {
    if (args.length === 0) {
      const strings = this.createTemplateStrings([sql]);
      return tx(strings);
    }
    
    if (this.hasParameterPlaceholders(sql)) {
      const templateSql = this.convertParameterPlaceholders(sql, args.length);
      const parts = templateSql.split(/\$\{\d+\}/);
      const strings = this.createTemplateStrings(parts);
      
      return tx(strings, ...args);
    }
    
    const strings = this.createTemplateStrings([sql]);
    return tx(strings);
  }

  protected inferColumnTypeFast(value: unknown): ColumnType {
    if (value === null || value === undefined) {
      return ColumnTypeEnum.UnknownNumber;
    }
    
    const valueType = typeof value;
    
    switch (valueType) {
      case "boolean":
        return ColumnTypeEnum.Boolean;
      case "number":
        return Number.isInteger(value) ? ColumnTypeEnum.Int32 : ColumnTypeEnum.Double;
      case "bigint":
        return ColumnTypeEnum.Int64;
      case "string":
        if (DATETIME_REGEX.test(value as string)) {
          return ColumnTypeEnum.DateTime;
        }
        if (DATE_REGEX.test(value as string)) {
          return ColumnTypeEnum.Date;
        }
        if (UUID_REGEX.test(value as string)) {
          return ColumnTypeEnum.Uuid;
        }
        return ColumnTypeEnum.Text;
      case "object":
        if (value instanceof Date) {
          return ColumnTypeEnum.DateTime;
        }
        if (Buffer.isBuffer(value)) {
          return ColumnTypeEnum.Bytes;
        }
        return ColumnTypeEnum.Json;
      default:
        return ColumnTypeEnum.UnknownNumber;
    }
  }

  protected serializeValueFast(value: unknown): unknown {
    if (value === null || value === undefined) {
      return value;
    }
    
    const valueType = typeof value;
    
    if (valueType === "string" || valueType === "number" || valueType === "boolean") {
      return value;
    }
    
    if (valueType === "bigint") {
      return value.toString();
    }
    
    if (value instanceof Date) {
      return value.toISOString();
    }
    
    if (Buffer.isBuffer(value)) {
      return value;
    }
    
    return value;
  }
}

// PostgreSQL Adapter
class BunPostgresDriverAdapter extends BaseBunDriverAdapter {
  readonly provider = "postgres" as const;
  readonly adapterName = "bun-postgres-adapter";

  protected async createConnection(): Promise<BunSqlConnection> {
    const BunSQL = (globalThis as any).Bun?.sql;
    if (!BunSQL) {
      throw new Error("Bun's native SQL client is not available. Make sure you're running with Bun 1.3+");
    }

    const connection = new BunSQL(this.connectionString) as BunSqlConnection;
    
    // Warm up the connection
    try {
      const strings = this.createTemplateStrings(['SELECT 1']);
      await connection(strings);
    } catch (error) {
      // Ignore warm-up errors
    }
    
    return connection;
  }

  protected hasParameterPlaceholders(sql: string): boolean {
    return sql.includes('$1');
  }

  protected convertParameterPlaceholders(sql: string, paramCount: number): string {
    let templateSql = sql;
    for (let i = 0; i < paramCount; i++) {
      const regex = new RegExp(`\\${i + 1}\\b`, 'g');
      templateSql = templateSql.replace(regex, `\${${i}}`);
    }
    return templateSql;
  }
}

// MySQL Adapter
class BunMySQLDriverAdapter extends BaseBunDriverAdapter {
  readonly provider = "mysql" as const;
  readonly adapterName = "bun-mysql-adapter";

  protected async createConnection(): Promise<BunSqlConnection> {
    const BunSQL = (globalThis as any).Bun?.sql;
    if (!BunSQL) {
      throw new Error("Bun's native SQL client is not available. Make sure you're running with Bun 1.3+");
    }

    const connection = new BunSQL(this.connectionString) as BunSqlConnection;
    
    // Warm up the connection
    try {
      const strings = this.createTemplateStrings(['SELECT 1']);
      await connection(strings);
    } catch (error) {
      // Ignore warm-up errors
    }
    
    return connection;
  }

  protected hasParameterPlaceholders(sql: string): boolean {
    return sql.includes('?');
  }

  protected convertParameterPlaceholders(sql: string, paramCount: number): string {
    let templateSql = sql;
    for (let i = 0; i < paramCount; i++) {
      templateSql = templateSql.replace('?', `\${${i}}`);
    }
    return templateSql;
  }
}

// SQLite Adapter
class BunSQLiteDriverAdapter extends BaseBunDriverAdapter {
  readonly provider = "sqlite" as const;
  readonly adapterName = "bun-sqlite-adapter";

  protected async createConnection(): Promise<BunSqlConnection> {
    const BunSQL = (globalThis as any).Bun?.sql;
    if (!BunSQL) {
      throw new Error("Bun's native SQL client is not available. Make sure you're running with Bun 1.3+");
    }

    const connection = new BunSQL(this.connectionString) as BunSqlConnection;
    
    // Warm up the connection
    try {
      const strings = this.createTemplateStrings(['SELECT 1']);
      await connection(strings);
    } catch (error) {
      // Ignore warm-up errors
    }
    
    return connection;
  }

  protected hasParameterPlaceholders(sql: string): boolean {
    return sql.includes('?');
  }

  protected convertParameterPlaceholders(sql: string, paramCount: number): string {
    let templateSql = sql;
    for (let i = 0; i < paramCount; i++) {
      templateSql = templateSql.replace('?', `\${${i}}`);
    }
    return templateSql;
  }
}

// Adapter factory classes
export class BunPostgresAdapter {
  readonly provider = "postgres" as const;
  readonly adapterName = "bun-postgres-adapter";
  private config: BunPostgresConfig | string;

  constructor(config: BunPostgresConfig | string) {
    this.config = config;
  }

  async connect(): Promise<SqlDriverAdapter> {
    const connectionString = typeof this.config === "string" 
      ? this.config 
      : this.config.connectionString;
    
    const maxConnections = typeof this.config === "string" 
      ? 5
      : (this.config.maxConnections || 5);
    
    return new BunPostgresDriverAdapter(connectionString, maxConnections);
  }

  async dispose(): Promise<void> {}
}

export class BunMySQLAdapter {
  readonly provider = "mysql" as const;
  readonly adapterName = "bun-mysql-adapter";
  private config: BunMySQLConfig | string;

  constructor(config: BunMySQLConfig | string) {
    this.config = config;
  }

  async connect(): Promise<SqlDriverAdapter> {
    const connectionString = typeof this.config === "string" 
      ? this.config 
      : this.config.connectionString;
    
    const maxConnections = typeof this.config === "string" 
      ? 5
      : (this.config.maxConnections || 5);
    
    return new BunMySQLDriverAdapter(connectionString, maxConnections);
  }

  async dispose(): Promise<void> {}
}

export class BunSQLiteAdapter {
  readonly provider = "sqlite" as const;
  readonly adapterName = "bun-sqlite-adapter";
  private config: BunSQLiteConfig | string;

  constructor(config: BunSQLiteConfig | string) {
    this.config = config;
  }

  async connect(): Promise<SqlDriverAdapter> {
    const connectionString = typeof this.config === "string" 
      ? this.config 
      : `file:${this.config.filename}`;
    
    const maxConnections = typeof this.config === "string" 
      ? 1  // SQLite typically uses single connection
      : (this.config.maxConnections || 1);
    
    return new BunSQLiteDriverAdapter(connectionString, maxConnections);
  }

  async dispose(): Promise<void> {}
}

// Default export for backward compatibility
export default BunPostgresAdapter;