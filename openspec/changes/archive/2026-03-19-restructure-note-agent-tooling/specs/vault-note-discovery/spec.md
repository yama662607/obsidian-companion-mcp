## MODIFIED Requirements

### Requirement: Direct Semantic Index Status Inspection
The system SHALL expose semantic indexing status through a dedicated read tool named `get_semantic_index_status` so clients can inspect readiness without issuing a search. The response SHALL describe pending work and machine-readable readiness in terms that remain meaningful for lexical and semantic discovery workflows.

#### Scenario: Agent requests current index state
- **WHEN** `get_semantic_index_status` is invoked
- **THEN** the system returns machine-readable index status including readiness flags, counts, and a bounded sample of pending paths when available

#### Scenario: Pending queue is larger than the sample limit
- **WHEN** `get_semantic_index_status` is invoked while more items are pending than the configured sample limit
- **THEN** the response includes only the bounded sample and preserves the full pending count separately
