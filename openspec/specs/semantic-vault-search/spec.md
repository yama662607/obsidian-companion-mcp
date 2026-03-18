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
The system SHALL expose semantic search with query text and limit parameters and MUST return ranked matches as lightweight search summaries rather than full note bodies.

#### Scenario: User submits semantic query
- **WHEN** a semantic query is executed with `query` and `limit`
- **THEN** the system returns up to `limit` ranked matches containing note identifier, relevance score, and a bounded excerpt suitable for deciding whether to call `get_note`

#### Scenario: Search result payload would otherwise include full note content
- **WHEN** a semantic match originates from a large note body
- **THEN** the response includes only the bounded excerpt or summary field needed for discovery and omits the full note content from search results

### Requirement: Resource-Safe Embedding Execution
The system SHALL execute embedding generation asynchronously and MUST bound concurrency to prevent editor responsiveness degradation.

#### Scenario: Large vault indexing workload
- **WHEN** indexing is triggered for a large set of notes
- **THEN** the system processes jobs through a bounded queue and keeps the UI responsive under configured thresholds
