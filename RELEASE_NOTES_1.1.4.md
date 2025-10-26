@abcx3/prisma-bun-adapter v1.1.4 — 2025-10-26

Fixes
- Postgres array parameters: Primitive JS arrays (strings, numbers, booleans, null) are now coerced into valid Postgres array literals when bound for array-typed columns (e.g., text[]). Resolves “malformed array literal: "ALL"” seen with inputs like `permissions: ["ALL"]`.
- Applies to both adapters: standard (`@abcx3/prisma-bun-adapter`) and optimized (`@abcx3/prisma-bun-adapter/optimized`) in query and transaction paths.
- Non‑breaking: Complex/object arrays are left unchanged to avoid impacting JSON payloads.

Upgrade
- `npm install @abcx3/prisma-bun-adapter@1.1.4`
- Or bump `"@abcx3/prisma-bun-adapter": "1.1.4"` and reinstall.

Notes
- No API changes.
- If you previously worked around this by manually stringifying arrays, remove the workaround to let the adapter handle it.

Changelog
- Full entry: 1.1.4 in `CHANGELOG.md`.

Tagging
- Tag the release as `v1.1.4`.
- Compare link (works after tagging): https://github.com/FredrikBorgstrom/prisma-bun-adapter/compare/v1.1.3...v1.1.4

