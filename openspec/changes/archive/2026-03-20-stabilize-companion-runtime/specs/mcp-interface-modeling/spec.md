## MODIFIED Requirements

### Requirement: Intent-Aligned Interface Boundaries
Tool interfaces SHALL maintain single-responsibility input contracts, especially for destructive operations, and MUST reject irrelevant parameters deterministically.

#### Scenario: Destructive tool receives extraneous fields
- **WHEN** `delete_note` is invoked with unrelated fields that do not belong to delete semantics
- **THEN** the system either ignores fields under explicit compatibility mode or rejects them with structured validation error per migration policy

### Requirement: Structured Validation and Error Signaling
The MCP surface SHALL provide consistent structured errors for contract violations so clients can remediate requests automatically.

#### Scenario: Tool input contract violation
- **WHEN** any tool request violates schema or semantic constraints
- **THEN** response includes stable error code, human-readable message, and machine-readable details identifying invalid fields
