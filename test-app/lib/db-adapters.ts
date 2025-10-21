import { PrismaClient } from "@prisma/client";
import { BunPostgresAdapter } from "../../src/index";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

export type AdapterType = "bun" | "prisma-pg";

export interface AdapterConfig {
  name: string;
  type: AdapterType;
  prisma: PrismaClient;
  dispose: () => Promise<void>;
}

export function createBunAdapter(): AdapterConfig {
  const adapter = new BunPostgresAdapter({
    connectionString: process.env.DATABASE_URL!,
    maxConnections: 10,
    idleTimeout: 30000,
  });

  const prisma = new PrismaClient({
    adapter,
    log: process.env.PRISMA_DISABLE_LOGS ? ["error"] : ["query", "info", "warn", "error"],
  });

  return {
    name: "BunPostgresAdapter",
    type: "bun",
    prisma,
    dispose: async () => {
      await prisma.$disconnect();
      await adapter.dispose();
    }
  };
}

export function createPrismaPgAdapter(): AdapterConfig {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL!,
    max: 10,
    idleTimeoutMillis: 30000,
  });

  const adapter = new PrismaPg(pool);
  
  const prisma = new PrismaClient({
    adapter,
    log: process.env.PRISMA_DISABLE_LOGS ? ["error"] : ["query", "info", "warn", "error"],
  });

  return {
    name: "PrismaPg (@prisma/adapter-pg)",
    type: "prisma-pg",
    prisma,
    dispose: async () => {
      await prisma.$disconnect();
      await pool.end();
    }
  };
}

export function createAdapter(type: AdapterType): AdapterConfig {
  switch (type) {
    case "bun":
      return createBunAdapter();
    case "prisma-pg":
      return createPrismaPgAdapter();
    default:
      throw new Error(`Unknown adapter type: ${type}`);
  }
}