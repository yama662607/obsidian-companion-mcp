## Why

Companion MCP is now functionally stable in real-device testing, but its tool surface is still optimized for small vaults and implementation convenience rather than agent workflows at scale. In large vaults, agents need lightweight discovery and organization tools, and several current responses return more data than the tool's intent requires.

## What Changes

- Add a scalable `list_notes` capability for folder-scoped note discovery with bounded results and cursor-based pagination.
- Add a `move_note` capability for vault-relative rename and relocation without requiring full note rewrites.
- Add a `get_index_status` capability so agents can inspect semantic index progress and pending work without guessing from search results.
- Narrow `search_notes_semantic` results from full-note payloads to lightweight match summaries that support the natural "search first, then get_note" workflow.
- Narrow editor mutation tool responses so write operations return confirmation-oriented payloads instead of full document bodies by default.
- Refactor discovery and indexing internals so large vault operations avoid full-content scans when only metadata or paths are needed.

## Capabilities

### New Capabilities
- `vault-note-discovery`: Folder listing, note relocation, and index-status inspection for large-vault navigation and organization.

### Modified Capabilities
- `semantic-vault-search`: Search results will return bounded excerpts and status metadata aligned with search intent rather than full note bodies.
- `editor-context-operations`: Editor write tools will return lightweight mutation results while preserving `get_active_context` as the full-context read path.
- `mcp-interface-modeling`: Tool contracts will explicitly distinguish discovery/search responses from full-content reads and require bounded result controls for large collections.

## Impact

- Affected code: `mcp/src/tools/*`, `mcp/src/domain/*`, `mcp/src/infra/fallbackStorage.ts`, shared schemas/constants, and related docs/tests.
- Affected APIs: new tools (`list_notes`, `move_note`, `get_index_status`) and modified structured responses for `search_notes_semantic`, `insert_at_cursor`, and `replace_range`.
- Performance impact: reduced payload size for search and mutation tools, and reduced full-content reads during folder discovery and index inspection.
- Operational impact: agents will follow a clearer workflow of "discover/search -> inspect -> read/edit", which should scale better to large vaults.
