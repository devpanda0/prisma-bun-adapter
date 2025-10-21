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
  ssl?:
    | boolean
    | {
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

// Cache for template strings to avoid repeated parsing
const templateCache = new Map<
  string,
  { strings: TemplateStringsArray; paramCount: number }
>();

// Pre-compiled column type matchers for better performance
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class OptimizedBunPostgresDriverAdapter implements SqlDriverAdapter {
  readonly provider = "postgres" as const;
  readonly adapterName = "bun-postgres-adapter-optimized";
  private connectionString: string;
  private connections: BunSqlConnection[] = [];
  private availableConnections: BunSqlConnection[] = [];
  private maxConnections: number;
  private connectionPromises = new Map<number, Promise<BunSqlConnection>>();

  constructor(connectionString: string, maxConnections: number = 20) {
    this.connectionString = connectionString;
    this.maxConnections = maxConnections;
  }

  private async getConnection(): Promise<BunSqlConnection> {
    // Try to get an available connection first
    if (this.availableConnections.length > 0) {
      return this.availableConnections.pop()!;
    }

    // If we haven't reached the max, create a new connection
    if (this.connections.length < this.maxConnections) {
      const connection = await this.createConnection();
      this.connections.push(connection);
      return connection;
    }

    // Wait for a connection to become available
    return new Promise((resolve) => {
      const checkForConnection = () => {
        if (this.availableConnections.length > 0) {
          resolve(this.availableConnections.pop()!);
        } else {
          // Use setImmediate for better performance than setTimeout
          setImmediate(checkForConnection);
        }
      };
      checkForConnection();
    });
  }

  private releaseConnection(connection: BunSqlConnection): void {
    this.availableConnections.push(connection);
  }

  private async createConnection(): Promise<BunSqlConnection> {
    const BunSQL = (globalThis as any).Bun?.sql;
    if (!BunSQL) {
      throw new Error(
        "Bun's native SQL client is not available. Make sure you're running with Bun 1.3+"
      );
    }

    return new BunSQL(this.connectionString) as BunSqlConnection;
  }

  async dispose(): Promise<void> {
    // Close all connections in parallel
    await Promise.all(this.connections.map((conn) => conn.end()));
    this.connections = [];
    this.availableConnections = [];
    templateCache.clear();
  }

  async executeScript(script: string): Promise<void> {
    const connection = await this.getConnection();
    try {
      const statements = script.split(";").filter((stmt) => stmt.trim());
      // Execute statements in parallel where safe
      await Promise.all(
        statements.map(async (statement) => {
          if (statement.trim()) {
            const strings = this.createTemplateStrings([statement.trim()]);
            await connection(strings);
          }
        })
      );
    } finally {
      this.releaseConnection(connection);
    }
  }

  async queryRaw(query: SqlQuery): Promise<SqlResultSet> {
    const connection = await this.getConnection();
    try {
      const result = await this.executeQueryOptimized(
        connection,
        query.sql,
        query.args || []
      );

      // Fast path for empty results
      if (!Array.isArray(result) || result.length === 0) {
        return { columnNames: [], columnTypes: [], rows: [] };
      }

      // Pre-allocate arrays for better performance
      const firstRow = result[0];
      const columnNames = Object.keys(firstRow);
      const columnCount = columnNames.length;
      const rowCount = result.length;

      // Pre-allocate the result arrays
      const columnTypes = new Array(columnCount);
      const rows = new Array(rowCount);

      // Process first row to determine column types
      for (let i = 0; i < columnCount; i++) {
        columnTypes[i] = this.inferColumnTypeFast(firstRow[columnNames[i]]);
      }

      // Process all rows efficiently
      for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
        const row = result[rowIndex];
        const processedRow = new Array(columnCount);

        for (let colIndex = 0; colIndex < columnCount; colIndex++) {
          processedRow[colIndex] = this.serializeValueFast(
            row[columnNames[colIndex]]
          );
        }

        rows[rowIndex] = processedRow;
      }

      return { columnNames, columnTypes, rows };
    } finally {
      this.releaseConnection(connection);
    }
  }

  async executeRaw(query: SqlQuery): Promise<number> {
    const connection = await this.getConnection();
    try {
      const result = await this.executeQueryOptimized(
        connection,
        query.sql,
        query.args || []
      );
      return result.affectedRows || result.count || 0;
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : String(error));
    } finally {
      this.releaseConnection(connection);
    }
  }

  private executeQueryOptimized(
    connection: BunSqlConnection,
    sql: string,
    args: any[]
  ): Promise<BunSqlResult> {
    // Fast path for queries without parameters
    if (args.length === 0) {
      const strings = this.createTemplateStrings([sql]);
      return connection(strings);
    }

    // Check cache first
    const cacheKey = sql;
    let cached = templateCache.get(cacheKey);

    if (!cached && sql.includes("$1")) {
      // Parse and cache the template
      let templateSql = sql;
      const paramCount = args.length;

      // More efficient parameter replacement
      for (let i = 0; i < paramCount; i++) {
        templateSql = templateSql.replaceAll(`$${i + 1}`, `\${${i}}`);
      }

      const parts = templateSql.split(/\$\{\d+\}/);
      const strings = this.createTemplateStrings(parts);

      cached = { strings, paramCount };
      templateCache.set(cacheKey, cached);
    }

    if (cached) {
      return connection(cached.strings, ...args);
    }

    // Fallback for non-parameterized queries
    const strings = this.createTemplateStrings([sql]);
    return connection(strings);
  }

  private createTemplateStrings(parts: string[]): TemplateStringsArray {
    // Ensure we have at least one empty string at the end
    if (parts.length === 1) {
      parts = [...parts, ""];
    }
    return Object.assign(parts, { raw: parts }) as TemplateStringsArray;
  }

  async startTransaction(
    isolationLevel?: IsolationLevel
  ): Promise<Transaction> {
    const connection = await this.getConnection();

    return {
      provider: "postgres" as const,
      adapterName: "bun-postgres-adapter-optimized",
      options: {
        usePhantomQuery: false,
      },
      queryRaw: async (query: SqlQuery) => {
        return await connection.transaction(async (tx) => {
          if (isolationLevel) {
            const strings = this.createTemplateStrings([
              `SET TRANSACTION ISOLATION LEVEL ${isolationLevel}`,
            ]);
            await tx(strings);
          }

          const result = await this.executeTransactionQueryOptimized(
            tx,
            query.sql,
            query.args || []
          );

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
              processedRow[colIndex] = this.serializeValueFast(
                row[columnNames[colIndex]]
              );
            }

            rows[rowIndex] = processedRow;
          }

          return { columnNames, columnTypes, rows };
        });
      },
      executeRaw: async (query: SqlQuery) => {
        return await connection.transaction(async (tx) => {
          const result = await this.executeTransactionQueryOptimized(
            tx,
            query.sql,
            query.args || []
          );
          return result.affectedRows || result.count || 0;
        });
      },
      commit: async () => {
        this.releaseConnection(connection);
      },
      rollback: async () => {
        this.releaseConnection(connection);
      },
    };
  }

  private executeTransactionQueryOptimized(
    tx: BunSqlTransaction,
    sql: string,
    args: any[]
  ): Promise<BunSqlResult> {
    if (args.length === 0) {
      const strings = this.createTemplateStrings([sql]);
      return tx(strings);
    }

    if (sql.includes("$1")) {
      let templateSql = sql;

      for (let i = 0; i < args.length; i++) {
        templateSql = templateSql.replaceAll(`$${i + 1}`, `\${${i}}`);
      }

      const parts = templateSql.split(/\$\{\d+\}/);
      const strings = this.createTemplateStrings(parts);

      return tx(strings, ...args);
    }

    const strings = this.createTemplateStrings([sql]);
    return tx(strings);
  }

  private inferColumnTypeFast(value: unknown): ColumnType {
    if (value === null || value === undefined) {
      return ColumnTypeEnum.UnknownNumber;
    }

    const valueType = typeof value;

    // Fast type checking - most common cases first
    switch (valueType) {
      case "boolean":
        return ColumnTypeEnum.Boolean;
      case "number":
        return Number.isInteger(value)
          ? ColumnTypeEnum.Int32
          : ColumnTypeEnum.Double;
      case "bigint":
        return ColumnTypeEnum.Int64;
      case "string":
        // Fast string type detection
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

  private serializeValueFast(value: unknown): unknown {
    if (value === null || value === undefined) {
      return value;
    }

    const valueType = typeof value;

    // Fast path for common types
    if (
      valueType === "string" ||
      valueType === "number" ||
      valueType === "boolean"
    ) {
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
  readonly adapterName = "bun-postgres-adapter-optimized";
  private config: BunPostgresConfig | string;

  constructor(config: BunPostgresConfig | string) {
    this.config = config;
  }

  async connect(): Promise<SqlDriverAdapter> {
    const connectionString =
      typeof this.config === "string"
        ? this.config
        : this.config.connectionString;

    const maxConnections =
      typeof this.config === "string"
        ? 20 // Increased default for better concurrency
        : this.config.maxConnections || 20;

    return new OptimizedBunPostgresDriverAdapter(
      connectionString,
      maxConnections
    );
  }

  async dispose(): Promise<void> {
    // Factory cleanup
  }
}

export default BunPostgresAdapter;
