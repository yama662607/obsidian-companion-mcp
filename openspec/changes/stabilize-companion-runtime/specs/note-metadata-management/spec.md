## MODIFIED Requirements

### Requirement: Frontmatter and Tag Management
The system SHALL support structured frontmatter updates and tag modifications with schema-aware validation, and MUST guarantee round-trip consistency between metadata update and subsequent note reads.

#### Scenario: Metadata update is reflected in next read
- **WHEN** a metadata update request succeeds for a note
- **THEN** the next note read returns content and parsed metadata that reflect the updated frontmatter values

#### Scenario: Fallback metadata update in degraded mode
- **WHEN** plugin is unavailable and metadata update is processed through fallback path
- **THEN** response includes `degraded: true` and machine-readable `degradedReason`, and read output follows the same normalized frontmatter representation

### Requirement: Plugin-Unavailable Fallback Path
The bridge MUST provide a file-based fallback for note and metadata operations when plugin transport is unavailable and SHALL clearly annotate degraded-mode responses with actionable reason codes.

#### Scenario: Note operation executed in degraded mode
- **WHEN** a note or metadata operation executes while plugin connectivity is unavailable
- **THEN** the response includes deterministic reason code (for example `plugin_unavailable`) and preserves operation semantics without silent behavior changes
