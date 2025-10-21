import { PrismaClient } from "@prisma/client";
import { BunPostgresAdapter } from "../src/index.js";

// Example usage of BunPostgresAdapter with Prisma

async function main() {
  // Create adapter with connection string
  const adapter = new BunPostgresAdapter("postgresql://user:password@localhost:5432/mydb");
  
  // Or create with configuration object
  const adapterWithConfig = new BunPostgresAdapter({
    connectionString: "postgresql://user:password@localhost:5432/mydb",
    maxConnections: 10,
    idleTimeout: 30000,
    ssl: {
      rejectUnauthorized: false,
    },
  });

  // Create Prisma client with the adapter
  const prisma = new PrismaClient({
    adapter: await adapter.connect(),
  });

  try {
    // Example queries
    console.log("🔍 Testing PostgreSQL adapter...");
    
    // Simple query
    const result = await prisma.$queryRaw`SELECT 1 as test_value`;
    console.log("Simple query result:", result);

    // Parameterized query
    const paramResult = await prisma.$queryRaw`SELECT ${42} as param_value`;
    console.log("Parameterized query result:", paramResult);

    // Transaction example
    await prisma.$transaction(async (tx) => {
      console.log("🔄 Running transaction...");
      // Your transactional operations here
    });

    console.log("✅ PostgreSQL adapter working correctly!");
    
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

if (import.meta.main) {
  main().catch(console.error);
}