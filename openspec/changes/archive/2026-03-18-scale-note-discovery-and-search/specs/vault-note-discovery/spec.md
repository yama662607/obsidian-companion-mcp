## ADDED Requirements

### Requirement: Bounded Note Listing
The system SHALL expose a folder-scoped note listing tool that returns bounded, deterministic results without reading full note bodies for every entry.

#### Scenario: Agent lists a folder with safe defaults
- **WHEN** `list_notes` is invoked with a valid vault-relative folder path and no explicit paging controls
- **THEN** the system returns a shallow, deterministic list of entries with a safe default limit, along with machine-readable pagination metadata

#### Scenario: Folder contains more entries than the current page limit
- **WHEN** `list_notes` is invoked on a folder whose matching entries exceed the requested or default limit
- **THEN** the response returns only the bounded page, sets `hasMore` to true, and includes a cursor for continuing the listing

### Requirement: Safe Note Relocation
The system SHALL expose a move operation for vault-relative notes and MUST enforce vault-boundary and destination-safety rules.

#### Scenario: Agent renames or moves a note within the vault
- **WHEN** `move_note` is invoked with valid source and destination paths inside the vault root
- **THEN** the system relocates the note, returns the new path, and updates any in-memory semantic state tied to the old path

#### Scenario: Move request escapes the vault root
- **WHEN** `move_note` is invoked with a source or destination path that escapes the vault root
- **THEN** the system rejects the request with a validation error and leaves vault state unchanged

### Requirement: Direct Semantic Index Status Inspection
The system SHALL expose semantic indexing status through a dedicated read tool so clients can inspect readiness without issuing a search.

#### Scenario: Agent requests current index state
- **WHEN** `get_index_status` is invoked
- **THEN** the system returns machine-readable index status including readiness flags, counts, and a bounded sample of pending paths when available

#### Scenario: Pending queue is larger than the sample limit
- **WHEN** `get_index_status` is invoked while more items are pending than the configured sample limit
- **THEN** the response includes only the bounded sample and preserves the full pending count separately
