# semantic-vault-search Specification

## Purpose
TBD - created by archiving change detailed-implementation-plan. Update Purpose after archive.
## Requirements
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

### Requirement: Semantic Query Interface
The system SHALL expose semantic search through `semantic_search_notes` and MUST return ranked chunk-level matches as lightweight discovery summaries rather than full note bodies. Responses MUST include enough anchor and follow-up metadata to route directly into `read_note`.

#### Scenario: User submits semantic query
- **WHEN** a semantic query is executed with `query` and bounded result controls
- **THEN** the system returns ranked chunk-oriented matches containing note identity, score, bounded excerpt text, and a read hint for follow-up retrieval

#### Scenario: Search result payload would otherwise include full note content
- **WHEN** a semantic match originates from a large note body
- **THEN** the response includes only the bounded excerpt or chunk summary needed for discovery and omits the full note content from search results

### Requirement: Resource-Safe Embedding Execution
The system SHALL execute embedding generation asynchronously and MUST bound concurrency to prevent editor responsiveness degradation.

#### Scenario: Large vault indexing workload
- **WHEN** indexing is triggered for a large set of notes
- **THEN** the system processes jobs through a bounded queue and keeps the UI responsive under configured thresholds

### Requirement: Lexical Search Interface
The system SHALL expose `search_notes` for exact, lexical, and metadata-driven note discovery and MUST return note-level results that can be followed by `read_note`.

#### Scenario: User searches by explicit term or filter
- **WHEN** a lexical search is executed with query text, metadata filters, or both
- **THEN** the system returns bounded note-level matches with matched-field metadata, lightweight snippets, and read hints for follow-up retrieval

#### Scenario: Search space exceeds current page size
- **WHEN** lexical search matches exceed the requested or default page limit
- **THEN** the response includes a deterministic cursor and `has_more` metadata for follow-up paging
