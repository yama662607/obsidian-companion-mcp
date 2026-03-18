## 1. Discovery and contract design

- [x] 1.1 Define `list_notes`, `move_note`, and `get_index_status` schemas, annotations, and structured response shapes
- [x] 1.2 Define migration notes for `search_notes_semantic` and editor mutation response changes
- [x] 1.3 Add source-level policy tests that lock in bounded results and intent-aligned payload rules

## 2. Lightweight storage and index plumbing

- [x] 2.1 Refactor fallback storage to add metadata-first directory listing without full-body reads
- [x] 2.2 Refactor indexing internals so queue/state inspection can return bounded pending-path samples
- [x] 2.3 Update semantic refresh bookkeeping so queued work and immediately processed work are reported separately

## 3. New note discovery tools

- [x] 3.1 Implement `list_notes` with safe defaults, deterministic ordering, and cursor-based pagination
- [x] 3.2 Implement `move_note` with vault-boundary validation, destination handling, and semantic index path updates
- [x] 3.3 Implement `get_index_status` with counts, readiness flags, and bounded pending-path samples

## 4. Search and editor payload alignment

- [x] 4.1 Change semantic indexing/search storage so search results use bounded excerpts instead of full note bodies
- [x] 4.2 Update `search_notes_semantic` summaries and structured payloads to support the `search -> get_note` workflow
- [x] 4.3 Change editor mutation tool responses to lightweight confirmation payloads while keeping `get_active_context` as the full read path

## 5. Verification and rollout

- [x] 5.1 Add targeted implementation tests for large-folder listing, move semantics, and index status behavior
- [x] 5.2 Add E2E coverage for discovery-first workflows in real-device and isolated MCP runs
- [x] 5.3 Update docs, release notes, and test prompts to describe the new large-vault workflow and response contracts
