## Why

`refresh_semantic_index` is still expensive on large vaults because it scans every note body before deciding what actually needs re-embedding. The current flow also relies on note-tool lifecycle events for deletion cleanup, so refresh is slower than it should be and does not fully reconcile external file changes.

## What Changes

- Change semantic refresh from full-content-first scanning to a metadata-first reconciliation pass.
- Re-index only notes whose stored semantic state no longer matches current vault metadata.
- Remove stale semantic entries for notes that no longer exist in the vault at refresh time.
- Extend refresh/status reporting so clients can see how many notes were scanned, re-queued, flushed, and removed during reconciliation.
- Add regression coverage for large-vault refresh behavior, external deletion reconciliation, and unchanged-note fast paths.

## Capabilities

### New Capabilities

- `semantic-refresh-reconciliation`: metadata-first semantic refresh that reconciles changed, unchanged, and deleted notes before embedding work is scheduled

### Modified Capabilities

- `semantic-vault-search`: refresh and indexing requirements will change from queue-only incremental behavior to full metadata reconciliation with accurate progress and stale-entry cleanup

## Impact

- Affected code:
  - `mcp/src/domain/noteService.ts`
  - `mcp/src/domain/semanticService.ts`
  - `mcp/src/infra/fallbackStorage.ts`
  - `mcp/src/tools/noteManagement.ts`
  - semantic refresh/runtime tests and execution evidence
- API/tool impact:
  - `refresh_semantic_index` and `get_semantic_index_status` structured payloads may gain reconciliation-oriented counters
- Systems:
  - vault filesystem scanning
  - semantic index persistence and stale-entry removal
  - refresh performance on large vaults
