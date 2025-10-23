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
  { strings: TemplateStringsArray; paramCount: number; argOrder: number[] }
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

    const candidates = this.buildPgConnectionCandidates(this.connectionString);
    let lastErr: any = null;
    for (const candidate of candidates) {
      try {
        const conn = new BunSQL(candidate) as BunSqlConnection;
        try {
          const strings = this.createTemplateStrings(['SELECT 1']);
          await conn(strings);
          return conn;
        } catch (warmErr: any) {
          if (this.isPgAuthFailed(warmErr)) { lastErr = warmErr; continue; }
          throw warmErr;
        }
      } catch (e: any) {
        lastErr = e; continue;
      }
    }
    if (lastErr && (lastErr instanceof URIError || (typeof lastErr?.message === 'string' && /uri/i.test(lastErr.message)))) {
      throw new Error("Invalid DATABASE_URL/connectionString. Check URL shape; credentials are auto-encoded by the adapter.");
    }
    throw lastErr ?? new Error('Failed to establish Postgres connection');
  }

  private isPgAuthFailed(err: any): boolean {
    const msg = String(err?.message ?? '').toLowerCase();
    return msg.includes('password authentication failed') || msg.includes('28p01');
  }

  private buildPgConnectionCandidates(input: string): string[] {
    const raw = String(input ?? '').trim();
    const norm = (() => {
      if (!raw) return raw;

      // Heuristic: if unencoded reserved characters appear in userinfo, avoid WHATWG parsing
      const schemeMatch = raw.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):\/\//);
      const schemeFromRaw = schemeMatch?.[1];
      const restFromRaw = schemeMatch ? raw.slice(schemeMatch[0].length) : '';
      const atInRest = restFromRaw.lastIndexOf('@');
      const userinfoCandidate = atInRest !== -1 ? restFromRaw.slice(0, atInRest) : '';
      const hasUnencodedReserved = /[/?#]/.test(userinfoCandidate);

      if (!hasUnencodedReserved) {
        try {
          const u = new URL(raw);
          const scheme = u.protocol.replace(':', '');
          if (["postgres", "postgresql"].includes(scheme)) {
            // Avoid double-encoding: decode valid %HH triplets first, then encode
            const decodeTriplets = (s: string) => s.replace(/%[0-9a-fA-F]{2}/g, (m) => {
              try { return decodeURIComponent(m); } catch { return m; }
            });
            if (u.username) u.username = encodeURIComponent(decodeTriplets(u.username));
            if (u.password) u.password = encodeURIComponent(decodeTriplets(u.password));
            return u.toString();
          }
          return raw;
        } catch {}
      }

      // Manual rewrite tolerant of unencoded reserved in userinfo
      const m = raw.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):\/\//);
      if (!m) return raw;
      const scheme = m[1];
      const rest = raw.slice(m[0].length);

      const at = rest.lastIndexOf('@');
      if (at === -1) return raw;
      const userinfo = rest.slice(0, at);
      const hostAndTail = rest.slice(at + 1);
      let boundary = hostAndTail.length;
      for (const sep of ['/', '?', '#']) {
        const idx = hostAndTail.indexOf(sep);
        if (idx !== -1 && idx < boundary) boundary = idx;
      }
      const hostport = hostAndTail.slice(0, boundary);
      const tail = hostAndTail.slice(boundary);
      const colon = userinfo.indexOf(':');
      const userRaw = colon === -1 ? userinfo : userinfo.slice(0, colon);
      const passRaw = colon === -1 ? '' : userinfo.slice(colon + 1);
      const safeDecode = (s: string) => { try { return decodeURIComponent(s); } catch { return s; } };
      const username = encodeURIComponent(safeDecode(userRaw));
      const password = passRaw !== '' ? encodeURIComponent(safeDecode(passRaw)) : '';
      const rebuiltAuthority = password ? `${username}:${password}@${hostport}` : `${username}@${hostport}`;
      return `${scheme}://${rebuiltAuthority}${tail}`;
    })();

    const out: string[] = [];
    if (norm) out.push(norm);
    if (raw && raw !== norm) out.push(raw);
    const qp = this.toPgPasswordQueryVariant(raw);
    if (qp) out.push(qp);
    return out;
  }

  private toPgPasswordQueryVariant(raw: string): string | null {
    const m = raw.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):\/\//);
    if (!m) return null;
    const scheme = m[1];
    if (!['postgres', 'postgresql'].includes(scheme)) return null;
    const rest = raw.slice(m[0].length);
    const at = rest.lastIndexOf('@');
    if (at === -1) return null;
    const userinfo = rest.slice(0, at);
    const hostAndTail = rest.slice(at + 1);
    let boundary = hostAndTail.length;
    for (const sep of ['/', '?', '#']) {
      const idx = hostAndTail.indexOf(sep);
      if (idx !== -1 && idx < boundary) boundary = idx;
    }
    const hostport = hostAndTail.slice(0, boundary);
    const tail = hostAndTail.slice(boundary);
    const colon = userinfo.indexOf(':');
    const userRaw = colon === -1 ? userinfo : userinfo.slice(0, colon);
    const passRaw = colon === -1 ? '' : userinfo.slice(colon + 1);
    if (!passRaw) return null;
    const safeDecode = (s: string) => { try { return decodeURIComponent(s); } catch { return s; } };
    const username = encodeURIComponent(safeDecode(userRaw));
    const passwordRaw = safeDecode(passRaw);
    let path = tail;
    let existingQuery = '';
    const qIdx = tail.indexOf('?');
    if (qIdx !== -1) {
      path = tail.slice(0, qIdx);
      existingQuery = tail.slice(qIdx + 1);
    }
    const join = existingQuery ? '&' : '?';
    const finalQuery = `${existingQuery ? '?' + existingQuery : ''}${join}password=${encodeURIComponent(passwordRaw)}`;
    return `${scheme}://${username}@${hostport}${path}${finalQuery}`;
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

      // Determine column types using a scan to better detect JSON columns
      const columnTypes = this.determineColumnTypes(result, columnNames);
      const rows = new Array(rowCount);

      // Process all rows efficiently
      for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
        const row = result[rowIndex];
        const processedRow = new Array(columnCount);

        for (let colIndex = 0; colIndex < columnCount; colIndex++) {
          const val = row[columnNames[colIndex]];
          processedRow[colIndex] =
            columnTypes[colIndex] === ColumnTypeEnum.Json
              ? this.ensureJsonString(val)
              : this.serializeValueFast(val);
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

    if ((!cached || cached.paramCount !== args.length) && (sql.includes("$1"))) {
      // Parse and cache the template
      let templateSql = sql;
      const paramCount = args.length;

      // More efficient parameter replacement
      if (sql.includes("$1")) {
        for (let n = paramCount; n >= 1; n--) {
          const idx = n - 1;
          const marker = '${' + idx + '}';
          templateSql = templateSql.replaceAll(`$${n}`, marker);
        }
      }

      const parts = templateSql.split(/\$\{\d+\}/);
      const strings = this.createTemplateStrings(parts);
      const argOrder: number[] = [];
      const re = /\$\{(\d+)\}/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(templateSql)) !== null) {
        argOrder.push(Number(m[1]));
      }

      const built = { strings, paramCount, argOrder };
      templateCache.set(cacheKey, built);
      cached = built as any;
    }

    if (cached) {
      const expanded = (cached as any).argOrder?.length ? (cached as any).argOrder.map((i: number) => args[i]) : args;
      return connection(cached.strings, ...expanded);
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

          const columnTypes = this.determineColumnTypes(result, columnNames);
          const rows = new Array(result.length);

          for (let rowIndex = 0; rowIndex < result.length; rowIndex++) {
            const row = result[rowIndex];
            const processedRow = new Array(columnCount);

            for (let colIndex = 0; colIndex < columnCount; colIndex++) {
              const val = row[columnNames[colIndex]];
              processedRow[colIndex] =
                columnTypes[colIndex] === ColumnTypeEnum.Json
                  ? this.ensureJsonString(val)
                  : this.serializeValueFast(val);
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
      for (let n = args.length; n >= 1; n--) {
        const idx = n - 1;
        const marker = '${' + idx + '}';
        templateSql = templateSql.replaceAll(`$${n}`, marker);
      }

      const parts = templateSql.split(/\$\{\d+\}/);
      const strings = this.createTemplateStrings(parts);
      const argOrder: number[] = [];
      const re = /\$\{(\d+)\}/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(templateSql)) !== null) {
        argOrder.push(Number(m[1]));
      }
      const expanded = argOrder.length ? argOrder.map((i) => args[i]) : args;
      return tx(strings, ...expanded);
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

    // Ensure JSON columns arrive as valid JSON strings
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  private determineColumnTypes(result: any[], columnNames: string[]): ColumnType[] {
    const columnCount = columnNames.length;
    const types = new Array(columnCount) as ColumnType[];
    for (let i = 0; i < columnCount; i++) {
      const name = columnNames[i];
      let isJson = false;
      for (let r = 0; r < result.length; r++) {
        const v = result[r][name];
        if (v === null || v === undefined) continue;
        const t = typeof v;
        if (t === 'object') {
          if (v instanceof Date || Buffer.isBuffer(v)) {
            // not JSON
          } else {
            isJson = true; break;
          }
        } else if (t === 'string') {
          const s = (v as string).trim();
          if (this.isJsonishString(s)) { isJson = true; break; }
        }
      }
      if (isJson) types[i] = ColumnTypeEnum.Json;
      else types[i] = this.inferColumnTypeFast(result[0]?.[name]);
    }
    return types;
  }

  private isJsonishString(s: string): boolean {
    if (!s) return false;
    const t = s.trim();
    if (!t) return false;
    if (t.startsWith('{') || t.startsWith('[')) return true;
    if (t.startsWith('"') && t.endsWith('"')) return true;
    return false;
  }

  private ensureJsonString(value: unknown): string {
    if (value === null || value === undefined) return 'null';
    const t = typeof value;
    if (t === 'string') {
      const s = value as string;
      return this.isJsonishString(s) ? s : JSON.stringify(s);
    }
    if (t === 'number' || t === 'boolean') return JSON.stringify(value);
    if (value instanceof Date) return JSON.stringify(value.toISOString());
    if (Buffer.isBuffer(value)) return JSON.stringify(Array.from(value as unknown as Uint8Array));
    try { return JSON.stringify(value); } catch { return 'null'; }
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
