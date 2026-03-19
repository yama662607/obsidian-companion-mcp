## Why

The current MCP tool surface mixes persisted-note operations, active-editor mutations, and search/discovery semantics in ways that make the intended workflow hard for agents to follow reliably. As the project moves toward a search -> read -> edit flow, the tool names, schemas, and return payloads need to be redesigned so read results can feed the correct edit operation without ambiguity.

## What Changes

- **BREAKING** Replace the current mixed naming scheme with a workflow-oriented tool surface centered on discovery, reading, and editing.
- Add a dedicated lexical `search_notes` tool and rename semantic search to `semantic_search_notes` with chunk-oriented results.
- **BREAKING** Replace `get_note` with `read_note` and `get_active_context` with `read_active_context`, aligning both read tools around a shared `edit_target` handoff shape.
- **BREAKING** Consolidate `update_note_content`, `insert_at_cursor`, and `replace_range` into a single `edit_note` tool that accepts discriminated edit targets returned by the read tools.
- **BREAKING** Rename metadata and status tools for clearer intent where needed, including `patch_note_metadata` and `get_semantic_index_status`.
- Add explicit `outputSchema` definitions and aligned annotations across the public tool surface, and update prompts/resources so they reference only the final tool names and follow-up flow.
- Rewrite `docs/mcp` to document the final tool set comprehensively, including discovery, read, edit, lifecycle, metadata, and index-management tools.

## Capabilities

### New Capabilities
- `note-reading-editing`: Unified read-to-edit workflow contracts, including shared edit targets across persisted-note reads and active-editor reads.

### Modified Capabilities
- `mcp-interface-modeling`: Tool naming, schema, annotation, and structured result expectations change across the public MCP surface.
- `editor-context-operations`: Active editor reads and mutations are re-expressed through the new read/edit workflow model.
- `note-metadata-management`: Persisted note lifecycle and metadata operations are renamed and narrowed around the new tool taxonomy.
- `semantic-vault-search`: Search interfaces change from one semantic-only tool to a lexical + semantic pair with updated result shapes.
- `vault-note-discovery`: Listing and index-status tools remain, but naming and follow-up semantics are aligned with the redesigned discovery flow.
- `quality-gate-enforcement`: Validation expectations expand to cover output schemas, final tool naming, and docs/prompt consistency for the redesigned surface.

## Impact

- Affected code: `mcp/src/tools`, `mcp/src/domain`, `mcp/src/prompts`, `mcp/src/resources`, tool-name constants, schema validation gates, and related tests.
- Affected APIs: MCP tool names, input schemas, output schemas, and prompt guidance are all breaking at the public interface level.
- Affected docs: `README.md`, `docs/mcp/*`, and release/migration guidance must be updated to explain the new workflow-oriented taxonomy.
- Systems affected: note read/write flows, active editor flows, lexical search, semantic search result modeling, and MCP contract validation.
