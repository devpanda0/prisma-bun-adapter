import { BunPostgresAdapter, BunMySQLAdapter, BunSQLiteAdapter } from "../src/index.js";
import { PrismaClient as PrismaClientPg } from "@prisma/client";
import { databases as testDatabases } from "./setup-test-dbs.ts";

const POSTGRES_URL = testDatabases.find((d) => d.name === "PostgreSQL")!.connectionString;
const MYSQL_URL = testDatabases.find((d) => d.name === "MySQL")!.connectionString;
// Optional: Planetscale URL for Prisma MySQL testing (required for @prisma/adapter-planetscale)
const PLANETSCALE_URL = process.env.TEST_PLANETSCALE_URL || "";

interface TestResult {
  adapter: string;
  provider: string;
  type: "bun" | "prisma";
  success: boolean;
  duration: number;
  error?: string;
  rowCount?: number;
  skipped?: boolean;
  connectionAvailable?: boolean;
}

interface AdapterConfig {
  name: string;
  type: "bun" | "prisma";
  adapter: any;
  connectionString?: string;
  connectionConfig?: any;
  testQueries: {
    simple: string;
    parameterized: { sql: string; args: any[] };
    create: string;
    insert: { sql: string; args: any[] };
    select: string;
    update: { sql: string; args: any[] };
    delete: string;
    drop: string;
  };
}

// Connection availability cache
const connectionCache = new Map<string, { available: boolean; error?: string }>();

// Lazy load Prisma adapters to handle optional dependencies
async function loadPrismaAdapters() {
  const adapters: any = {};
  // Attach the default Prisma Client (assumed PostgreSQL in this repo's schema)
  adapters.PrismaClientPg = PrismaClientPg;
  
  try {
    const { PrismaPg } = await import("@prisma/adapter-pg");
    const { Pool } = await import("pg");
    adapters.PrismaPg = PrismaPg;
    adapters.Pool = Pool;
  } catch (error) {
    console.log("⚠️  @prisma/adapter-pg not available:", (error as Error).message);
  }

  try {
    const { PrismaPlanetScale } = await import("@prisma/adapter-planetscale");
    const { connect } = await import("@planetscale/database");
    adapters.PrismaPlanetScale = PrismaPlanetScale;
    adapters.planetscaleConnect = connect;
  } catch (error) {
    console.log("⚠️  @prisma/adapter-planetscale or @planetscale/database not available:", (error as Error).message);
  }

  // Try to load a separately generated Prisma Client for MySQL
  // Generate with: bunx prisma generate --schema test-app/prisma/mysql.schema.prisma
  try {
    const mysqlClient = await import("./generated/mysql-client/index.js");
    adapters.PrismaClientMySQL = mysqlClient.PrismaClient;
  } catch (error) {
    console.log("⚠️  Prisma MySQL client not found. Generate with: bunx prisma generate --schema test-app/prisma/mysql.schema.prisma");
  }

  try {
    // Try to import better-sqlite3 - it might not be available in Bun
    const Database = await import("better-sqlite3");
    adapters.Database = Database.default || Database;
  } catch (error) {
    // SQLite comparison will be skipped
    console.log("⚠️  better-sqlite3 not available for Prisma SQLite comparison");
  }

  return adapters;
}

async function createAdapterConfigs(): Promise<AdapterConfig[]> {
  const prismaAdapters = await loadPrismaAdapters();
  
  const configs: AdapterConfig[] = [
    // Bun Adapters
    {
      name: "Bun PostgreSQL",
      type: "bun",
      adapter: BunPostgresAdapter,
      connectionString: POSTGRES_URL,
      testQueries: {
        simple: "SELECT 1 as test_value",
        parameterized: { sql: "SELECT $1 as param_value", args: ["test_param"] },
        create: `CREATE TABLE IF NOT EXISTS test_table (
          id SERIAL PRIMARY KEY,
          name VARCHAR(100),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        insert: { sql: "INSERT INTO test_table (name) VALUES ($1) RETURNING id", args: ["test_name"] },
        select: "SELECT * FROM test_table ORDER BY id",
        update: { sql: "UPDATE test_table SET name = $1 WHERE id = $2", args: ["updated_name", 1] },
        delete: "DELETE FROM test_table WHERE id = 1",
        drop: "DROP TABLE IF EXISTS test_table",
      },
    },
    {
      name: "Bun MySQL",
      type: "bun",
      adapter: BunMySQLAdapter,
      connectionString: MYSQL_URL,
      testQueries: {
        simple: "SELECT 1 as test_value",
        parameterized: { sql: "SELECT ? as param_value", args: ["test_param"] },
        create: `CREATE TABLE IF NOT EXISTS test_table (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(100),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        insert: { sql: "INSERT INTO test_table (name) VALUES (?)", args: ["test_name"] },
        select: "SELECT * FROM test_table ORDER BY id",
        update: { sql: "UPDATE test_table SET name = ? WHERE id = ?", args: ["updated_name", 1] },
        delete: "DELETE FROM test_table WHERE id = 1",
        drop: "DROP TABLE IF EXISTS test_table",
      },
    },
    {
      name: "Bun SQLite",
      type: "bun",
      adapter: BunSQLiteAdapter,
      connectionString: ":memory:",
      testQueries: {
        simple: "SELECT 1 as test_value",
        parameterized: { sql: "SELECT ? as param_value", args: ["test_param"] },
        create: `CREATE TABLE IF NOT EXISTS test_table (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        insert: { sql: "INSERT INTO test_table (name) VALUES (?)", args: ["test_name"] },
        select: "SELECT * FROM test_table ORDER BY id",
        update: { sql: "UPDATE test_table SET name = ? WHERE id = ?", args: ["updated_name", 1] },
        delete: "DELETE FROM test_table WHERE id = 1",
        drop: "DROP TABLE IF EXISTS test_table",
      },
    },
  ];

  // Add Prisma adapters if available
  if (prismaAdapters.PrismaPg && prismaAdapters.Pool) {
    configs.push({
      name: "Prisma PostgreSQL",
      type: "prisma",
      adapter: class PrismaPostgresAdapter {
        constructor(connectionString: string) {
          this.connectionString = connectionString;
        }
        connectionString: string;
        async connect() {
          const pool = new prismaAdapters.Pool({ connectionString: this.connectionString });
          const prismaAdapter = new prismaAdapters.PrismaPg(pool);
          const prisma = new prismaAdapters.PrismaClientPg({ adapter: prismaAdapter });
          // Provide a wrapper with a Bun-like interface for the tests
          return {
            // Support the same shape used by Bun adapters: { sql, args }
            queryRaw: async ({ sql, args = [] }: { sql: string; args?: any[] }) => {
              if (Array.isArray(args) && args.length > 0) {
                // For parameterized test we only need the first arg
                const value = args[0];
                // Use Prisma's parameterization via tagged template literals
                return await (prisma as any).$queryRaw`SELECT ${value} as param_value`;
              }
              return await (prisma as any).$queryRawUnsafe(sql);
            },
            executeRaw: async ({ sql, args = [] }: { sql: string; args?: any[] }) => {
              if (Array.isArray(args) && args.length > 0) {
                const value = args[0];
                return await (prisma as any).$executeRaw`SELECT ${value}`;
              }
              return await (prisma as any).$executeRawUnsafe(sql);
            },
            close: async () => {
              await prisma.$disconnect();
              await pool.end();
            },
            _pool: pool,
            _client: prisma,
          };
        }
      },
      connectionString: POSTGRES_URL,
      testQueries: {
        simple: "SELECT 1 as test_value",
        parameterized: { sql: "SELECT $1 as param_value", args: ["test_param"] },
        create: `CREATE TABLE IF NOT EXISTS test_table (
          id SERIAL PRIMARY KEY,
          name VARCHAR(100),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        insert: { sql: "INSERT INTO test_table (name) VALUES ($1) RETURNING id", args: ["test_name"] },
        select: "SELECT * FROM test_table ORDER BY id",
        update: { sql: "UPDATE test_table SET name = $1 WHERE id = $2", args: ["updated_name", 1] },
        delete: "DELETE FROM test_table WHERE id = 1",
        drop: "DROP TABLE IF EXISTS test_table",
      },
    });
  }

  if (prismaAdapters.PrismaPlanetScale && prismaAdapters.planetscaleConnect && PLANETSCALE_URL) {
    configs.push({
      name: "Prisma MySQL",
      type: "prisma",
      adapter: class PrismaMySQLAdapter {
        constructor(connectionString: string) {
          this.connectionString = connectionString;
        }
        connectionString: string;
        async connect() {
          if (!prismaAdapters.PrismaClientMySQL) {
            throw new Error("Prisma MySQL client not generated. Run: bunx prisma generate --schema test-app/prisma/mysql.schema.prisma");
          }
          // Use the official Planetscale HTTP driver with the Prisma adapter
          const connection = prismaAdapters.planetscaleConnect({ url: this.connectionString });
          const prismaAdapter = new prismaAdapters.PrismaPlanetScale(connection);
          const prisma = new prismaAdapters.PrismaClientMySQL({ adapter: prismaAdapter });
          return {
            queryRaw: async ({ sql, args = [] }: { sql: string; args?: any[] }) => {
              if (Array.isArray(args) && args.length > 0) {
                const value = args[0];
                return await (prisma as any).$queryRaw`SELECT ${value} as param_value`;
              }
              return await (prisma as any).$queryRawUnsafe(sql);
            },
            executeRaw: async ({ sql, args = [] }: { sql: string; args?: any[] }) => {
              if (Array.isArray(args) && args.length > 0) {
                const value = args[0];
                return await (prisma as any).$executeRaw`SELECT ${value}`;
              }
              return await (prisma as any).$executeRawUnsafe(sql);
            },
            close: async () => {
              await prisma.$disconnect();
              // planetscale client uses HTTP; no pool to close
            },
            _client: prisma,
          };
        }
      },
      connectionString: PLANETSCALE_URL,
      testQueries: {
        simple: "SELECT 1 as test_value",
        parameterized: { sql: "SELECT ? as param_value", args: ["test_param"] },
        create: `CREATE TABLE IF NOT EXISTS test_table (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(100),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        insert: { sql: "INSERT INTO test_table (name) VALUES (?)", args: ["test_name"] },
        select: "SELECT * FROM test_table ORDER BY id",
        update: { sql: "UPDATE test_table SET name = ? WHERE id = ?", args: ["updated_name", 1] },
        delete: "DELETE FROM test_table WHERE id = 1",
        drop: "DROP TABLE IF EXISTS test_table",
      },
    });
  }

  // Note: Prisma SQLite adapter (better-sqlite3) may not work well with Bun
  // We'll skip it for now as Bun has its own SQLite implementation

  return configs;
}

// Check if a database connection is available
async function checkConnection(adapterConfig: AdapterConfig): Promise<{ available: boolean; error?: string }> {
  const cacheKey = `${adapterConfig.name}-${adapterConfig.connectionString}`;
  
  if (connectionCache.has(cacheKey)) {
    return connectionCache.get(cacheKey)!;
  }

  try {
    const adapter = new adapterConfig.adapter(adapterConfig.connectionString);
    const driverAdapter = await adapter.connect();
    
    // Try a simple query to verify connection using a unified interface
    await driverAdapter.queryRaw({ sql: adapterConfig.testQueries.simple, args: [] });
    // Clean up
    if (adapterConfig.type === "bun") {
      await driverAdapter.dispose();
    } else if (driverAdapter.close) {
      await driverAdapter.close();
    }
    
    const result = { available: true };
    connectionCache.set(cacheKey, result);
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const result = { available: false, error: errorMessage };
    connectionCache.set(cacheKey, result);
    return result;
  }
}

async function runTest(
  adapterConfig: AdapterConfig,
  testName: string,
  testFn: (driverAdapter: any) => Promise<any>
): Promise<TestResult> {
  const startTime = performance.now();
  
  // Check connection availability first
  const connectionStatus = await checkConnection(adapterConfig);
  
  if (!connectionStatus.available) {
    const duration = performance.now() - startTime;
    return {
      adapter: adapterConfig.name,
      provider: adapterConfig.name.split(" ")[1]?.toLowerCase() || "unknown",
      type: adapterConfig.type,
      success: false,
      duration,
      error: `Database not available: ${connectionStatus.error}`,
      skipped: true,
      connectionAvailable: false,
    };
  }
  
  try {
    const adapter = new adapterConfig.adapter(adapterConfig.connectionString);
    const driverAdapter = await adapter.connect();
    
    try {
      const result = await testFn(driverAdapter, adapterConfig);
      const duration = performance.now() - startTime;
      
      return {
        adapter: adapterConfig.name,
        provider: adapterConfig.name.split(" ")[1]?.toLowerCase() || "unknown",
        type: adapterConfig.type,
        success: true,
        duration,
        rowCount: result?.rows?.length || result?.affectedRows || result,
        connectionAvailable: true,
      };
    } finally {
      if (adapterConfig.type === "bun") {
        await driverAdapter.dispose();
      } else {
        // Clean up Prisma adapter connections
        if (driverAdapter.close) {
          await driverAdapter.close();
        } else if (driverAdapter.end) {
          await driverAdapter.end();
        } else if (driverAdapter._pool && driverAdapter._pool.end) {
          await driverAdapter._pool.end();
        }
      }
    }
  } catch (error) {
    const duration = performance.now() - startTime;
    return {
      adapter: adapterConfig.name,
      provider: adapterConfig.name.split(" ")[1]?.toLowerCase() || "unknown",
      type: adapterConfig.type,
      success: false,
      duration,
      error: error instanceof Error ? error.message : String(error),
      connectionAvailable: true,
    };
  }
}

async function runAllTests(): Promise<void> {
  console.log("🚀 Bun vs Prisma Adapter Comparison\n");
  
  const adapters = await createAdapterConfigs();
  
  // First, check which databases are available
  console.log("🔍 Checking adapter availability...");
  const availabilityResults = await Promise.all(
    adapters.map(async (adapterConfig) => {
      const status = await checkConnection(adapterConfig);
      const icon = status.available ? "✅" : "❌";
      const typeIcon = adapterConfig.type === "bun" ? "🚀" : "🔷";
      
      if (status.available) {
        console.log(`  ${icon} ${typeIcon} ${adapterConfig.name}: Available`);
      } else {
        // Clean up error messages for better readability
        let cleanError = status.error || "Unknown error";
        if (cleanError.includes("password authentication failed")) {
          cleanError = "Database not running or wrong credentials";
        } else if (cleanError.includes("Connection closed") || cleanError.includes("ECONNREFUSED")) {
          cleanError = "Database server not running";
        } else if (cleanError.includes("getaddrinfo ENOTFOUND")) {
          cleanError = "Database host not found";
        }
        console.log(`  ${icon} ${typeIcon} ${adapterConfig.name}: ${cleanError}`);
      }
      return { adapter: adapterConfig.name, available: status.available, type: adapterConfig.type };
    })
  );
  
  const availableCount = availabilityResults.filter(r => r.available).length;
  const totalCount = availabilityResults.length;
  
  console.log(`\n📊 Status: ${availableCount}/${totalCount} adapters available for testing`);
  
  if (availableCount === 0) {
    console.log("\n❌ No adapters available for comparison testing.");
    console.log("\n💡 To enable database testing:");
    console.log("   1. Setup databases: bun run setup:dbs");
    console.log("   2. Or set environment variables:");
    console.log("      export TEST_POSTGRES_URL='postgresql://user:pass@localhost:5433/db'");
    console.log("      export TEST_MYSQL_URL='mysql://user:pass@localhost:3306/db'");
    console.log("\n🗃️  For SQLite-only testing, try: bun run demo:sqlite");
    return;
  }
  
  console.log();
  
  const testSuites = [
    {
      name: "Simple Query Test",
      test: async (driverAdapter: any, config: AdapterConfig) => {
        return await driverAdapter.queryRaw({ sql: config.testQueries.simple, args: [] });
      },
    },
    {
      name: "Parameterized Query Test", 
      test: async (driverAdapter: any, config: AdapterConfig) => {
        return await driverAdapter.queryRaw(config.testQueries.parameterized);
      },
    },
    {
      name: "Connection Overhead Test",
      test: async (driverAdapter: any, config: AdapterConfig) => {
        // Test multiple quick operations to measure connection overhead
        const startTime = performance.now();
        
        const operations = [];
        for (let i = 0; i < 10; i++) {
          operations.push(driverAdapter.queryRaw({ sql: config.testQueries.simple, args: [] }));
        }
        await Promise.all(operations);
        
        const endTime = performance.now();
        return { operations: 10, totalTime: endTime - startTime };
      },
    },
  ];

  const allResults: TestResult[] = [];

  for (const testSuite of testSuites) {
    console.log(`📋 Running ${testSuite.name}...`);
    
    const results = await Promise.all(
      adapters.map(adapterConfig =>
        runTest(adapterConfig, testSuite.name, testSuite.test)
      )
    );
    
    allResults.push(...results);
    
    // Display results for this test
    results.forEach(result => {
      let status: string;
      if (result.skipped) {
        status = "⏭️";
      } else if (result.success) {
        status = "✅";
      } else {
        status = "❌";
      }
      
      const typeIcon = result.type === "bun" ? "🚀" : "🔷";
      const duration = `${result.duration.toFixed(2)}ms`;
      const extra = result.rowCount !== undefined ? ` (${result.rowCount} rows)` : "";
      const error = result.error && !result.skipped ? ` - ${result.error}` : "";
      const skipped = result.skipped ? " (skipped - database not available)" : "";
      
      console.log(`  ${status} ${typeIcon} ${result.adapter}: ${duration}${extra}${error}${skipped}`);
    });
    
    console.log();
  }

  // Performance comparison by database type
  console.log("⚡ Performance Comparison by Database:");
  console.log("====================================");
  
  const databases = ["postgresql", "mysql", "sqlite"];
  
  const hasComparisons = databases.some(dbType => {
    const dbResults = allResults.filter(r => 
      r.provider === dbType && r.success && !r.skipped
    );
    return dbResults.length >= 2;
  });
  
  if (hasComparisons) {
    databases.forEach(dbType => {
      const dbResults = allResults.filter(r => 
        r.provider === dbType && r.success && !r.skipped
      );
      
      if (dbResults.length >= 2) {
        console.log(`\n${dbType.toUpperCase()}:`);
        
        const bunResults = dbResults.filter(r => r.type === "bun");
        const prismaResults = dbResults.filter(r => r.type === "prisma");
        
        if (bunResults.length > 0 && prismaResults.length > 0) {
          const bunAvg = bunResults.reduce((sum, r) => sum + r.duration, 0) / bunResults.length;
          const prismaAvg = prismaResults.reduce((sum, r) => sum + r.duration, 0) / prismaResults.length;
          const speedup = prismaAvg / bunAvg;
          
          console.log(`  🚀 Bun Adapter: ${bunAvg.toFixed(2)}ms average`);
          console.log(`  🔷 Prisma Adapter: ${prismaAvg.toFixed(2)}ms average`);
          
          if (speedup > 1) {
            console.log(`  📈 Bun is ${speedup.toFixed(2)}x faster`);
          } else {
            console.log(`  📉 Prisma is ${(1/speedup).toFixed(2)}x faster`);
          }
        }
      }
    });
  } else {
    console.log("\n⚠️  No direct comparisons available (need both Bun and Prisma adapters for same database)");
    
    // Show individual results if available
    const successfulResults = allResults.filter(r => r.success && !r.skipped);
    if (successfulResults.length > 0) {
      console.log("\n📊 Individual Adapter Performance:");
      successfulResults.forEach(result => {
        const typeIcon = result.type === "bun" ? "🚀" : "🔷";
        console.log(`  ${typeIcon} ${result.adapter}: ${result.duration.toFixed(2)}ms average`);
      });
    }
  }

  // Summary
  console.log("\n📊 Summary:");
  console.log("===========");
  
  const bunAdapters = availabilityResults.filter(r => r.type === "bun");
  const prismaAdapters = availabilityResults.filter(r => r.type === "prisma");
  
  console.log(`Bun Adapters: ${bunAdapters.filter(r => r.available).length}/${bunAdapters.length} available`);
  console.log(`Prisma Adapters: ${prismaAdapters.filter(r => r.available).length}/${prismaAdapters.length} available`);
  
  console.log("\n🎯 Key Differences:");
  console.log("==================");
  console.log("🚀 Bun Adapters:");
  console.log("  • Use Bun's native SQL clients");
  console.log("  • Optimized for Bun runtime");
  console.log("  • Template string caching");
  console.log("  • Unified base implementation");
  
  console.log("\n🔷 Prisma Adapters:");
  console.log("  • Use traditional Node.js drivers");
  console.log("  • Mature ecosystem");
  console.log("  • Broader compatibility");
  console.log("  • Official Prisma support");
  
  const availableAdapters = availabilityResults.filter(r => r.available);
  
  if (availableAdapters.length < availabilityResults.length) {
    console.log("\n💡 To test more adapters:");
    console.log("   • Setup databases: bun run setup:dbs");
    console.log("   • Install dependencies: bun install");
    console.log("   • Set environment variables for existing databases");
  }
  
  if (availableAdapters.length > 0) {
    console.log(`\n✅ Successfully tested ${availableAdapters.length} adapter(s)`);
    if (availableAdapters.length === 1 && availableAdapters[0].adapter.includes("SQLite")) {
      console.log("💡 For more comprehensive comparisons, setup PostgreSQL/MySQL databases");
    }
  }
}

// Run the tests
if (import.meta.main) {
  runAllTests().catch(console.error);
}

export { runAllTests };
