## Context

The current Companion MCP implementation is strongest at direct note CRUD and semantic lookup, but it lacks the "explore and narrow down" layer that agents need before acting on a large vault. At the same time, some tools return data that is larger than their intent suggests:

- `search_notes_semantic` currently indexes and returns full note bodies as `snippet`.
- editor mutation tools return full `content` even though their primary job is to confirm a write.
- fallback note listing logic is optimized for indexing, not for lightweight directory exploration.

Large vaults introduce additional constraints:

- Returning thousands of paths or whole note bodies can overflow client context and slow rendering.
- Full vault scans that read every markdown file are too expensive for interactive listing.
- Index progress that is only visible through `pendingCount` is insufficient for debugging or agent planning.

## Goals / Non-Goals

**Goals:**
- Provide a bounded, cursor-based note discovery tool that works predictably on large folders.
- Provide a safe move operation that keeps note organization inside the vault root and updates semantic index state consistently.
- Expose index progress in a direct inspection tool instead of forcing agents to infer status from search responses.
- Align tool outputs with tool intent so search/discovery tools return summaries, while read tools return full content.
- Preserve existing successful workflows (`get_note`, `get_active_context`, CRUD, semantic indexing) while improving scale behavior.

**Non-Goals:**
- Add batch mutations in this change.
- Add full text search or metadata query tools in this change.
- Add full recursive tree rendering as the default listing behavior.
- Change the plugin bridge protocol unless required for move support.

## Decisions

### 1) Add `vault-note-discovery` as a separate capability
Create a new capability rather than overloading note CRUD specs. Listing, moving, and index inspection are navigation/orchestration concerns, not pure content CRUD.

Alternatives considered:
- Extend `note-metadata-management` with list/move requirements.
  - Rejected because it blurs content mutation with navigation and scales poorly as the surface grows.

### 2) Use cursor-based pagination for `list_notes`
`list_notes` should accept a vault-relative directory plus bounded result controls. The response should include `entries`, `nextCursor`, `hasMore`, and `truncated`.

Alternatives considered:
- Offset-based paging.
  - Rejected because directory contents can change between calls and offsets become unstable.
- Returning full recursive trees by default.
  - Rejected because large vaults make this too expensive and noisy for MCP clients.

### 3) Split lightweight discovery from full-content reads
Search and list tools should return path-oriented summaries, not full note bodies. Full content remains available through `get_note`; full editor buffers remain available through `get_active_context`.

Alternatives considered:
- Keep current payloads and add optional flags later.
  - Rejected because the current defaults are already misaligned with tool intent and large-vault needs.

### 4) Add `move_note(from, to)` and treat rename as a special case
One move tool covers both directory moves and filename changes. It should reject vault escape, define overwrite behavior explicitly, and update semantic index references for the moved path.

Alternatives considered:
- Separate `rename_note` and `move_note`.
  - Rejected because rename is just a move within the same parent directory and would duplicate validation rules.

### 5) Add `get_index_status` as a first-class read tool
The system already tracks pending and indexed counts. A dedicated tool should expose bounded index diagnostics such as `pendingCount`, `indexedCount`, `running`, `modelReady`, and a limited sample of pending paths.

Alternatives considered:
- Keep exposing status only inside `search_notes_semantic`.
  - Rejected because operational visibility should not require issuing a semantic search.

### 6) Refactor fallback storage into metadata-first and content-read paths
Listing and status inspection should not rely on `listNotes()` reading every file body. Introduce a lightweight file-entry scanner for discovery and keep full reads only where content is actually required.

Alternatives considered:
- Reuse `listNotes()` everywhere.
  - Rejected because it is designed for indexing and is too expensive for interactive folder listing.

### 7) Keep `refresh_semantic_index` but redefine its messaging around queued work
The current tool does not complete a full rebuild synchronously. Its response should describe queueing/initial flush accurately, and `get_index_status` should provide follow-up visibility.

Alternatives considered:
- Convert refresh into a fully blocking rebuild.
  - Rejected for now because it would worsen large-vault latency and likely exceed typical tool-call expectations.

## Risks / Trade-offs

- [Directory pagination cursor becomes invalid after concurrent file changes] → Mitigation: define cursors as best-effort snapshots based on stable sort keys, and allow clients to restart listing safely.
- [Move operations create path/index drift] → Mitigation: update semantic state atomically in the same service path and add tests for move-after-search scenarios.
- [Reducing payloads breaks clients that implicitly relied on full content] → Mitigation: keep `get_note` and `get_active_context` unchanged as the explicit full-read tools and document response changes in migration notes.
- [Pending-path visibility leaks too much data on huge queues] → Mitigation: return only a bounded sample plus counts, never the entire pending set.
- [Large folders still produce expensive scans] → Mitigation: list entries without reading file bodies and default to shallow listing with safe limits.

## Migration Plan

1. Introduce new discovery/status tools with bounded schemas and tests.
2. Refactor internal storage helpers so listing/status paths no longer depend on full-content scans.
3. Change `search_notes_semantic` result shape to excerpt-oriented summaries and document the intended `search -> get_note` workflow.
4. Change editor write tool responses to lightweight mutation payloads and update tests/docs.
5. Update release notes and real-device test prompts to cover large-folder listing and move/index-status behavior.

Rollback strategy:
- New tools are additive and can be disabled by reverting registrations.
- Existing search/editor response changes can be reverted independently if client compatibility issues appear.

## Open Questions

- Whether `list_notes` should support `recursive=true` in the first iteration or ship as shallow-only with future expansion.
- Whether `get_index_status` should include `lastIndexedAt` / `lastRefreshAt`, which may require additional runtime bookkeeping.
- Whether `move_note` should permit overwrite with an explicit flag or reject destination collisions outright in v1.
