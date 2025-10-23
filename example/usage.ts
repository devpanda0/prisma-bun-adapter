import { PrismaClient } from "@prisma/client";
import { BunPostgresAdapter, BunMySQLAdapter, BunSQLiteAdapter } from "../src/index.js";

// Example showing all three adapters

async function postgresExample() {
  console.log("🐘 PostgreSQL Example");
  
  const adapter = new BunPostgresAdapter({
    connectionString: process.env.EXAMPLE_POSTGRES_URL!,
    maxConnections: 10,
    idleTimeout: 30000,
  });
  
  const prisma = new PrismaClient({
    adapter,
  });

  try {
    await prisma.$connect();
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
    connectionString: process.env.EXAMPLE_MYSQL_URL!,
    maxConnections: 10,
    idleTimeout: 30000,
  });
  
  const prisma = new PrismaClient({
    adapter,
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
    filename: process.env.EXAMPLE_SQLITE_FILE || "./database.sqlite",
    maxConnections: 1,
    readonly: false,
    create: true,
  });
  
  const prisma = new PrismaClient({
    adapter,
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
