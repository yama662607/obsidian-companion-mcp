## 1. Tool Surface and Shared Contracts

- [x] 1.1 Replace legacy tool-name constants and registrations with the final public tool taxonomy
- [x] 1.2 Define shared `edit_target` and `change` schema variants for persisted-note and active-context editing
- [x] 1.3 Add explicit `outputSchema` coverage for the redesigned public tool surface

## 2. Read and Edit Workflow

- [x] 2.1 Implement `read_note` with resolved anchors, revision tokens, and edit handoff payloads
- [x] 2.2 Implement `read_active_context` with active-buffer edit handoff payloads
- [x] 2.3 Consolidate persisted-note and active-editor mutations into unified `edit_note`
- [x] 2.4 Remove or migrate legacy `get_note`, `update_note_content`, `insert_at_cursor`, and `replace_range` behavior

## 3. Discovery and Indexing

- [x] 3.1 Implement lexical `search_notes` with bounded snippets, filters, and pagination
- [x] 3.2 Rename and reshape semantic search as `semantic_search_notes` with chunk-level results and read hints
- [x] 3.3 Rename and align semantic index inspection as `get_semantic_index_status`

## 4. Lifecycle, Metadata, and Documentation

- [x] 4.1 Rename and align lifecycle/metadata tools, including `patch_note_metadata`
- [x] 4.2 Update prompts, resources, and README to reference only the final tool names and workflow
- [x] 4.3 Rewrite `docs/mcp` to document every final public tool, including discovery, read, edit, lifecycle, metadata, and maintenance flows

## 5. Validation and Migration

- [x] 5.1 Expand execution quality gates to validate final tool names, output schemas, and read-to-edit handoff fields
- [x] 5.2 Add source, integration, and end-to-end tests for lexical search, unified edit targets, and the new read -> edit workflow
- [x] 5.3 Add migration guidance mapping removed legacy tools to the final tool surface and validate with `openspec validate --strict`
