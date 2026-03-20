## MODIFIED Requirements

### Requirement: Incremental Background Indexing
The system SHALL perform metadata-driven incremental indexing based on note modification state, MUST avoid re-reading and re-embedding unchanged notes during explicit refresh, and SHALL expose queued-versus-complete progress accurately while reconciling stale entries.

#### Scenario: Refresh tool runs against a large vault
- **WHEN** `refresh_semantic_index` is invoked for a vault with many indexed notes
- **THEN** the system performs a metadata-first reconciliation pass before any embedding work is scheduled
- **AND** it reports how many notes were scanned, skipped as unchanged, queued for re-indexing, flushed, and removed as stale entries

#### Scenario: Note changes after initial index
- **WHEN** a note's stored semantic metadata no longer matches the current vault metadata
- **THEN** the indexing pipeline reads that note body, regenerates embeddings only for that changed note, and preserves unchanged note entries

#### Scenario: Note is deleted outside the note lifecycle tools
- **WHEN** refresh finds an indexed path that no longer exists in the vault
- **THEN** the system removes the stale semantic entry during reconciliation and excludes it from later search results
