# semantic-vault-search Specification

## Purpose
TBD - created by archiving change detailed-implementation-plan. Update Purpose after archive.
## Requirements
### Requirement: Incremental Background Indexing
The system SHALL perform incremental indexing based on note modification state, MUST avoid full reindex unless explicitly requested, and SHALL expose queued-versus-complete progress accurately.

#### Scenario: Refresh tool queues work for a large vault
- **WHEN** `refresh_semantic_index` is invoked for a vault with many notes to index
- **THEN** the response reports queued and immediately flushed work accurately instead of implying that a full rebuild has already completed

#### Scenario: Note changes after initial index
- **WHEN** a note's modification timestamp differs from indexed metadata
- **THEN** the indexing pipeline updates embeddings only for changed notes and preserves unchanged entries

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

