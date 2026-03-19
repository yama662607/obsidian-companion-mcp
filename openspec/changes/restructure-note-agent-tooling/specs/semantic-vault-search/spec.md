## MODIFIED Requirements

### Requirement: Semantic Query Interface
The system SHALL expose semantic search through `semantic_search_notes` and MUST return ranked chunk-level matches as lightweight discovery summaries rather than full note bodies. Responses MUST include enough anchor and follow-up metadata to route directly into `read_note`.

#### Scenario: User submits semantic query
- **WHEN** a semantic query is executed with `query` and bounded result controls
- **THEN** the system returns ranked chunk-oriented matches containing note identity, score, bounded excerpt text, and a read hint for follow-up retrieval

#### Scenario: Search result payload would otherwise include full note content
- **WHEN** a semantic match originates from a large note body
- **THEN** the response includes only the bounded excerpt or chunk summary needed for discovery and omits the full note content from search results

## ADDED Requirements

### Requirement: Lexical Search Interface
The system SHALL expose `search_notes` for exact, lexical, and metadata-driven note discovery and MUST return note-level results that can be followed by `read_note`.

#### Scenario: User searches by explicit term or filter
- **WHEN** a lexical search is executed with query text, metadata filters, or both
- **THEN** the system returns bounded note-level matches with matched-field metadata, lightweight snippets, and read hints for follow-up retrieval

#### Scenario: Search space exceeds current page size
- **WHEN** lexical search matches exceed the requested or default page limit
- **THEN** the response includes a deterministic cursor and `has_more` metadata for follow-up paging
