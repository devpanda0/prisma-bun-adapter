import { PrismaClient } from "@prisma/client";

// Simple Prisma client without adapter for testing
export const prisma = new PrismaClient({
  log: ["query", "info", "warn", "error"],
});

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("Shutting down gracefully...");
  await prisma.$disconnect();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("Shutting down gracefully...");
  await prisma.$disconnect();
  process.exit(0);
});