# Prisma Bun Adapter

A collection of Prisma driver adapters that leverage Bun's native SQL clients for improved performance and reduced dependencies. Supports PostgreSQL, MySQL, and SQLite.

## Features

- 🚀 Uses Bun's optimized native SQL clients
- 🗄️ **Multi-database support**: PostgreSQL, MySQL, SQLite
- 🔒 Full transaction support
- 🎯 Type-safe with Prisma's excellent TypeScript support
- 📦 Minimal dependencies
- ⚡ Connection pooling support
- 🔄 Shared base implementation for consistency
- 🎨 Database-specific parameter handling

## Installation

```bash
bun add prisma-bun-adapter
```

## Usage

### PostgreSQL

```typescript
import { PrismaClient } from "@prisma/client";
import { BunPostgresAdapter } from "prisma-bun-adapter";

const adapter = new BunPostgresAdapter({
  connectionString: "postgresql://username:password@localhost:5432/database",
  maxConnections: 10,
  idleTimeout: 30000,
});

const prisma = new PrismaClient({
  adapter: await adapter.connect(),
});
```

### MySQL

```typescript
import { PrismaClient } from "@prisma/client";
import { BunMySQLAdapter } from "prisma-bun-adapter";

const adapter = new BunMySQLAdapter({
  connectionString: "mysql://username:password@localhost:3306/database",
  maxConnections: 10,
  idleTimeout: 30000,
});

const prisma = new PrismaClient({
  adapter: await adapter.connect(),
});
```

### SQLite

```typescript
import { PrismaClient } from "@prisma/client";
import { BunSQLiteAdapter } from "prisma-bun-adapter";

const adapter = new BunSQLiteAdapter({
  filename: "./database.sqlite",
  maxConnections: 1,
  readonly: false,
  create: true,
});

const prisma = new PrismaClient({
  adapter: await adapter.connect(),
});
```

## Configuration Options

### PostgreSQL & MySQL

```typescript
interface BunPostgresConfig | BunMySQLConfig {
  connectionString: string;
  maxConnections?: number;    // Default: 5
  idleTimeout?: number;       // Default: 30000ms
  ssl?: boolean | {
    rejectUnauthorized?: boolean;
    ca?: string;
    cert?: string;
    key?: string;
  };
}
```

### SQLite

```typescript
interface BunSQLiteConfig {
  filename: string;
  maxConnections?: number;    // Default: 1
  readonly?: boolean;         // Default: false
  create?: boolean;           // Default: true
}
```

## Transactions

All adapters fully support Prisma's transaction features:

```typescript
await prisma.$transaction(async (tx) => {
  const user = await tx.user.create({
    data: { email: "test@example.com", name: "Test User" }
  });
  
  await tx.profile.create({
    data: { userId: user.id, bio: "Test bio" }
  });
});
```

## Raw Queries

Raw SQL queries work seamlessly with database-specific syntax:

```typescript
// PostgreSQL (uses $1, $2, etc.)
const pgResult = await prisma.$queryRaw`
  SELECT COUNT(*) as count FROM "User" WHERE "active" = ${true}
`;

// MySQL & SQLite (use ? placeholders)
const mysqlResult = await prisma.$queryRaw`
  SELECT COUNT(*) as count FROM User WHERE active = ${true}
`;
```

## Database-Specific Features

### Parameter Placeholders
- **PostgreSQL**: Uses `$1`, `$2`, etc. (automatically converted)
- **MySQL**: Uses `?` placeholders (automatically converted)
- **SQLite**: Uses `?` placeholders (automatically converted)

### Isolation Levels
Transaction isolation levels are supported for PostgreSQL and MySQL:

```typescript
const tx = await adapter.startTransaction("READ COMMITTED");
```

Note: SQLite has limited isolation level support.

## Architecture

The package uses a shared base class (`BaseBunDriverAdapter`) that provides:

- Common query execution logic
- Template string caching for performance
- Unified error handling
- Connection management
- Transaction support

Each database-specific adapter extends this base class and implements:

- Database-specific connection creation
- Parameter placeholder detection and conversion
- Provider-specific optimizations

## Performance

All adapters include optimizations:

- Template string caching to avoid repeated SQL parsing
- Efficient parameter placeholder conversion
- Pre-allocated arrays for result processing
- Fast column type inference
- Optimized value serialization

## Development

```bash
# Install dependencies
bun install

# Build the project
bun run build

# Run unit tests
bun test

# Run multi-adapter comparison tests
bun run test:multi

# Development mode
bun run dev
```

## Testing

The package includes comprehensive tests:

- **Unit tests**: Test adapter creation and basic functionality
- **Multi-adapter comparison**: Comprehensive testing across all databases
- **Performance benchmarks**: Compare performance between adapters
- **Integration tests**: Real database operations (when databases are available)

### Quick Database Setup

Use Docker to quickly set up test databases:

```bash
# Start PostgreSQL and MySQL test databases
bun run setup:dbs

# Run comprehensive tests
bun run test:multi

# Stop test databases
bun run setup:dbs:stop
```

### Performance Testing

Compare Bun adapters with traditional Node.js drivers:

```bash
# Quick comparison demo (works immediately)
bun run demo:quick

# SQLite performance demo (works without setup)
bun run demo:sqlite

# Performance comparison (requires databases)
bun run test:performance

# Bun vs Prisma adapter comparison (requires databases)
bun run test:comparison
```

### Manual Database Setup

Set environment variables to test with your own databases:

```bash
export TEST_POSTGRES_URL="postgresql://user:pass@localhost:5432/testdb"
export TEST_MYSQL_URL="mysql://user:pass@localhost:3306/testdb"
# SQLite works automatically with in-memory database
```

See [test-app/setup-databases.md](test-app/setup-databases.md) for detailed setup instructions.

## Requirements

- Bun 1.3+ (for native SQL client support)
- Prisma 6.0+
- Database servers:
  - PostgreSQL 12+ (for PostgreSQL adapter)
  - MySQL 8.0+ (for MySQL adapter)
  - SQLite 3.35+ (for SQLite adapter)

## License

MIT