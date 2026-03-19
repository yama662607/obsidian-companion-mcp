## ADDED Requirements

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
