Changelog
=========

All notable changes to this project will be documented in this file.
This project adheres to Semantic Versioning.

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
