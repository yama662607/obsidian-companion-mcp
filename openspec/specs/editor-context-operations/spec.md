# editor-context-operations Specification

## Purpose
TBD - created by archiving change detailed-implementation-plan. Update Purpose after archive.
## Requirements
### Requirement: Active Editor Context Retrieval
The system SHALL provide the active note path, cursor position, selection, and full unsaved editor content from the currently focused markdown editor.

#### Scenario: Active markdown editor exists
- **WHEN** an agent requests editor context and a markdown editor is focused
- **THEN** the system returns `activeFile`, `cursor`, `selection`, and `content` representing the current unsaved buffer state

#### Scenario: No active markdown editor exists
- **WHEN** an agent requests editor context and no markdown editor is focused
- **THEN** the system returns a well-defined no-active-editor response without mutating any file

### Requirement: Precise Editor Insert and Replace
The system SHALL support insertion and range replacement at explicit positions and MUST validate bounds against the current editor buffer. Successful mutation responses SHALL prioritize mutation confirmation metadata over full-buffer echo.

#### Scenario: Insert text at valid cursor position
- **WHEN** an insert command is requested with a valid position in the active editor buffer
- **THEN** the system updates the editor content at that position and returns success with resulting cursor or mutation metadata without requiring the entire buffer in the default response

#### Scenario: Replace range with invalid position
- **WHEN** a replace command is requested with a position or range outside the current buffer bounds
- **THEN** the system rejects the command with a validation error and leaves content unchanged
