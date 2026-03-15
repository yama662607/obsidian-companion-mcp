## ADDED Requirements

### Requirement: Incremental Background Indexing
The system SHALL perform incremental indexing based on note modification state and MUST avoid full reindex unless explicitly requested.

#### Scenario: Note changes after initial index
- **WHEN** a note's modification timestamp differs from indexed metadata
- **THEN** the indexing pipeline updates embeddings only for changed notes and preserves unchanged entries

### Requirement: Semantic Query Interface
The system SHALL expose semantic search with query text and limit parameters and MUST return ranked results with score and snippet information.

#### Scenario: User submits semantic query
- **WHEN** a semantic query is executed with `query` and `limit`
- **THEN** the system returns up to `limit` ranked matches containing note identifier, relevance score, and snippet context

### Requirement: Resource-Safe Embedding Execution
The system SHALL execute embedding generation asynchronously and MUST bound concurrency to prevent editor responsiveness degradation.

#### Scenario: Large vault indexing workload
- **WHEN** indexing is triggered for a large set of notes
- **THEN** the system processes jobs through a bounded queue and keeps the UI responsive under configured thresholds
