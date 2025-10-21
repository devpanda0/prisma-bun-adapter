import { PrismaClient } from "@prisma/client";
import { BunPostgresAdapter } from "../../src/index";

// Create the adapter with connection pooling
const adapter = new BunPostgresAdapter({
  connectionString: process.env.DATABASE_URL!,
  maxConnections: 10,
  idleTimeout: 30000,
});

// Create Prisma client with the Bun adapter
export const prisma = new PrismaClient({
  adapter,
  log: ["query", "info", "warn", "error"],
});

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("Shutting down gracefully...");
  await prisma.$disconnect();
  await adapter.dispose();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("Shutting down gracefully...");
  await prisma.$disconnect();
  await adapter.dispose();
  process.exit(0);
});
