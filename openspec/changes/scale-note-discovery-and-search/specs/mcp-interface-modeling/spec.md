## MODIFIED Requirements

### Requirement: Strict Tool Input Schema
Every tool SHALL define input with `z.object()` and MUST avoid unbounded payload types for core fields. Tools operating on potentially large collections SHALL define bounded result controls and deterministic continuation semantics.

#### Scenario: Tool includes result-size control
- **WHEN** a tool supports limiting returned items
- **THEN** the schema includes bounded numeric constraints, a safe default limit, and any continuation token or cursor fields required for deterministic follow-up requests

### Requirement: Structured and Recoverable Tool Results
Tool handlers SHALL return both human-readable `content` and machine-readable `structuredContent`, and recoverable failures MUST be returned as tool errors (`isError: true`) rather than uncaught exceptions. Successful responses SHALL align payload size with the tool's primary intent.

#### Scenario: Successful semantic search
- **WHEN** semantic search completes successfully
- **THEN** the handler returns summary text and structured results including identifiers, scores, and lightweight discovery-oriented excerpts rather than full note bodies

#### Scenario: Successful mutation tool call
- **WHEN** an editor or note mutation tool completes successfully
- **THEN** the handler returns confirmation-oriented structured data needed to continue the workflow without forcing a full document payload unless the tool is explicitly a read operation
