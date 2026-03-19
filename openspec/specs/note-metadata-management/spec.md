# note-metadata-management Specification

## Purpose
TBD - created by archiving change detailed-implementation-plan. Update Purpose after archive.
## Requirements
### Requirement: Frontmatter and Tag Management
The system SHALL support structured frontmatter updates and tag modifications with schema-aware validation.

#### Scenario: Update frontmatter with valid structure
- **WHEN** a metadata update request provides valid key/value frontmatter changes
- **THEN** the system persists the updated metadata and returns normalized metadata content

#### Scenario: Metadata update violates validation rules
- **WHEN** a metadata update request contains invalid or disallowed values
- **THEN** the system rejects the change with a validation error and leaves note metadata unchanged

### Requirement: Plugin-Unavailable Fallback Path
The bridge MUST provide a file-based fallback for note and metadata operations when plugin transport is unavailable and SHALL clearly annotate degraded-mode responses.

#### Scenario: Plugin is offline during note read
- **WHEN** a note read request is executed while plugin connectivity is unavailable
- **THEN** the bridge serves the request via fallback and marks the response as degraded mode

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

