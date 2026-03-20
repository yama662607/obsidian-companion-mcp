## MODIFIED Requirements

### Requirement: Incremental Indexing and Freshness
The system SHALL keep semantic index freshness aligned with note create/update operations by enqueueing indexing work on successful write paths.

#### Scenario: Note create triggers indexing
- **WHEN** a note is created or updated successfully
- **THEN** indexing work is enqueued for the affected note and search state is advanced toward queryable status

#### Scenario: Search requested while index is pending
- **WHEN** semantic search is invoked before queued indexing has completed
- **THEN** the response includes explicit index state metadata (for example pending count or status) instead of only opaque empty results

### Requirement: Deterministic Semantic Query Responses
Semantic query responses SHALL include status signals that let clients distinguish between "no matches" and "index not ready" conditions.

#### Scenario: No semantic matches after completed indexing
- **WHEN** indexing is complete and no documents satisfy query criteria
- **THEN** the response returns empty results with ready-state indicator confirming index availability
