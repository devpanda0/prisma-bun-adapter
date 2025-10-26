# Issue Analysis: Postgres Adapter Array Parameter Errors

## Problem Description

User reported two errors when using the Postgres adapter with a seed script:

### Error 1: `e.map is not a function`
```
TypeError: e.map is not a function. (In 'e.map((o, s) => io(o, `${t}[${s}]`, r, n))', 'e.map' is undefined)
```

### Error 2: Duplicate Key Violation
```
duplicate key value violates unique constraint "organization_role_organizationId_name_key"
```

## Root Cause

### Error 1: Wrong Adapter Being Used

The user was using `PrismaPg` from `@prisma/adapter-pg`:

```typescript
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({
  connectionString: Bun.env.DATABASE_URL!,
});
```

**The Problem:**
- The standard `@prisma/adapter-pg` adapter has issues with array-typed columns in Postgres (e.g., `text[]`)
- When inserting arrays like `permissions: ["ALL"]`, it doesn't properly convert them to Postgres array literals
- This causes `e.map is not a function` errors in Prisma's runtime

**The Fix:**
- **BunPostgresAdapter** (version 1.1.4+) includes `coerceArgsForPostgres()` function that handles this correctly
- See `src/index.ts:213-244` and `src/optimized-index.ts:365-396`
- This function converts primitive JS arrays to valid Postgres array literals: `["ALL"]` → `{"ALL"}`

### Error 2: Non-idempotent Seed Script

The seed script uses `.create()` for roles, which fails on subsequent runs when the data already exists.

## Solution

### 1. Use BunPostgresAdapter Instead of PrismaPg

**Replace:**
```typescript
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({
  connectionString: Bun.env.DATABASE_URL!,
});
```

**With:**
```typescript
import { BunPostgresAdapter } from "@abcx3/prisma-bun-adapter";

const adapter = new BunPostgresAdapter({
  connectionString: Bun.env.DATABASE_URL!,
  maxConnections: 20,
});
```

**Or use the optimized version for better performance:**
```typescript
import { BunPostgresAdapter } from "@abcx3/prisma-bun-adapter/optimized";

const adapter = new BunPostgresAdapter({
  connectionString: Bun.env.DATABASE_URL!,
  maxConnections: 20,
});
```

### 2. Make Seed Script Idempotent

Use `.upsert()` instead of `.create()` for roles:

```typescript
// Before (causes duplicate key errors):
const adminRole = await prisma.organizationRole.create({
  data: { name: "Administrator", ... }
});

// After (idempotent):
const adminRole = await prisma.organizationRole.upsert({
  where: {
    organizationId_name: {
      organizationId: org.id,
      name: "Administrator"
    }
  },
  update: {},
  create: {
    name: "Administrator",
    organizationId: org.id,
    ...
  }
});
```

## Technical Details

### Why BunPostgresAdapter Works

The BunPostgresAdapter includes special handling for Postgres array parameters:

```typescript
// From src/index.ts:213-244
protected coerceArgsForPostgres(args: any[]): any[] {
  const toPgArrayLiteral = (arr: any[]): string => {
    const encodeItem = (v: any): string => {
      if (v === null || v === undefined) return 'NULL';
      switch (typeof v) {
        case 'number':
          return Number.isFinite(v) ? String(v) : 'NULL';
        case 'boolean':
          return v ? 'true' : 'false';
        case 'string': {
          const s = v.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
          return `"${s}"`;
        }
        // ...
      }
    };
    return `{${arr.map(encodeItem).join(',')}}`;
  };

  const isPrimitiveArray = (a: any[]): boolean =>
    Array.isArray(a) && a.every((v) => v === null || ['string', 'number', 'boolean'].includes(typeof v));

  return args.map((v) => (Array.isArray(v) && isPrimitiveArray(v) ? toPgArrayLiteral(v) : v));
}
```

This converts:
- `["ALL"]` → `{"ALL"}` (Postgres array literal)
- `[1, 2, 3]` → `{1,2,3}`
- Complex/object arrays are left unchanged (for JSON columns)

### Version Information

This fix was introduced in version 1.1.4 (2025-10-26):

> Fix: Postgres array parameters for primitive JS arrays are now coerced into valid Postgres array literals when bound through Bun's SQL template. This resolves "malformed array literal: "ALL"" errors for columns like `text[]` (e.g., `permissions: ["ALL"]`).

## Recommendation

1. **Immediately**: Switch from `@prisma/adapter-pg` to `@abcx3/prisma-bun-adapter`
2. **Optional**: Refactor seed script to use `.upsert()` for better reliability
3. **Consider**: Using the optimized adapter (`@abcx3/prisma-bun-adapter/optimized`) for production deployments

## References

- Adapter source: `/src/index.ts` and `/src/optimized-index.ts`
- Changelog: `CHANGELOG.md` version 1.1.4
- README: Installation and usage instructions
