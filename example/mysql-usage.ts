import { PrismaClient } from "@prisma/client";
import { BunMySQLAdapter } from "../src/index.js";

// Example usage of BunMySQLAdapter with Prisma

async function main() {
  // Create adapter with connection string
  const adapter = new BunMySQLAdapter("mysql://user:password@localhost:3306/mydb");
  
  // Or create with configuration object
  const adapterWithConfig = new BunMySQLAdapter({
    connectionString: "mysql://user:password@localhost:3306/mydb",
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
    console.log("🔍 Testing MySQL adapter...");
    
    // Simple query
    const result = await prisma.$queryRaw`SELECT 1 as test_value`;
    console.log("Simple query result:", result);

    // Parameterized query (MySQL uses ? placeholders)
    const paramResult = await prisma.$queryRaw`SELECT ${42} as param_value`;
    console.log("Parameterized query result:", paramResult);

    // Transaction example
    await prisma.$transaction(async (tx) => {
      console.log("🔄 Running transaction...");
      // Your transactional operations here
    });

    console.log("✅ MySQL adapter working correctly!");
    
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

if (import.meta.main) {
  main().catch(console.error);
}