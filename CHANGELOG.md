Changelog
=========

All notable changes to this project will be documented in this file.
This project adheres to Semantic Versioning.

1.1.5 - 2025-10-26
-------------------

**Critical Fix:** Array parameter coercion (`coerceArgsForPostgres`) is now applied in ALL code paths, including fallback paths where no SQL placeholders are detected. This resolves the "e.map is not a function" error that occurred when Prisma sent queries with array parameters but without explicit placeholders.

Changes:
- Standard adapter: Added array coercion to fallback path in `executeQueryOptimized` and `executeTransactionQueryOptimized`
- Optimized adapter: Changed `getOrCreateTemplate` to return null instead of throwing when no placeholders are found, allowing fallback with array coercion
- Both adapters now consistently apply `coerceArgsForPostgres` to all queries with array parameters, regardless of placeholder detection

This fix ensures that array-typed columns (e.g., `text[]`, `int[]`) work correctly in all scenarios, including Prisma-generated queries that may embed parameters differently.

1.1.4 - 2025-10-26
-------------------

Fix: Postgres array parameters for primitive JS arrays are now coerced into valid Postgres array literals when bound through Bun's SQL template. This resolves "malformed array literal: "ALL"" errors for columns like `text[]` (e.g., `permissions: ["ALL"]`). The coercion applies only to arrays of strings, numbers, booleans, or null; complex/object arrays are left untouched to avoid impacting JSON payloads.

1.1.3 - 2025-10-25
-------------------

Update README and source files to reflect package name change to @abcx3/prisma-bun-adapter, add optimized import patterns, and enhance TypeScript module resolution guidance. Introduce re-exports for optimized Postgres adapter and improve transaction handling in the optimized driver implementation.

1.1.2 - 2025-10-23
-------------------

- Prisma comprehensive test suite now self-seeds baseline fixture data and adds a date-field `prisma.user.update` benchmark to cover reported regression scenarios.
- Bun Postgres adapter transactions reserve dedicated connections and issue explicit `BEGIN`/`COMMIT`/`ROLLBACK`, ensuring interactive transactions roll back correctly and clean up resources.
- Expanded regression coverage around transaction rollbacks and date updates to guard against future regressions.

1.1.1 - 2025-10-23
-------------------

- Documentation: explain the optional `@abcx3/prisma-bun-adapter/optimized` entry point, when to use it, and show sample code.

1.1.0 - 2025-10-23
-------------------

- Postgres connection strings: heuristic guard now detects unencoded reserved characters in credentials and falls back to a manual rewrite path, so unusual `userinfo` values no longer break adapter bootstrapping.
- Node compatibility: added explicit CommonJS `require` entries for the primary and optimized exports so consumers can `require("@abcx3/prisma-bun-adapter")` without bundler tricks.
- Tooling & scripts: new complex Prisma and raw SQL benchmark runners (`bun run test:bench:prisma-complex`, `bun run test:bench:sql-complex`) plus an `debug:example` watch script; documentation expanded with usage guidance and benchmark sections.
- Examples & tests: example apps now pull connection strings from env (with Docker Compose helper) and share the test database registry across integration tests, keeping the sample workflows aligned with the new scripts.

1.0.3 - 2025-10-22
-------------------

- Postgres placeholders: robust handling for complex/nested queries
  - Replace `$n` in descending order (e.g., `$12` before `$1`) to avoid prefix collisions.
  - Build per-occurrence argument mapping (`argOrder`) and expand args accordingly so repeated `$n` uses are respected.
  - Rebuild cached templates when argument count changes.
  - Ignore `?` as a placeholder on Postgres to avoid conflicts with JSONB operators (`?`, `?|`).
- JSON result handling: detect JSON columns by scanning rows and always emit valid JSON strings (fixes parsing errors like `Unexpected identifier "light_gray"`).
- Credentials: prevent double-encoding in connection string normalization (works with special characters in passwords without manual encoding).
- Cleanup: removed debug logging of connection strings.

1.0.2 - 2025-10-22
-------------------

- Postgres: Added multi-strategy connection handling to maximize compatibility with all passwords.
  - Tries normalized encoded URL.
  - Falls back to the raw `DATABASE_URL`.
  - Falls back to a variant that moves the password to a query parameter (`?password=...`) to avoid userinfo parsing issues in some runtimes.
- MySQL/SQLite: Retain normalization improvements from 1.0.1.
- Improved: Clearer errors for malformed URLs.
- Docs: Clarified that manual encoding should not be required.

1.0.1 - 2025-10-22
-------------------

- Automatic credential normalization/encoding for `DATABASE_URL` across Postgres, MySQL, and SQLite adapters.
- Robust fallback rewriter for “almost-URLs” to safely encode `userinfo` when the WHATWG URL parser rejects the string.
- Clearer error message when a malformed URL causes a URI parsing error.
- README updated about encoding & troubleshooting.

1.0.0 - 2025-10-21
-------------------

- Initial release with Bun-native Prisma driver adapters for PostgreSQL, MySQL, and SQLite.
