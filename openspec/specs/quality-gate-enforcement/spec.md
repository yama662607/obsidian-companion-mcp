# quality-gate-enforcement Specification

## Purpose
TBD - created by archiving change detailed-execution-plan. Update Purpose after archive.
## Requirements
### Requirement: Mandatory Schema and Annotation Compliance
The quality gate SHALL require all tools to satisfy strict schema policy and annotation policy before phase completion.

#### Scenario: Tool registration is validated
- **WHEN** a tool is checked in CI or local gate execution
- **THEN** the gate verifies strict input schema usage and required annotations for operation type

### Requirement: Contract Integrity Verification
The quality gate SHALL verify bridge-plugin contract behavior for handshake, compatibility, and error envelope conformance.

#### Scenario: Transport contract check runs
- **WHEN** contract tests are executed
- **THEN** handshake, version compatibility, and error shape checks must pass for gate completion

### Requirement: Regression Coverage for Critical Flows
The quality gate MUST include regression tests for editor context, semantic search outputs, and fallback operation behavior.

#### Scenario: Release candidate is evaluated
- **WHEN** release readiness is assessed
- **THEN** critical regression suites must pass before candidate approval

### Requirement: Check Command Enforcement
The quality gate SHALL require `just check` success (and `just fix` plus re-check when needed) prior to release sign-off.

#### Scenario: Release sign-off requested
- **WHEN** a release decision is requested
- **THEN** the latest gate record includes successful check command evidence

### Requirement: Final Tool Surface Contract Validation
Release validation SHALL verify that only the final public tool names are registered and that removed legacy tools are absent from the MCP surface.

#### Scenario: Tool surface is validated before release
- **WHEN** quality gates inspect the registered MCP tools for a release candidate
- **THEN** the validation fails if removed legacy tool names remain or if expected final tool names are missing

### Requirement: Output Schema and Workflow Handoff Validation
Release validation SHALL verify that public tools publish output schemas and that read tools expose machine-readable handoff objects required for follow-up edits.

#### Scenario: Read and edit contracts are checked
- **WHEN** quality gates inspect the redesigned read and edit tools
- **THEN** validation fails if `read_note`, `read_active_context`, or `edit_note` lack output schemas or omit the structured handoff fields needed by the workflow

### Requirement: Tool Documentation Coverage
Release validation SHALL require `docs/mcp` to document the final public tool surface comprehensively enough that maintainers can compare tool registrations against the intended contract.

#### Scenario: MCP documentation is reviewed for a release candidate
- **WHEN** the release candidate is evaluated
- **THEN** validation fails if the final public tools are not all covered by `docs/mcp` reference documentation

