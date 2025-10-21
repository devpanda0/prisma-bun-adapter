# Installation Guide

## Prerequisites

- Bun 1.0 or higher
- PostgreSQL database
- Node.js project with Prisma

## Step 1: Install the adapter

```bash
bun add prisma-bun-postgres-adapter
```

## Step 2: Install peer dependencies

```bash
bun add @prisma/client
bun add -d prisma
```

## Step 3: Initialize Prisma (if not already done)

```bash
bunx prisma init
```

## Step 4: Configure your schema

Update your `schema.prisma` file:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// Your models here...
```

## Step 5: Use the adapter in your code

```typescript
import { PrismaClient } from "@prisma/client";
import { BunPostgresAdapter } from "prisma-bun-postgres-adapter";

const adapter = new BunPostgresAdapter(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

// Use Prisma as normal
const users = await prisma.user.findMany();
```

## Step 6: Generate Prisma client

```bash
bunx prisma generate
```

## Step 7: Run migrations (if needed)

```bash
bunx prisma migrate dev
```

That's it! You're now using Bun's native PostgreSQL client with Prisma.