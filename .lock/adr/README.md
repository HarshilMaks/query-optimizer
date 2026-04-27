# ADR (Architecture Decision Records)

This directory stores immutable records of major architecture/product-technical decisions.

## 1. Naming Convention

Use:

`NNNN-short-title.md`

Examples:

- `0001-tenant-isolation-model.md`
- `0002-policy-engine-enforcement-mode.md`

## 2. ADR Template

Each ADR should contain:

1. **Status** (`proposed`, `accepted`, `superseded`, `deprecated`)
2. **Context**
3. **Decision**
4. **Alternatives considered**
5. **Consequences**
6. **Rollout impact**
7. **Links** (PRD/ARD/design/issues)

## 3. Process

1. Create ADR as `proposed`
2. Review with stakeholders
3. Mark as `accepted` on decision
4. Never edit history silently; use superseding ADRs

## 4. Initial ADR Backlog (to create next)

1. Tenant isolation data model
2. Audit event immutability strategy
3. Validation environment model
4. Policy engine rule format
5. Queue and retry model

