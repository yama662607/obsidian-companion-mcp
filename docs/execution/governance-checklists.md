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
- [ ] Search tools return bounded candidate payloads instead of full document bodies.
- [ ] Read tools return follow-up handoff objects needed for the next edit step.
- [ ] Write tools return enough read-back / revision / warning metadata to continue the workflow safely.
- [ ] `degradedReason` is machine-readable and specific enough for diagnosis.
- [ ] Legacy data and fallback paths are covered by tests.
- [ ] Text-only clients remain usable even if `structuredContent` is not surfaced.

## Tool Surface Hardening Checklist

- [ ] Primary workflow is explicit (`search -> read -> edit` or equivalent).
- [ ] Each step can be completed without requiring out-of-band reconstruction by the agent.
- [ ] Nested object inputs are compatible with at least one non-ideal client path (for example JSON-stringified objects).
- [ ] Result payloads remain bounded under large vault / large note / legacy index conditions.
- [ ] Refresh / rebuild style tool names match their actual completion semantics.
- [ ] Plugin failure reasons are not collapsed into a single generic degraded reason.

## Test Strategy Checklist

- [ ] Pure unit coverage exists for anchor resolution, text replacement, revision comparison, and pagination/truncation boundaries.
- [ ] Contract tests verify tool names, input schemas, output schemas, and annotations.
- [ ] Compatibility tests cover text-only clients, JSON-stringified nested arguments, and legacy persisted state.
- [ ] Isolated E2E covers plugin-backed success and fallback success cases.
- [ ] Real-agent review has been run against the published tool surface before release.

See also: [MCP Tool Surface Hardening Playbook](/Users/daisukeyamashiki/Code/Projects/obsidian-companion-mcp/docs/execution/tool-surface-hardening-playbook.md)

## Ownership-Based Approval Routing (Task 3.3)

- MCP-only change: MCP Owner + Reviewer approval.
- Plugin-only change: Plugin Owner + Reviewer approval.
- Cross-module change: MCP Owner + Plugin Owner + Integration Lead.
- Release-impacting change: Release Owner approval required.

Disagreement policy:
- Integration Lead mediates technical disagreement.
- Release Owner makes final go/no-go decision if unresolved.
