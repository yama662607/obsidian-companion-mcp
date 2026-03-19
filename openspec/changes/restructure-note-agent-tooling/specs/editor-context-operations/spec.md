## MODIFIED Requirements

### Requirement: Active Editor Context Retrieval
The system SHALL provide the active note path, cursor position, selection, and full unsaved editor content from the currently focused markdown editor through `read_active_context`. The response MUST include structured edit-target handoff data describing the full buffer and any currently selected region.

#### Scenario: Active markdown editor exists
- **WHEN** an agent requests active editor context and a markdown editor is focused
- **THEN** the system returns `activeFile`, `cursor`, `selection`, `content`, and edit-target descriptors for the active buffer state

#### Scenario: No active markdown editor exists
- **WHEN** an agent requests active editor context and no markdown editor is focused
- **THEN** the system returns a well-defined no-active-editor response without mutating any file and without fabricating edit targets

## REMOVED Requirements

### Requirement: Precise Editor Insert and Replace
**Reason**: Active editor mutation is moved into the unified `edit_note` workflow so read results and edit inputs share a single contract.
**Migration**: Replace uses of `insert_at_cursor` and `replace_range` with `read_active_context` followed by `edit_note` using the returned active edit target.
