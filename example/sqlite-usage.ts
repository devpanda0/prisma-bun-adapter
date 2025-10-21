import { PrismaClient } from "@prisma/client";
import { BunSQLiteAdapter } from "../src/index.js";

// Example usage of BunSQLiteAdapter with Prisma

async function main() {
  // Create adapter with filename string
  const adapter = new BunSQLiteAdapter("./mydb.sqlite");
  
  // Or use in-memory database
  const memoryAdapter = new BunSQLiteAdapter(":memory:");
  
  // Or create with configuration object
  const adapterWithConfig = new BunSQLiteAdapter({
    filename: "./mydb.sqlite",
    maxConnections: 1, // SQLite typically uses single connection
    readonly: false,
    create: true,
  });

  // Create Prisma client with the adapter
  const prisma = new PrismaClient({
    adapter: await adapter.connect(),
  });

  try {
    // Example queries
    console.log("🔍 Testing SQLite adapter...");
    
    // Simple query
    const result = await prisma.$queryRaw`SELECT 1 as test_value`;
    console.log("Simple query result:", result);

    // Parameterized query (SQLite uses ? placeholders)
    const paramResult = await prisma.$queryRaw`SELECT ${42} as param_value`;
    console.log("Parameterized query result:", paramResult);

    // Transaction example
    await prisma.$transaction(async (tx) => {
      console.log("🔄 Running transaction...");
      // Your transactional operations here
    });

    console.log("✅ SQLite adapter working correctly!");
    
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

if (import.meta.main) {
  main().catch(console.error);
}