# editor-context-operations Specification

## Purpose
TBD - created by archiving change detailed-implementation-plan. Update Purpose after archive.
## Requirements
### Requirement: Active Editor Context Retrieval
The system SHALL provide the active note path, cursor position, selection, and full unsaved editor content from the currently focused markdown editor through `read_active_context`. The response MUST include structured edit-target handoff data describing the full buffer and any currently selected region.

#### Scenario: Active markdown editor exists
- **WHEN** an agent requests active editor context and a markdown editor is focused
- **THEN** the system returns `activeFile`, `cursor`, `selection`, `content`, and edit-target descriptors for the active buffer state

#### Scenario: No active markdown editor exists
- **WHEN** an agent requests active editor context and no markdown editor is focused
- **THEN** the system returns a well-defined no-active-editor response without mutating any file and without fabricating edit targets

