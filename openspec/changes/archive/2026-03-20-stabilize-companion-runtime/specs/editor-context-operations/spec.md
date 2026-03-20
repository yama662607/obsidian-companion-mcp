## MODIFIED Requirements

### Requirement: Active Editor Context Retrieval
The bridge SHALL retrieve active editor context from plugin-backed runtime as the primary source and MUST NOT return synthetic in-memory context as normal operation.

#### Scenario: Active editor exists in Obsidian
- **WHEN** `get_active_context` is invoked while an editor is active in Obsidian
- **THEN** the response reflects plugin-provided document path, selection, and cursor range with `degraded: false`

#### Scenario: No active editor in Obsidian
- **WHEN** `get_active_context` is invoked and no editor is active
- **THEN** the system returns a deterministic no-active-editor result with explicit reason and without fabricating document content

### Requirement: Editor Mutation Operations
The bridge SHALL execute editor mutations through plugin RPC (`insert_at_cursor`, `replace_range`) and SHALL report degraded mode only when plugin path is unavailable.

#### Scenario: Editor mutation succeeds via plugin
- **WHEN** `insert_at_cursor` or `replace_range` is invoked with valid input and plugin connectivity is normal
- **THEN** mutation is applied in active editor and response reports successful plugin-backed execution

#### Scenario: Editor mutation cannot use plugin path
- **WHEN** plugin connectivity is unavailable for an editor mutation request
- **THEN** the response is explicitly degraded with machine-readable reason and no false-positive success is returned
