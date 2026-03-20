## ADDED Requirements

### Requirement: Metadata-First Refresh Reconciliation
The system SHALL execute `refresh_semantic_index` through a metadata-first reconciliation pass that identifies changed, unchanged, and deleted notes before reading note bodies for embedding work.

#### Scenario: Large vault refresh has only a few changed notes
- **WHEN** `refresh_semantic_index` is invoked for a vault where most indexed notes are unchanged
- **THEN** the system compares current vault metadata against stored semantic metadata first
- **AND** it reads full note bodies only for notes whose semantic state is stale or missing

#### Scenario: Refresh encounters notes deleted outside MCP tools
- **WHEN** semantic state contains note paths that are no longer present in the current vault listing
- **THEN** the refresh reconciliation removes those stale semantic entries before reporting completion

### Requirement: Refresh Reconciliation Reporting
The system SHALL report reconciliation-oriented counters so clients can distinguish scanned, skipped, queued, flushed, and removed work during explicit refresh.

#### Scenario: Refresh completes with mostly skipped notes
- **WHEN** `refresh_semantic_index` completes after scanning a vault with few changed notes
- **THEN** the response includes machine-readable counts for scanned notes, unchanged/skipped notes, queued notes, flushed notes, and removed stale entries

#### Scenario: Client inspects status after reconciliation
- **WHEN** `get_semantic_index_status` is invoked after a refresh
- **THEN** the status response includes enough machine-readable counters to explain whether the index is fully reconciled with the current vault contents
