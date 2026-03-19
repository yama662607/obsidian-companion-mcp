## MODIFIED Requirements

### Requirement: Capability Classification Across Tools, Resources, and Prompts
The system SHALL classify MCP exposure by workflow intent: discovery and editing actions as Tools, read-only machine context as Resources, and reusable workflow entrypoints as Prompts. Public tool naming SHALL reflect workflow stage and target clearly enough that agents can distinguish discovery, read, lifecycle, metadata, and edit operations without inferring implementation details.

#### Scenario: New workflow-oriented capability is introduced
- **WHEN** a new user-facing capability is added to the bridge
- **THEN** maintainers assign it to Tool, Resource, or Prompt based on intent and document the rationale in registration code using names aligned to discovery, read, lifecycle, metadata, or edit workflows

### Requirement: Strict Tool Input Schema
Every tool SHALL define input with `z.object()` and MUST avoid unbounded payload types for core fields. Tools operating on potentially large collections SHALL define bounded result controls and deterministic continuation semantics. Tools using polymorphic targets or changes SHALL express them as explicit discriminated unions rather than implicit optional-field combinations.

#### Scenario: Tool includes enumerated behavior options
- **WHEN** a tool accepts finite operation modes or statuses
- **THEN** the schema uses explicit enum constraints instead of arbitrary string values

#### Scenario: Tool includes result-size control
- **WHEN** a tool supports limiting returned items
- **THEN** the schema includes bounded numeric constraints, a safe default limit, and any continuation token or cursor fields required for deterministic follow-up requests

#### Scenario: Tool supports multiple target sources
- **WHEN** a tool accepts persisted-note and active-editor targets through one contract
- **THEN** the schema models those target variants through explicit discriminators and variant-specific required fields

### Requirement: Structured and Recoverable Tool Results
Tool handlers SHALL return both human-readable `content` and machine-readable `structuredContent`, recoverable failures MUST be returned as tool errors (`isError: true`) rather than uncaught exceptions, and public tools SHALL publish `outputSchema` definitions that match their structured results. Successful responses SHALL align payload size with the tool's primary intent and include workflow handoff objects when follow-up actions are expected.

#### Scenario: Domain validation fails
- **WHEN** a tool request fails business validation
- **THEN** the handler returns `isError: true` with actionable text and structured error metadata

#### Scenario: Successful semantic search
- **WHEN** semantic search completes successfully
- **THEN** the handler returns summary text and structured results including identifiers, scores, and lightweight discovery-oriented excerpts rather than full note bodies

#### Scenario: Successful mutation tool call
- **WHEN** a persisted-note or active-editor mutation completes successfully
- **THEN** the handler returns confirmation-oriented structured data, bounded previews where relevant, and any read-back or edit-handoff metadata needed to continue the workflow without forcing a full document payload
