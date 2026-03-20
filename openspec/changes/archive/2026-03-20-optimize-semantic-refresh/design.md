## Context

`refresh_semantic_index` currently calls `fallback.listNotes()`, which eagerly reads every markdown body before deciding whether a note needs re-indexing. The semantic layer already has note-level `updatedAt` checks and incremental updates on normal write/delete/move flows, but the explicit refresh path still performs a full content scan and does not reconcile stale entries created by external file deletion or rename activity outside the MCP tools.

The change spans the vault filesystem adapter, note service refresh orchestration, semantic index bookkeeping, and tool/status payloads. Because the user-visible problem is refresh latency on large vaults, the design must reduce unnecessary file reads first without weakening the current correctness guarantees for changed-note indexing.

## Goals / Non-Goals

**Goals:**
- Make `refresh_semantic_index` metadata-first so unchanged notes do not require full body reads.
- Reconcile semantic state against current vault contents, including removal of stale index entries for deleted notes.
- Preserve current incremental note-tool updates while making explicit refresh materially faster on large vaults.
- Return refresh/status counters that explain what was scanned, queued, flushed, skipped, and removed.

**Non-Goals:**
- Do not redesign refresh into a background job system in this change.
- Do not introduce content hashing in the first pass.
- Do not change semantic query ranking or chunk generation strategy.
- Do not change the transport contract for note reads/writes outside refresh/status payload extensions.

## Decisions

### 1. Introduce metadata-first vault enumeration for refresh

Refresh will use a new filesystem listing path that returns note metadata only: `path`, `updatedAt`, and `size`. Only notes whose stored semantic record no longer matches this metadata will be read in full and passed to `upsert`.

Why this over the current full-content listing:
- It removes the dominant source of refresh cost for unchanged notes.
- It keeps the implementation simple and local to the fallback storage layer.
- It can be deployed without changing the semantic query format.

Alternative considered:
- Keep full-content listing and rely on `upsert` to skip unchanged notes. Rejected because it still pays the full disk-read cost for large unchanged vaults.

### 2. Add explicit note-level semantic metadata for reconciliation

The semantic service currently stores chunk-level records and infers note freshness from the first chunk's `updatedAt`. This change will keep per-note metadata alongside chunk IDs so refresh can compare current vault state against indexed note state without opening the note body.

Stored note metadata will include:
- `path`
- `updatedAt`
- `size`
- `chunkIds`

Why this over chunk-only inference:
- Refresh decisions become direct and cheap.
- Stale entry removal becomes straightforward.
- Tool status can report note-level reconciliation counts accurately.

Alternative considered:
- Infer note freshness from the first chunk and current chunk count. Rejected because it is fragile and does not model deleted notes cleanly.

### 3. Refresh SHALL reconcile deletions before flushing embeddings

Refresh will compute the current vault note set and remove semantic entries whose paths are no longer present. This makes explicit refresh the repair path for out-of-band filesystem changes.

Why this over relying only on `delete_note` / `move_note` hooks:
- External vault edits are a real workflow.
- Users expect refresh to restore consistency, not just enqueue changes.

Alternative considered:
- Leave deletion cleanup to normal note lifecycle tools only. Rejected because refresh would remain incomplete as a repair operation.

### 4. Keep embedding execution synchronous per refresh invocation

This change keeps the current "refresh completes before the tool returns" semantics. The optimization focus is to reduce the candidate set and full body reads, not to change the operational model to background indexing.

Why this over background jobs now:
- The existing tool contract and tests already assume refresh completion semantics.
- Metadata-first reconciliation should remove enough work to improve latency materially before adding orchestration complexity.

Alternative considered:
- Switch refresh to background-only processing. Rejected for this change because it broadens scope and complicates status semantics.

### 5. Extend status/reporting with reconciliation counters

`refresh_semantic_index` and `get_semantic_index_status` will report enough information to explain refresh behavior:
- scanned note count
- unchanged/skipped note count
- queued note count
- flushed note count
- removed stale note count

Why this over leaving current counters unchanged:
- Performance work needs observability.
- It prevents refresh from appearing "slow" or "idle" when most work was skipped intentionally.

## Risks / Trade-offs

- **[Risk] Additional semantic metadata must stay consistent with chunk state** → Mitigation: update note-level metadata and chunk maps together inside the semantic service and cover with move/delete/reload tests.
- **[Risk] `updatedAt` + `size` can still miss pathological cases compared with content hashes** → Mitigation: keep the implementation metadata-first for now and leave hash-based refinement as a follow-up if needed.
- **[Risk] Refresh payload changes could surprise strict clients** → Mitigation: extend payloads additively and preserve existing fields.
- **[Risk] Reconciliation logic may remove entries unexpectedly if vault listing is incomplete** → Mitigation: keep vault-relative validation strict and cover deletion reconciliation with integration tests against temporary vault fixtures.

## Migration Plan

1. Add metadata-only listing support in the fallback storage layer.
2. Extend semantic state to keep note-level reconciliation metadata.
3. Change `refresh_semantic_index` to compare vault metadata with semantic state, read only changed notes, and remove stale entries.
4. Extend refresh/status payloads additively with reconciliation counters.
5. Add regression coverage for unchanged-note fast path, stale-entry cleanup, and large-vault refresh.
6. Rollback strategy: revert refresh orchestration and semantic metadata bookkeeping while leaving incremental write/delete hooks unchanged.

## Open Questions

- Whether `get_semantic_index_status` should expose the last refresh timestamp in this change or keep scope to counters only.
- Whether note size should be included in persistent semantic state immediately or only used transiently during refresh comparison.
