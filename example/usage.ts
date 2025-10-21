import { PrismaClient } from "@prisma/client";
import { BunPostgresAdapter, BunMySQLAdapter, BunSQLiteAdapter } from "../src/index.js";

// Example showing all three adapters

async function postgresExample() {
  console.log("🐘 PostgreSQL Example");
  
  const adapter = new BunPostgresAdapter({
    connectionString: "postgresql://username:password@localhost:5432/database",
    maxConnections: 10,
    idleTimeout: 30000,
  });
  
  const prisma = new PrismaClient({
    adapter: await adapter.connect(),
  });

  try {
    // PostgreSQL uses $1, $2, etc. for parameters
    const result = await prisma.$queryRaw`SELECT 'PostgreSQL' as database_type`;
    console.log("Result:", result);
  } finally {
    await prisma.$disconnect();
  }
}

async function mysqlExample() {
  console.log("🐬 MySQL Example");
  
  const adapter = new BunMySQLAdapter({
    connectionString: "mysql://username:password@localhost:3306/database",
    maxConnections: 10,
    idleTimeout: 30000,
  });
  
  const prisma = new PrismaClient({
    adapter: await adapter.connect(),
  });

  try {
    // MySQL uses ? for parameters
    const result = await prisma.$queryRaw`SELECT 'MySQL' as database_type`;
    console.log("Result:", result);
  } finally {
    await prisma.$disconnect();
  }
}

async function sqliteExample() {
  console.log("🗃️ SQLite Example");
  
  const adapter = new BunSQLiteAdapter({
    filename: "./database.sqlite",
    maxConnections: 1,
    readonly: false,
    create: true,
  });
  
  const prisma = new PrismaClient({
    adapter: await adapter.connect(),
  });

  try {
    // SQLite uses ? for parameters
    const result = await prisma.$queryRaw`SELECT 'SQLite' as database_type`;
    console.log("Result:", result);
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  console.log("🚀 Prisma Bun Adapter Examples\n");
  
  try {
    await postgresExample();
    console.log();
    
    await mysqlExample();
    console.log();
    
    await sqliteExample();
    console.log();
    
    console.log("✅ All adapters demonstrated successfully!");
  } catch (error) {
    console.error("❌ Error:", error);
  }
}

if (import.meta.main) {
  main().catch(console.error);
}