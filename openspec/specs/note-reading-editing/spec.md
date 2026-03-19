# note-reading-editing Specification

## Purpose
TBD - created by archiving change restructure-note-agent-tooling. Update Purpose after archive.
## Requirements
### Requirement: Persisted Note Reading with Edit Handoff
The system SHALL expose `read_note` for persisted markdown notes and MUST return enough structured information to support safe follow-up edits without reconstructing anchors manually.

#### Scenario: Agent reads a heading and prepares a follow-up edit
- **WHEN** `read_note` is invoked for a vault-relative note path with a heading anchor
- **THEN** the response includes resolved selection coordinates, bounded content, a revision token, and an `edit_target` object that can be passed directly to `edit_note`

#### Scenario: Read result is truncated for a large note
- **WHEN** `read_note` returns only part of the requested note content due to `max_chars`
- **THEN** the response includes `read_more_hint` and still returns an edit target for the resolved selection

### Requirement: Active Context Reading with Edit Handoff
The system SHALL expose `read_active_context` for the focused editor and MUST return machine-readable edit targets for the current active buffer state.

#### Scenario: Active editor has a non-empty selection
- **WHEN** `read_active_context` is invoked while a markdown editor is focused and text is selected
- **THEN** the response includes an edit target for the selection and an edit target for the full active buffer

#### Scenario: Active editor has no selection
- **WHEN** `read_active_context` is invoked while a markdown editor is focused and no text is selected
- **THEN** the response omits selection-specific edit targets and still returns cursor- or document-scoped edit targets

### Requirement: Unified Edit Tool Across Persisted and Active Targets
The system SHALL expose a single `edit_note` tool that accepts discriminated edit targets originating from either persisted-note reads or active-context reads.

#### Scenario: Persisted note target is edited through shared contract
- **WHEN** `edit_note` is invoked with an edit target returned by `read_note`
- **THEN** the tool applies the requested mutation against the persisted note target and returns confirmation with updated follow-up read information

#### Scenario: Active editor target is edited through shared contract
- **WHEN** `edit_note` is invoked with an edit target returned by `read_active_context`
- **THEN** the tool applies the requested mutation against the active editor buffer and returns confirmation without requiring a separate editor-specific mutation tool

### Requirement: Exact Text Replacement Within an Edit Target
The unified edit tool SHALL support exact text replacement within the chosen target scope and MUST reject ambiguous replacements.

#### Scenario: Replace first exact match within a resolved target
- **WHEN** `edit_note` is invoked with `change.type = "replace_text"` and a valid exact match exists in the target
- **THEN** the system replaces the requested occurrence and returns success with before/after preview metadata

#### Scenario: Replace request matches multiple candidates ambiguously
- **WHEN** `edit_note` is invoked with `change.type = "replace_text"` and the requested match is not uniquely identified by the target and occurrence selector
- **THEN** the system returns a conflict or validation error and leaves content unchanged

