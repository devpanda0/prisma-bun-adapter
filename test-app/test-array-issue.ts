// Test case to reproduce array parameter issue
import { PrismaClient } from "./prisma/generated/client";
import { BunPostgresAdapter } from "../src/index";

// Test with standard adapter
async function testStandardAdapter() {
  console.log("🧪 Testing Standard BunPostgresAdapter with array fields...\n");

  const adapter = new BunPostgresAdapter({
    connectionString: process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/test",
    maxConnections: 5,
  });

  const prisma = new PrismaClient({ adapter });

  try {
    // First, create a table with an array field
    await prisma.$executeRawUnsafe(`
      DROP TABLE IF EXISTS test_roles CASCADE;
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE test_roles (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        permissions TEXT[] NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    console.log("✅ Table created");

    // Test 1: Insert with array using $executeRaw
    console.log("\n📝 Test 1: Insert with $executeRaw and array parameter...");
    try {
      await prisma.$executeRaw`
        INSERT INTO test_roles (name, permissions)
        VALUES ('Admin', ${["ALL"]}::text[])
      `;
      console.log("✅ Insert with array succeeded");
    } catch (error: any) {
      console.error("❌ Insert failed:", error.message);
      console.error("Full error:", error);
    }

    // Test 2: Insert with multiple permissions
    console.log("\n📝 Test 2: Insert with multiple permissions...");
    try {
      await prisma.$executeRaw`
        INSERT INTO test_roles (name, permissions)
        VALUES ('Manager', ${["READ", "WRITE", "UPDATE"]}::text[])
      `;
      console.log("✅ Insert with multiple permissions succeeded");
    } catch (error: any) {
      console.error("❌ Insert failed:", error.message);
    }

    // Test 3: Query back
    console.log("\n📝 Test 3: Query data back...");
    const roles = await prisma.$queryRaw`SELECT * FROM test_roles`;
    console.log("Retrieved roles:", roles);

    // Test 4: Using query with array in WHERE clause
    console.log("\n📝 Test 4: Query with array in WHERE...");
    try {
      const result = await prisma.$queryRaw`
        SELECT * FROM test_roles WHERE permissions = ${["ALL"]}::text[]
      `;
      console.log("✅ Query with array in WHERE succeeded");
      console.log("Result:", result);
    } catch (error: any) {
      console.error("❌ Query failed:", error.message);
    }

  } catch (error: any) {
    console.error("❌ Test failed:", error.message);
    console.error("Stack:", error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

// Test with optimized adapter
async function testOptimizedAdapter() {
  console.log("\n\n🧪 Testing Optimized BunPostgresAdapter with array fields...\n");

  const { BunPostgresAdapter: OptimizedAdapter } = await import("../src/optimized-index");

  const adapter = new OptimizedAdapter({
    connectionString: process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/test",
    maxConnections: 20,
  });

  const prisma = new PrismaClient({ adapter });

  try {
    // Clean up first
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS test_roles_opt CASCADE;`);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE test_roles_opt (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        permissions TEXT[] NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    console.log("✅ Table created");

    // Test with optimized adapter
    console.log("\n📝 Test: Insert with array parameter...");
    try {
      await prisma.$executeRaw`
        INSERT INTO test_roles_opt (name, permissions)
        VALUES ('Admin', ${["ALL"]}::text[])
      `;
      console.log("✅ Insert succeeded");

      const roles = await prisma.$queryRaw`SELECT * FROM test_roles_opt`;
      console.log("Retrieved roles:", roles);
    } catch (error: any) {
      console.error("❌ Insert failed:", error.message);
      console.error("Full error:", error);
    }

  } catch (error: any) {
    console.error("❌ Test failed:", error.message);
  } finally {
    await prisma.$disconnect();
  }
}

// Run tests
async function main() {
  console.log("🔍 Reproducing Array Parameter Issue\n");
  console.log("=" .repeat(60));

  await testStandardAdapter();
  await testOptimizedAdapter();

  console.log("\n" + "=".repeat(60));
  console.log("✅ Tests completed");
}

main().catch(console.error);
