## ADDED Requirements

### Requirement: Capability Classification Across Tools, Resources, and Prompts
The system SHALL classify MCP exposure by intent: side-effecting operations as Tools, read-only context as Resources, and reusable workflow entrypoints as Prompts.

#### Scenario: New capability is introduced
- **WHEN** a new user-facing capability is added to the bridge
- **THEN** maintainers assign it to Tool, Resource, or Prompt based on intent and document the rationale in registration code

### Requirement: Strict Tool Input Schema
Every tool SHALL define input with `z.object()` and MUST avoid unbounded payload types for core fields.

#### Scenario: Tool includes enumerated behavior options
- **WHEN** a tool accepts finite operation modes or statuses
- **THEN** the schema uses explicit enum constraints instead of arbitrary string values

#### Scenario: Tool includes result-size control
- **WHEN** a tool supports limiting returned items
- **THEN** the schema includes bounded numeric constraints and a safe default limit

### Requirement: Annotation Policy for Tool Behavior
Tool registrations SHALL include MCP annotations consistent with operation risk and behavior.

#### Scenario: Read-only operation is registered
- **WHEN** a tool does not mutate external state
- **THEN** it is registered with `readOnlyHint: true`

#### Scenario: Destructive operation is registered
- **WHEN** a tool can irreversibly remove data
- **THEN** it is registered with `destructiveHint: true` and includes explicit confirmation guidance in description

### Requirement: Structured and Recoverable Tool Results
Tool handlers SHALL return both human-readable `content` and machine-readable `structuredContent`, and recoverable failures MUST be returned as tool errors (`isError: true`) rather than uncaught exceptions.

#### Scenario: Domain validation fails
- **WHEN** a tool request fails business validation
- **THEN** the handler returns `isError: true` with actionable text and structured error metadata

#### Scenario: Successful semantic search
- **WHEN** semantic search completes successfully
- **THEN** the handler returns summary text and structured results including identifiers and scores

### Requirement: STDIO-Safe Logging in Bridge Runtime
The bridge runtime MUST avoid stdout debug logging that could corrupt MCP framing and SHALL direct diagnostics to stderr.

#### Scenario: Runtime emits diagnostic message
- **WHEN** the bridge logs operational diagnostics
- **THEN** logs are emitted to stderr or a dedicated logger sink without writing non-protocol text to stdout
