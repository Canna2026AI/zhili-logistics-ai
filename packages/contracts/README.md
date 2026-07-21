# @zhili/contracts

OpenAPI 3.1 is the source of truth for first-party UI, public API, generated TypeScript path types and the contract mock server.

```bash
pnpm lint
pnpm generate
pnpm test
pnpm mock
```

The ten UI flows are pinned in `core-flow-operation-map.json` and their visible branches in `core-flow-state-map.json`. The contract test also resolves every P0 operation, schema, permission and feature ID in the product traceability matrix. Business packages consume generated types and must not hand-write duplicate DTOs. A contract change is merged by the root integration owner before feature worktrees consume it.

Prism serves deterministic examples at `http://127.0.0.1:4010/api/v1`. MSW handlers will wrap this same path/type surface during the frontend foundation task; executable fixture values come from `packages/testing/fixtures/canonical.json`, with the human-readable interpretation in `docs/01-design/canonical-fixtures.md`.
