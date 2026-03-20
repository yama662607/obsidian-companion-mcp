## 1. Metadata-First Refresh Inputs

- [x] 1.1 Add a metadata-only vault listing path that returns note `path`, `updatedAt`, and `size` without reading full note bodies
- [x] 1.2 Keep the existing full-content read path available for changed-note indexing only

## 2. Semantic State Reconciliation

- [x] 2.1 Extend semantic state to persist note-level reconciliation metadata alongside chunk IDs
- [x] 2.2 Update semantic load/save and move/delete flows so note-level metadata stays consistent with chunk state
- [x] 2.3 Add stale-entry removal support for note paths no longer present in the vault

## 3. Refresh Orchestration

- [x] 3.1 Change `refresh_semantic_index` to compare vault metadata against semantic metadata before reading note bodies
- [x] 3.2 Queue and flush only changed or missing notes during refresh
- [x] 3.3 Remove stale semantic entries discovered during refresh reconciliation

## 4. Status and Tool Reporting

- [x] 4.1 Extend refresh results with reconciliation counters for scanned, skipped, queued, flushed, and removed notes
- [x] 4.2 Extend semantic status reporting so clients can inspect reconciliation-oriented counters after refresh
- [x] 4.3 Update MCP docs and execution evidence references for the new refresh semantics

## 5. Validation

- [x] 5.1 Add tests for unchanged-note fast paths, stale-entry cleanup, and large-vault refresh reconciliation
- [x] 5.2 Run `just check` and targeted refresh/index tests until all pass
- [x] 5.3 Validate the change with `openspec validate optimize-semantic-refresh --strict`
