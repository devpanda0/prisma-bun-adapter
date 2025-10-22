Prisma Bun Adapter
==================

Prisma driver adapters for Bun's native SQL clients (PostgreSQL, MySQL, SQLite).

- Zero external runtime dependencies for Bun-backed connections
- Template-string based parameterization with caching
- Works with Prisma 6 driver adapter API

Install
-------

Pick the adapter(s) you want. The package includes classes for all 3 drivers.

```
bun add prisma-bun-adapter
```

Optional (for comparisons / tests in this repo):

```
bun add -d @prisma/adapter-pg @prisma/adapter-planetscale mysql2 better-sqlite3
```

Quick Start
-----------

PostgreSQL (Bun native):

```ts
import { PrismaClient } from "@prisma/client";
import { BunPostgresAdapter } from "prisma-bun-adapter";

const adapter = new BunPostgresAdapter({
  connectionString: process.env.DATABASE_URL!,
  maxConnections: 20,
});

const prisma = new PrismaClient({
  adapter,
  log: ["query", "info", "warn", "error"],
});

await prisma.user.findMany();
```

Notes
-----

- You do not need to percent‑encode special characters in your DB password when using `DATABASE_URL`. The adapter normalizes and encodes credentials automatically so model queries like `prisma.user.findFirst` work regardless of password contents.

Troubleshooting
---------------

- URI error on first model query (e.g., `user.findFirst`): This usually means your `DATABASE_URL` is malformed (e.g., missing scheme/host) or contains a stray character that breaks the URL. The adapter auto‑encodes credentials, but if parsing still fails, verify the URL shape is valid (e.g., `postgresql://user:pass@host:5432/db?sslmode=disable`).
- Models not accessible: Ensure you ran `prisma generate` after updating your schema, and construct `PrismaClient` with the adapter: `new PrismaClient({ adapter: new BunPostgresAdapter(process.env.DATABASE_URL!) })`. Generated model delegates (e.g., `prisma.user.findFirst`) work normally with this adapter.

MySQL (Bun native):

```ts
import { PrismaClient } from "@prisma/client";
import { BunMySQLAdapter } from "prisma-bun-adapter";

const adapter = new BunMySQLAdapter(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });
```

SQLite (Bun native):

```ts
import { PrismaClient } from "@prisma/client";
import { BunSQLiteAdapter } from "prisma-bun-adapter";

const adapter = new BunSQLiteAdapter(":memory:");
const prisma = new PrismaClient({ adapter });
```

Placeholders & Parameterization
-------------------------------

- PostgreSQL: supports `$1, $2, ...` (preferred), and also `?` for convenience.
- MySQL/SQLite: use `?` placeholders.

Examples:

```ts
// Postgres
await prisma.$queryRaw`SELECT $1 as value`;
// or
await prisma.$queryRaw({ sql: "SELECT $1 as value", args: [123] });

// MySQL / SQLite
await prisma.$queryRaw({ sql: "SELECT ? as value", args: [123] });
```

API Surface
-----------

The package exports the following classes:

- `BunPostgresAdapter`
- `BunMySQLAdapter`
- `BunSQLiteAdapter`

Each class implements Prisma's `SqlDriverAdapter` contract under the hood and can be passed to the `PrismaClient` constructor via the `adapter` option.

Environment
-----------

- Requires Bun runtime for Bun-backed connections.
- Node.js is supported when using Prisma client in your app (the adapter still runs via Bun's native SQL inside the runtime). For most projects, you will run your Prisma client within Bun.
- Suggested engines: Node >= 18, Bun >= 1.1

Build & Publish (maintainers)
-----------------------------

This package ships prebuilt JS and `.d.ts` types in `dist/`.

Scripts:

- `bun run build` – compile TypeScript to `dist/` with declarations
- `bun run test:performance` – optional performance demo
- `bun run test:comparison` – optional comparison scripts

Publishing checklist:

1. Update version in `package.json`.
2. `bun run build`
3. `npm publish` (or `npm publish --access public` for first publish)

FAQ
---

Q: I see `syntax error at or near "as"` in Postgres.

A: Use Postgres-style placeholders (`$1`, `$2`, ...) or upgrade to a version of the package that accepts both `?` and `$n`. This package converts placeholders appropriately for Bun's SQL template strings.

Q: How do I run the test scripts?

A: These are for local benchmarking only. See `test-app/setup-databases.md` for setting up Postgres/MySQL containers, then run the scripts under `package.json`.

Benchmark results
-----------------
📈 Benchmark Results:
====================
🚀 Bun PostgreSQL:
   Total time: 8.82ms
   Avg per op: 0.09ms
   Ops/second: 11332

🚀 Bun MySQL:
   Total time: 12.28ms
   Avg per op: 0.12ms
   Ops/second: 8144

🚀 Bun SQLite:
   Total time: 1.76ms
   Avg per op: 0.02ms
   Ops/second: 56723

🔧 Traditional PostgreSQL (pg):
   Total time: 16.38ms
   Avg per op: 0.16ms
   Ops/second: 6106

🔧 Traditional MySQL (mysql2):
   Total time: 19.41ms
   Avg per op: 0.19ms
   Ops/second: 5153

⚡ Performance Comparison by Database:
====================================

POSTGRESQL:
  🚀 Bun: 11332 ops/sec (0.09ms avg)
  🔧 Traditional: 6106 ops/sec (0.16ms avg)
  📈 Bun is 1.86x faster (1.86x speedup)
  🥇 🚀 Bun PostgreSQL: 11332 ops/sec
  🥈 🔧 Traditional PostgreSQL (pg): 6106 ops/sec

MYSQL:
  🚀 Bun: 8144 ops/sec (0.12ms avg)
  🔧 Traditional: 5153 ops/sec (0.19ms avg)
  📈 Bun is 1.58x faster (1.58x speedup)
  🥇 🚀 Bun MySQL: 8144 ops/sec
  🥈 🔧 Traditional MySQL (mysql2): 5153 ops/sec

SQLITE: Only one adapter available
  🚀 Bun SQLite: 56723 ops/sec

🎯 Summary:
===========
🚀 Bun adapters average: 25400 ops/sec
🔧 Traditional adapters average: 5629 ops/sec
📈 Bun adapters are 4.51x faster on average

✅ Tested 5 adapters successfully

License
-------

MIT – see `package.json#license`.
