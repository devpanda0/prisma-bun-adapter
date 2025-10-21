import {
  SqlDriverAdapter,
  SqlQuery,
  SqlResultSet,
  Transaction,
  ColumnTypeEnum,
  ColumnType,
  IsolationLevel,
} from "@prisma/driver-adapter-utils";

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

class BunPostgresDriverAdapter implements SqlDriverAdapter {
  readonly provider = "postgres" as const;
  readonly adapterName = "bun-postgres-adapter";
  private connectionString: string;
  private connection: BunSqlConnection | null = null;

  constructor(connectionString: string, _maxConnections: number = 10) {
    this.connectionString = connectionString;
  }

  private async getConnection(): Promise<BunSqlConnection> {
    if (!this.connection) {
      this.connection = this.createConnection();
    }
    return this.connection;
  }

  private createConnection(): BunSqlConnection {
    // Use Bun's native SQL client
    const BunSQL = (globalThis as any).Bun?.sql;
    if (!BunSQL) {
      throw new Error("Bun's native SQL client is not available. Make sure you're running with Bun 1.3+");
    }

    return new BunSQL(this.connectionString) as BunSqlConnection;
  }

  async dispose(): Promise<void> {
    if (this.connection) {
      await this.connection.end();
      this.connection = null;
    }
  }

  async executeScript(script: string): Promise<void> {
    const connection = await this.getConnection();
    // Split script into individual statements and execute them
    const statements = script.split(';').filter(stmt => stmt.trim());
    for (const statement of statements) {
      if (statement.trim()) {
        const strings = Object.assign([statement.trim(), ''], { raw: [statement.trim(), ''] }) as TemplateStringsArray;
        await connection(strings);
      }
    }
  }

  async queryRaw(query: SqlQuery): Promise<SqlResultSet> {
    const connection = await this.getConnection();
    // Use Bun's native SQL with template literal
    const result = await this.executeQuery(connection, query.sql, query.args || []);
    
    // Extract column information from the first row
    const rows = Array.isArray(result) ? result : [];
    const columnNames = rows.length > 0 ? Object.keys(rows[0]) : [];
    
    // Convert rows to the expected format
    const processedRows = rows.map(row => 
      columnNames.map(col => this.serializeValue(row[col]))
    );
    
    return {
      columnNames,
      columnTypes: columnNames.map(col => this.inferColumnType(rows[0]?.[col])),
      rows: processedRows,
    };
  }

  async executeRaw(query: SqlQuery): Promise<number> {
    const connection = await this.getConnection();
    try {
      const result = await this.executeQuery(connection, query.sql, query.args || []);
      return result.affectedRows || result.count || 0;
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : String(error));
    }
  }

  private async executeQuery(connection: BunSqlConnection, sql: string, args: any[]): Promise<BunSqlResult> {
    // For Bun's native SQL, we need to handle parameters differently
    if (args.length === 0) {
      // No parameters, create a simple template literal
      const strings = Object.assign([sql, ''], { raw: [sql, ''] }) as TemplateStringsArray;
      return await connection(strings);
    }
    
    // Handle PostgreSQL-style parameters ($1, $2, etc.)
    if (sql.includes('$1')) {
      // Convert PostgreSQL parameters to template literal format
      let templateSql = sql;
      const templateValues: any[] = [];
      
      // Replace $1, $2, etc. with template literal placeholders
      for (let i = 0; i < args.length; i++) {
        templateSql = templateSql.replace(`$${i + 1}`, `\${${i}}`);
        templateValues.push(args[i]);
      }
      
      // Split the SQL into parts for template literal
      const parts = templateSql.split(/\$\{\d+\}/);
      
      // Create proper TemplateStringsArray
      const strings = Object.assign(parts, { raw: parts }) as TemplateStringsArray;
      
      return await connection(strings, ...templateValues);
    }
    
    // Fallback: treat as simple query with no parameters
    const strings = Object.assign([sql, ''], { raw: [sql, ''] }) as TemplateStringsArray;
    return await connection(strings);
  }

  async startTransaction(isolationLevel?: IsolationLevel): Promise<Transaction> {
    const connection = await this.getConnection();
    
    // For now, let's use individual transactions for each operation
    // This is simpler and works with Bun's transaction model
    return {
      provider: "postgres" as const,
      adapterName: "bun-postgres-adapter",
      options: {
        usePhantomQuery: false,
      },
      queryRaw: async (query: SqlQuery) => {
        return await connection.transaction(async (tx) => {
          // Set isolation level if specified (only on first query)
          if (isolationLevel) {
            const strings = Object.assign([`SET TRANSACTION ISOLATION LEVEL ${isolationLevel}`, ''], { raw: [`SET TRANSACTION ISOLATION LEVEL ${isolationLevel}`, ''] }) as TemplateStringsArray;
            await tx(strings);
          }
          
          const result = await this.executeTransactionQuery(tx, query.sql, query.args || []);
          const rows = Array.isArray(result) ? result : [];
          const columnNames = rows.length > 0 ? Object.keys(rows[0]) : [];
          
          return {
            columnNames,
            columnTypes: columnNames.map(col => this.inferColumnType(rows[0]?.[col])),
            rows: rows.map(row => columnNames.map(col => this.serializeValue(row[col]))),
          };
        });
      },
      executeRaw: async (query: SqlQuery) => {
        return await connection.transaction(async (tx) => {
          const result = await this.executeTransactionQuery(tx, query.sql, query.args || []);
          return result.affectedRows || result.count || 0;
        });
      },
      commit: async () => {
        // No-op for individual transactions
      },
      rollback: async () => {
        // No-op for individual transactions
      },
    };
  }

  private async executeTransactionQuery(tx: BunSqlTransaction, sql: string, args: any[]): Promise<BunSqlResult> {
    // Similar to executeQuery but for transactions
    if (args.length === 0) {
      const strings = Object.assign([sql, ''], { raw: [sql, ''] }) as TemplateStringsArray;
      return await tx(strings);
    }
    
    if (sql.includes('$1')) {
      let templateSql = sql;
      const templateValues: any[] = [];
      
      for (let i = 0; i < args.length; i++) {
        templateSql = templateSql.replace(`$${i + 1}`, `\${${i}}`);
        templateValues.push(args[i]);
      }
      
      const parts = templateSql.split(/\$\{\d+\}/);
      const strings = Object.assign(parts, { raw: parts }) as TemplateStringsArray;
      
      return await tx(strings, ...templateValues);
    }
    
    const strings = Object.assign([sql, ''], { raw: [sql, ''] }) as TemplateStringsArray;
    return await tx(strings);
  }

  private inferColumnType(value: unknown): ColumnType {
    // Infer column type from value since Bun's native SQL doesn't provide type metadata
    if (value === null || value === undefined) {
      return ColumnTypeEnum.UnknownNumber;
    }
    
    if (typeof value === "boolean") {
      return ColumnTypeEnum.Boolean;
    }
    
    if (typeof value === "number") {
      return Number.isInteger(value) ? ColumnTypeEnum.Int32 : ColumnTypeEnum.Double;
    }
    
    if (typeof value === "bigint") {
      return ColumnTypeEnum.Int64;
    }
    
    if (typeof value === "string") {
      // Try to detect special string types
      if (value.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)) {
        return ColumnTypeEnum.DateTime;
      }
      if (value.match(/^\d{4}-\d{2}-\d{2}$/)) {
        return ColumnTypeEnum.Date;
      }
      if (value.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
        return ColumnTypeEnum.Uuid;
      }
      return ColumnTypeEnum.Text;
    }
    
    if (value instanceof Date) {
      return ColumnTypeEnum.DateTime;
    }
    
    if (Buffer.isBuffer(value)) {
      return ColumnTypeEnum.Bytes;
    }
    
    if (typeof value === "object") {
      return ColumnTypeEnum.Json;
    }
    
    return ColumnTypeEnum.UnknownNumber;
  }

  private serializeValue(value: unknown): unknown {
    // Optimize serialization - check most common cases first
    if (value === null || value === undefined) {
      return value;
    }
    
    const valueType = typeof value;
    
    // Most common cases first for better performance
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
      ? 10 
      : (this.config.maxConnections || 10);
    
    return new BunPostgresDriverAdapter(connectionString, maxConnections);
  }

  // For backward compatibility - allow direct disposal
  async dispose(): Promise<void> {
    // This is a factory, so we don't have connections to dispose here
    // The actual disposal happens in the driver adapter
  }
}

export default BunPostgresAdapter;