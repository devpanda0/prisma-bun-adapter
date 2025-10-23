import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { BunPostgresAdapter, BunMySQLAdapter, BunSQLiteAdapter } from "../src/index.js";
import { databases as testDatabases } from "../test-app/setup-test-dbs.ts";

const pgConn = testDatabases.find((d) => d.name === "PostgreSQL")!.connectionString;
const mysqlConn = testDatabases.find((d) => d.name === "MySQL")!.connectionString;

describe("BunPostgresAdapter", () => {
  let adapter: BunPostgresAdapter;
  
  beforeAll(() => {
    adapter = new BunPostgresAdapter(pgConn);
  });

  it("should create adapter with connection string", () => {
    const testAdapter = new BunPostgresAdapter(pgConn);
    expect(testAdapter.provider).toBe("postgres");
    expect(testAdapter.adapterName).toBe("bun-postgres-adapter");
  });

  it("should create adapter with config object", () => {
    const testAdapter = new BunPostgresAdapter({
      connectionString: pgConn,
      maxConnections: 5,
      idleTimeout: 10000,
    });
    expect(testAdapter.provider).toBe("postgres");
  });

  it("should connect and return driver adapter", async () => {
    const driverAdapter = await adapter.connect();
    expect(driverAdapter.provider).toBe("postgres");
    expect(driverAdapter.adapterName).toBe("bun-postgres-adapter");
    await driverAdapter.dispose();
  });
});

describe("BunMySQLAdapter", () => {
  let adapter: BunMySQLAdapter;
  
  beforeAll(() => {
    adapter = new BunMySQLAdapter(mysqlConn);
  });

  it("should create adapter with connection string", () => {
    const testAdapter = new BunMySQLAdapter(mysqlConn);
    expect(testAdapter.provider).toBe("mysql");
    expect(testAdapter.adapterName).toBe("bun-mysql-adapter");
  });

  it("should create adapter with config object", () => {
    const testAdapter = new BunMySQLAdapter({
      connectionString: mysqlConn,
      maxConnections: 5,
      idleTimeout: 10000,
    });
    expect(testAdapter.provider).toBe("mysql");
  });

  it("should connect and return driver adapter", async () => {
    const driverAdapter = await adapter.connect();
    expect(driverAdapter.provider).toBe("mysql");
    expect(driverAdapter.adapterName).toBe("bun-mysql-adapter");
    await driverAdapter.dispose();
  });
});

describe("BunSQLiteAdapter", () => {
  let adapter: BunSQLiteAdapter;
  
  beforeAll(() => {
    const filename = process.env.TEST_SQLITE_FILE || ":memory:";
    adapter = new BunSQLiteAdapter(filename);
  });

  it("should create adapter with filename string", () => {
    const testAdapter = new BunSQLiteAdapter(":memory:");
    expect(testAdapter.provider).toBe("sqlite");
    expect(testAdapter.adapterName).toBe("bun-sqlite-adapter");
  });

  it("should create adapter with config object", () => {
    const testAdapter = new BunSQLiteAdapter({
      filename: "test.db",
      maxConnections: 1,
      readonly: false,
      create: true,
    });
    expect(testAdapter.provider).toBe("sqlite");
  });

  it("should connect and return driver adapter", async () => {
    const driverAdapter = await adapter.connect();
    expect(driverAdapter.provider).toBe("sqlite");
    expect(driverAdapter.adapterName).toBe("bun-sqlite-adapter");
    await driverAdapter.dispose();
  });
});

describe("Adapter Comparison", () => {
  const adapters = [
    {
      name: "PostgreSQL",
      adapter: new BunPostgresAdapter(pgConn),
      provider: "postgres" as const,
    },
    {
      name: "MySQL", 
      adapter: new BunMySQLAdapter(mysqlConn),
      provider: "mysql" as const,
    },
    {
      name: "SQLite",
      adapter: new BunSQLiteAdapter(":memory:"),
      provider: "sqlite" as const,
    },
  ];

  adapters.forEach(({ name, adapter, provider }) => {
    describe(`${name} Adapter`, () => {
      it("should have correct provider", () => {
        expect(adapter.provider).toBe(provider);
      });

      it("should have correct adapter name", () => {
        expect(adapter.adapterName).toBe(`bun-${provider}-adapter`);
      });

      it("should implement connect method", () => {
        expect(typeof adapter.connect).toBe("function");
      });

      it("should implement dispose method", () => {
        expect(typeof adapter.dispose).toBe("function");
      });
    });
  });
});

// Integration tests (require actual database connections)
describe("Integration Tests", () => {
  // These tests are commented out by default as they require actual database instances
  // Uncomment and configure environment variables to run integration tests
  
  /*
  describe("PostgreSQL Integration", () => {
    let adapter: BunPostgresAdapter;
    let driverAdapter: any;
    
    beforeAll(async () => {
      adapter = new BunPostgresAdapter(process.env.TEST_POSTGRES_URL!);
      driverAdapter = await adapter.connect();
    });

    afterAll(async () => {
      await driverAdapter?.dispose();
    });

    it("should execute simple query", async () => {
      const result = await driverAdapter.queryRaw({
        sql: "SELECT 1 as test_value",
        args: [],
      });
      
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toEqual([1]);
      expect(result.columnNames).toEqual(["test_value"]);
    });

    it("should execute parameterized query", async () => {
      const result = await driverAdapter.queryRaw({
        sql: "SELECT $1 as param_value",
        args: ["test"],
      });
      
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toEqual(["test"]);
    });
  });

  describe("MySQL Integration", () => {
    let adapter: BunMySQLAdapter;
    let driverAdapter: any;
    
    beforeAll(async () => {
      adapter = new BunMySQLAdapter(process.env.TEST_MYSQL_URL!);
      driverAdapter = await adapter.connect();
    });

    afterAll(async () => {
      await driverAdapter?.dispose();
    });

    it("should execute simple query", async () => {
      const result = await driverAdapter.queryRaw({
        sql: "SELECT 1 as test_value",
        args: [],
      });
      
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toEqual([1]);
      expect(result.columnNames).toEqual(["test_value"]);
    });

    it("should execute parameterized query", async () => {
      const result = await driverAdapter.queryRaw({
        sql: "SELECT ? as param_value",
        args: ["test"],
      });
      
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toEqual(["test"]);
    });
  });

  describe("SQLite Integration", () => {
    let adapter: BunSQLiteAdapter;
    let driverAdapter: any;
    
    beforeAll(async () => {
      adapter = new BunSQLiteAdapter(":memory:");
      driverAdapter = await adapter.connect();
    });

    afterAll(async () => {
      await driverAdapter?.dispose();
    });

    it("should execute simple query", async () => {
      const result = await driverAdapter.queryRaw({
        sql: "SELECT 1 as test_value",
        args: [],
      });
      
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toEqual([1]);
      expect(result.columnNames).toEqual(["test_value"]);
    });

    it("should execute parameterized query", async () => {
      const result = await driverAdapter.queryRaw({
        sql: "SELECT ? as param_value",
        args: ["test"],
      });
      
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toEqual(["test"]);
    });
  });
  */
});
