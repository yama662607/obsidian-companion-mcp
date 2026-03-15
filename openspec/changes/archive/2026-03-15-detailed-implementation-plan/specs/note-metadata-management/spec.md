## ADDED Requirements

### Requirement: Markdown Note CRUD Operations
The system SHALL support create, read, update, and delete operations for markdown notes through bridge tools with explicit success and failure responses.

#### Scenario: Create new note
- **WHEN** a create-note request is submitted with a valid vault-relative path and content
- **THEN** the system writes the note and returns the created path and operation status

#### Scenario: Delete missing note
- **WHEN** a delete-note request targets a note that does not exist
- **THEN** the system returns a not-found error without creating side effects

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
