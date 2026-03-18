# mcp-interface-modeling Specification

## Purpose
TBD - created by archiving change detailed-implementation-plan. Update Purpose after archive.
## Requirements
### Requirement: Capability Classification Across Tools, Resources, and Prompts
The system SHALL classify MCP exposure by intent: side-effecting operations as Tools, read-only context as Resources, and reusable workflow entrypoints as Prompts.

#### Scenario: New capability is introduced
- **WHEN** a new user-facing capability is added to the bridge
- **THEN** maintainers assign it to Tool, Resource, or Prompt based on intent and document the rationale in registration code

### Requirement: Strict Tool Input Schema
Every tool SHALL define input with `z.object()` and MUST avoid unbounded payload types for core fields. Tools operating on potentially large collections SHALL define bounded result controls and deterministic continuation semantics.

#### Scenario: Tool includes enumerated behavior options
- **WHEN** a tool accepts finite operation modes or statuses
- **THEN** the schema uses explicit enum constraints instead of arbitrary string values

#### Scenario: Tool includes result-size control
- **WHEN** a tool supports limiting returned items
- **THEN** the schema includes bounded numeric constraints, a safe default limit, and any continuation token or cursor fields required for deterministic follow-up requests

### Requirement: Annotation Policy for Tool Behavior
Tool registrations SHALL include MCP annotations consistent with operation risk and behavior.

#### Scenario: Read-only operation is registered
- **WHEN** a tool does not mutate external state
- **THEN** it is registered with `readOnlyHint: true`

#### Scenario: Destructive operation is registered
- **WHEN** a tool can irreversibly remove data
- **THEN** it is registered with `destructiveHint: true` and includes explicit confirmation guidance in description

### Requirement: Structured and Recoverable Tool Results
Tool handlers SHALL return both human-readable `content` and machine-readable `structuredContent`, and recoverable failures MUST be returned as tool errors (`isError: true`) rather than uncaught exceptions. Successful responses SHALL align payload size with the tool's primary intent.

#### Scenario: Domain validation fails
- **WHEN** a tool request fails business validation
- **THEN** the handler returns `isError: true` with actionable text and structured error metadata

#### Scenario: Successful semantic search
- **WHEN** semantic search completes successfully
- **THEN** the handler returns summary text and structured results including identifiers, scores, and lightweight discovery-oriented excerpts rather than full note bodies

#### Scenario: Successful mutation tool call
- **WHEN** an editor or note mutation tool completes successfully
- **THEN** the handler returns confirmation-oriented structured data needed to continue the workflow without forcing a full document payload unless the tool is explicitly a read operation

### Requirement: STDIO-Safe Logging in Bridge Runtime
The bridge runtime MUST avoid stdout debug logging that could corrupt MCP framing and SHALL direct diagnostics to stderr.

#### Scenario: Runtime emits diagnostic message
- **WHEN** the bridge logs operational diagnostics
- **THEN** logs are emitted to stderr or a dedicated logger sink without writing non-protocol text to stdout
