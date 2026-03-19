## Context

The current tool surface grew incrementally around separate implementation paths: persisted-note CRUD, active-editor commands, semantic search, and recent discovery tooling. As a result, the public MCP interface now contains overlapping verbs (`get_note`, `update_note_content`, `replace_range`) that target different substrates but present similar editing intent to the model.

This change redesigns the public interface around the actual agent workflow:

1. discover candidate notes
2. read either a persisted note or the active editor state
3. pass a returned edit handle directly into a single editing tool

The codebase already has separate services for note operations, editor operations, discovery, semantic indexing, prompts, and execution gates. The redesign therefore spans multiple modules and requires explicit technical decisions before implementation.

There is no `openspec/project.md` or `openspec/AGENTS.md` in the repository at the time of writing, so this design is grounded in the existing specs, code, tests, and current `docs/mcp` drafts.

## Goals / Non-Goals

**Goals:**
- Establish a final, workflow-oriented MCP tool taxonomy with unambiguous naming.
- Make `read_note` and `read_active_context` return a shared machine-readable edit handoff shape.
- Consolidate full-note replace, active-editor range replace, and targeted note patching into a single `edit_note` contract.
- Introduce explicit `outputSchema` contracts and aligned annotations across the public tool surface.
- Document the final tool contracts under `docs/mcp` for every public tool.
- Preserve the current local-first architecture and degraded-mode behavior wherever possible.

**Non-Goals:**
- Adopting Obsidian Local REST API as a runtime dependency.
- Adding Dataview DQL / JsonLogic query support in this change.
- Adding regex-based replace in v1 of the unified edit tool.
- Redesigning prompts/resources beyond what is required to keep them consistent with the new tool surface.
- Implementing new external persistence or server-side state stores for edit sessions.

## Decisions

### 1. Use one unified `edit_note` tool, but keep two read tools

`read_note` and `read_active_context` remain separate because they observe different sources of truth:
- persisted note state with revision semantics
- active editor state with unsaved buffer, selection, and cursor semantics

However, both tools will return the same `edit_target` shape so the model can transition into editing without re-constructing parameters. This gives the interface simplicity of use without collapsing all read semantics into one overloaded tool.

Alternatives considered:
- Keep two edit tools (`edit_note` + `edit_active_note`): clearer implementation split, but weaker search -> read -> edit handoff and more tool selection burden.
- Collapse reads and edits into one generic content tool: too ambiguous, too much hidden state, and poor fit for MCP tool descriptions and schemas.

### 2. Remove overlapping mutation tools from the public surface

The following current tools will be removed from the public interface:
- `update_note_content`
- `insert_at_cursor`
- `replace_range`

Their behavior will be absorbed into `edit_note`:
- full-document replacement via `target.source = "note"` and `anchor.type = "full"`
- active selection / range / cursor editing via `target.source = "active"`
- exact text replacement via `change.type = "replace_text"`

`create_note`, `move_note`, `delete_note`, and metadata mutation remain separate because they represent different lifecycle intents rather than overlapping edit granularity.

Alternatives considered:
- Keep `update_note_content` as a separate full-replace tool: rejected because the unified `edit_note` can express full replacement cleanly and fewer edit verbs are easier for agents.
- Keep `replace_range` as an active-editor-specialized tool: rejected because unified `edit_target` handoff is the primary UX goal.

### 3. Make target and change both discriminated unions

The unified edit tool will use:
- `target`: discriminated by `source`
- `change`: discriminated by `type`

This avoids one giant flat schema with many partially relevant fields and makes validation deterministic.

Target variants:
- persisted note target
  - `source: "note"`
  - `note`
  - `anchor.type: "full" | "frontmatter" | "heading" | "block" | "line"`
  - `revision?`
  - `current_text?`
- active editor target
  - `source: "active"`
  - `active_file?`
  - `anchor.type: "full" | "selection" | "range" | "cursor"`
  - `range?`
  - `current_text?`

Change variants:
- `replace_target`
- `append`
- `prepend`
- `replace_text`

Alternatives considered:
- A single `operation` enum with many optional fields: rejected because it becomes difficult to understand and validate.
- Opaque string handles only: rejected because transparent structured handles are easier to document, test, and debug.

### 4. Preserve MCP error envelopes for failures instead of folding everything into success status

`edit_note` will return success payload status only for successful or no-op mutations:
- `applied`
- `no_op`

Actual failures remain MCP tool errors:
- `NOT_FOUND`
- `VALIDATION`
- `CONFLICT`
- `UNAVAILABLE`

This aligns with the current domain-error architecture, existing tests, and execution quality gates.

Alternatives considered:
- Put `conflict`, `not_found`, and `invalid_target` into successful output payloads: rejected because it weakens the contract already established in the runtime and quality gates.

### 5. Rename tools to match user intent and workflow position

Final public tool names:
- `list_notes`
- `search_notes`
- `semantic_search_notes`
- `read_note`
- `read_active_context`
- `edit_note`
- `create_note`
- `patch_note_metadata`
- `move_note`
- `delete_note`
- `get_semantic_index_status`
- `refresh_semantic_index`

These names are intentionally grouped by discovery, read, lifecycle, metadata, and maintenance intent.

Alternatives considered:
- Keep `get_*` and `update_*` names: rejected because they hide important distinctions between read, patch, and full edit workflows.
- Rename the unified editor to `edit_markdown` or `edit_content`: rejected because the user-facing workflow is still centered on notes, and `edit_note` remains understandable across persisted and active-note cases.

### 6. Document all tools explicitly in `docs/mcp`

The repository currently has design-heavy drafts for `search.md`, `read.md`, and `edit.md`, but they are incomplete, partially duplicated, and do not cover the final full tool set. This change will treat `docs/mcp` as the final public contract reference and document every tool, not just the core trio.

Planned docs structure:
- `docs/mcp/overview.md`
- `docs/mcp/search.md`
- `docs/mcp/read.md`
- `docs/mcp/edit.md`
- `docs/mcp/manage.md`

This keeps the main workflow grouped while still covering lifecycle and maintenance tools.

## Risks / Trade-offs

- [Large breaking surface] -> Provide a migration section in proposal/docs and update prompts/resources/tests in the same implementation change.
- [Unified edit tool schema becomes too large] -> Keep `target` and `change` as small discriminated unions and rely on read-tool returned `edit_target` objects for common usage.
- [Active editor and persisted note semantics diverge further over time] -> Preserve distinct read tools and keep active-only fields isolated under `target.source = "active"`.
- [Exact text replacement becomes ambiguous on repeated matches] -> Require `occurrence` selection and return `CONFLICT` when a replace target is not uniquely determined.
- [Search docs assume Local REST API mapping that the implementation does not use] -> Rewrite `docs/mcp` around the actual local-first bridge architecture rather than the prior REST-oriented drafts.
- [Current specs do not yet express the unified handoff model] -> Add a new capability for note reading/editing and update adjacent specs in the same proposal.

## Migration Plan

1. Introduce the new spec deltas and final tool docs first.
2. Implement the new public tool surface behind updated constants and registrations.
3. Update prompts, resources, tests, and schema-quality gates to reference only the final tool names.
4. Remove old tool registrations after the new tool contracts and docs are in place.
5. Publish a migration note describing old -> new tool mappings and the shared `edit_target` handoff flow.
6. Validate with strict quality gates, tool-list regression coverage, and end-to-end workflow tests before release.

## Open Questions

- None for proposal stage. The user direction is now sufficient to make the interface redesign decision-complete.
