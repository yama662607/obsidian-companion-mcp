# Execution Governance Checklists

## MCP Interface Classification Checklist (Task 3.1)

For each new MCP entrypoint, answer in order:

- [ ] Is this side-effecting execution? If yes, classify as Tool.
- [ ] Is this read-only context? If yes, classify as Resource.
- [ ] Is this a repeatable workflow scaffold? If yes, classify as Prompt.
- [ ] If classification is unclear, proposal/design update is required before implementation.

## Review Checklist (Task 3.2)

- [ ] Tool name follows intent-oriented naming.
- [ ] One tool has one responsibility.
- [ ] Input schema uses strict `z.object` (no unbounded `z.any` payloads).
- [ ] `limit` style fields are bounded.
- [ ] Output includes both text summary and structured data when applicable.

## Ownership-Based Approval Routing (Task 3.3)

- MCP-only change: MCP Owner + Reviewer approval.
- Plugin-only change: Plugin Owner + Reviewer approval.
- Cross-module change: MCP Owner + Plugin Owner + Integration Lead.
- Release-impacting change: Release Owner approval required.

Disagreement policy:
- Integration Lead mediates technical disagreement.
- Release Owner makes final go/no-go decision if unresolved.
