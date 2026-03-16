## ADDED Requirements

### Requirement: Real-App MCP End-to-End Validation
Before release approval, the system SHALL pass end-to-end validation using a real Obsidian application runtime and configured MCP agent process.

#### Scenario: Pre-release E2E run is executed
- **WHEN** release candidate validation starts
- **THEN** operators execute a documented scenario covering bridge startup, active editor operations, note/metadata round-trip, and semantic search using real Obsidian runtime

### Requirement: Dual-MCP Coexistence Verification
The release process SHALL verify Companion MCP can coexist with at least one additional MCP server in the same agent environment without regression in core capabilities.

#### Scenario: Companion and secondary MCP server run together
- **WHEN** agent is configured with Companion MCP and another server (for example Excalidraw MCP)
- **THEN** test evidence confirms tool invocation isolation, expected responses, and no cross-server interference

### Requirement: Go/No-Go Gate Criteria
Release decision SHALL be based on explicit go/no-go criteria linked to severity-classified findings from E2E validation.

#### Scenario: Critical E2E defect is found
- **WHEN** a severity-high defect is confirmed during validation
- **THEN** release is blocked until mitigation is implemented and validation is re-run with recorded pass evidence
