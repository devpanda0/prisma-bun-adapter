#!/usr/bin/env bun

import { $ } from "bun";

console.log("🚀 Setting up Prisma Bun PostgreSQL Adapter Test App\n");

async function checkPrerequisites() {
  console.log("🔍 Checking prerequisites...");
  
  try {
    // Check if DATABASE_URL is set
    if (!process.env.DATABASE_URL) {
      console.log("❌ DATABASE_URL not found in .env file");
      console.log("📝 Please update the .env file with your PostgreSQL connection string");
      console.log("   Example: DATABASE_URL=\"postgresql://username:password@localhost:5432/database_name\"");
      return false;
    }
    
    console.log("✅ DATABASE_URL configured");
    return true;
  } catch (error) {
    console.error("❌ Error checking prerequisites:", error);
    return false;
  }
}

async function setupDatabase() {
  console.log("\n📦 Setting up database...");
  
  try {
    console.log("  Generating Prisma client...");
    await $`bunx prisma generate`;
    
    console.log("  Running database migrations...");
    await $`bunx prisma migrate dev --name init`;
    
    console.log("  Seeding database...");
    await $`bun run seed.ts`;
    
    console.log("✅ Database setup complete!");
    return true;
  } catch (error) {
    console.error("❌ Database setup failed:", error);
    return false;
  }
}

async function runTests() {
  console.log("\n🧪 Running tests...");
  
  try {
    await $`bun run index.ts`;
    console.log("✅ All tests passed!");
    return true;
  } catch (error) {
    console.error("❌ Tests failed:", error);
    return false;
  }
}

async function main() {
  const prereqsOk = await checkPrerequisites();
  if (!prereqsOk) {
    process.exit(1);
  }
  
  const dbSetupOk = await setupDatabase();
  if (!dbSetupOk) {
    process.exit(1);
  }
  
  const testsOk = await runTests();
  if (!testsOk) {
    process.exit(1);
  }
  
  console.log("\n🎉 Setup complete! The Prisma Bun PostgreSQL adapter is working correctly.");
  console.log("\n📚 Next steps:");
  console.log("  - Run 'bun run dev' to run the tests again");
  console.log("  - Check out the code in index.ts to see how the adapter works");
  console.log("  - Modify the schema in prisma/schema.prisma to test your own models");
}

main().catch((error) => {
  console.error("❌ Setup failed:", error);
  process.exit(1);
});