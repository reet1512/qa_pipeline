---
status: complete
created: 2026-03-02
priority: medium
tags:
- architecture
- rust
- dx
- quality
depends_on:
- 342-rust-god-modules-split
parent: 341-codebase-refactoring-overhaul
created_at: 2026-03-02T02:40:56.470204615Z
updated_at: 2026-03-02T03:02:29.439336378Z
transitions:
- status: in-progress
  at: 2026-03-02T03:02:29.439336378Z
- status: complete
  at: 2026-03-02T16:11:00Z
---
# Phase 4: Rust → TypeScript Type Generation

> **Parent**: 341-codebase-refactoring-overhaul · **Priority**: Medium

## Goal

Automate type synchronization between Rust structs and TypeScript interfaces. Currently `packages/ui/src/types/api.ts` (470 LOC) is manually maintained and risks diverging from Rust definitions.

## Problem

Every API change requires updating types in two places:
1. Rust struct in `leanspec-http/src/types.rs` or `leanspec-core/src/types/`
2. TypeScript interface in `packages/ui/src/types/api.ts`

Missed syncs cause runtime errors, incorrect UI rendering, or silent data loss.

## Design

### Approach: `ts-rs` crate

Use the [`ts-rs`](https://github.com/Almetica/ts-rs) crate to derive TypeScript bindings from Rust structs at build time.

**Step 1: Add derive macros to Rust structs**
```rust
use ts_rs::TS;

#[derive(Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../packages/ui/src/types/generated/")]
pub struct SpecSummary {
    pub path: String,
    pub title: String,
    pub status: String,
    // ...
}
```

**Step 2: Generate TypeScript**
```bash
cargo test --workspace  # ts-rs generates .ts files during test runs
# OR
cargo test export_bindings  # dedicated test for type export
```

**Step 3: CI validation**
```yaml
- run: cargo test export_bindings
- run: git diff --exit-code packages/ui/src/types/generated/
  # Fail if generated types are stale
```

### Types to annotate

**Priority 1 — HTTP API types (`leanspec-http/src/types.rs`):**
- `SpecSummary`, `CreateSpecRequest`, `SearchRequest`, `SearchResponse`
- `StatsResponse`, `ValidationResponse`, `SpecRawResponse`
- `SessionResponse`, `RunnerCreateRequest`, `RunnerUpdateRequest`
- All 37 structs in types.rs

**Priority 2 — Core types (`leanspec-core/src/types/`):**
- `SpecInfo`, `SpecFrontmatter`
- `SessionInfo`, `SessionStatus`
- `RunnerDefinition`, `DetectionResult`

### Migration path

1. Generate types into `packages/ui/src/types/generated/`
2. Update imports in UI code to use generated types
3. Keep `api.ts` for any UI-only types or computed types
4. Eventually `api.ts` becomes thin re-exports + UI-specific additions

## Checklist

- [x] Add `ts-rs` to `leanspec-http` and `leanspec-core` dependencies
- [x] Add `#[derive(TS)]` to all HTTP request/response structs
- [x] Add `#[derive(TS)]` to core spec/session types
- [x] Create `export_bindings` test target
- [x] Generate initial `types/generated/` directory
- [x] Update UI imports to use generated types (gradual)
- [x] Add CI step to detect stale types
- [x] Document type generation workflow in CONTRIBUTING.md

## Constraints

- Generated types must be committed (not gitignored) for non-Rust developers
- Enum variants must map to TypeScript union types (not numeric enums)
- Optional fields must generate `field?: Type` (not `field: Type | null`)
- Serde rename attributes must be respected in generated output

## Test

```bash
cargo test export_bindings
# Verify: generated .ts files match current api.ts interfaces
# Verify: pnpm build still passes with generated imports
# Verify: CI catches stale types
```

## Verification Update (2026-03-02)

- `ts-rs` dependency is present in both `rust/leanspec-http/Cargo.toml` and `rust/leanspec-core/Cargo.toml`.
- Export test exists at `rust/leanspec-http/tests/export_bindings.rs`.
- Initial generated UI type files exist in `packages/ui/src/types/generated/`.
- Full rollout remains open: broad derive coverage, UI migration to generated types, CI stale-type guard, and contributor docs.

- Checklist progress: **3/8 complete (38%)**.

- `cargo test export_bindings -p leanspec-http` passes.

- Added CI stale-binding guard in `.github/workflows/ci.yml` (`cargo test export_bindings -p leanspec-http` + `git diff --exit-code -- packages/ui/src/types/generated`).
- Documented contributor workflow in `CONTRIBUTING.md` under "Rust -> TypeScript Type Bindings".
- Checklist progress: **5/8 complete (62%)**.

- Generated binding files now emit exported type aliases to avoid UI compile errors.
- HTTP type coverage is broad and exportable through `rust/leanspec-http/tests/export_bindings.rs`.
- Core TS derives now include session/runner-facing types:
  - `Session`, `SessionConfig`, `SessionMode`, `SessionStatus`
  - `RunnerDefinition`, `DetectionConfig`, `DetectionResult`
- Generated barrel updated in `packages/ui/src/types/generated/index.ts` to expose new core session/runner files.
- UI migration completed for shared enums/modes:
  - `packages/ui/src/types/specs.ts` now aliases generated `SpecStatus`/`SpecPriority`.
  - `packages/ui/src/types/api.ts` now aliases generated `SpecStatus`/`SpecPriority`/`SessionStatus`/`SessionMode`.
- Validation:
  - `cargo test -p leanspec-http --test export_bindings` passes.
  - `packages/ui`: `pnpm typecheck` passes.

- Checklist progress: **8/8 complete (100%)**.
