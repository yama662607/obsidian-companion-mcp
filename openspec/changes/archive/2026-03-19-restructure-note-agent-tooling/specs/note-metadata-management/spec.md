## ADDED Requirements

### Requirement: Markdown Note Lifecycle Operations
The system SHALL support explicit lifecycle operations for persisted markdown notes through dedicated create, move, and delete tools with deterministic success and failure responses.

#### Scenario: Create new note
- **WHEN** a create-note request is submitted with a valid vault-relative path and content
- **THEN** the system writes the note and returns the created path and operation status

#### Scenario: Move existing note
- **WHEN** a move-note request is submitted with valid source and destination paths inside the vault root
- **THEN** the system relocates the note and returns the resulting note path without mutating unrelated files

#### Scenario: Delete missing note
- **WHEN** a delete-note request targets a note that does not exist
- **THEN** the system returns a not-found error without creating side effects

### Requirement: Patch-Based Metadata Updates
The system SHALL expose metadata mutation as a dedicated patch operation separate from content editing and SHALL preserve structured frontmatter values.

#### Scenario: Patch frontmatter with valid structure
- **WHEN** a metadata patch request provides valid key/value frontmatter changes
- **THEN** the system persists the updated metadata and returns normalized metadata content

#### Scenario: Metadata patch violates validation rules
- **WHEN** a metadata patch request contains invalid or disallowed values
- **THEN** the system rejects the change with a validation error and leaves note metadata unchanged

## REMOVED Requirements

### Requirement: Markdown Note CRUD Operations
**Reason**: Read and content-update flows are moved into the dedicated `read_note` and unified `edit_note` workflow capability.
**Migration**: Use `read_note` for persisted-note reads and `edit_note` for persisted-note content mutations; keep `create_note` and `delete_note` for lifecycle operations.
