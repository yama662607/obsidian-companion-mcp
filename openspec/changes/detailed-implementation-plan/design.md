## Context

The repository already defines a hybrid architecture: an Obsidian plugin performs persistent operations (indexing, embeddings, editor context), and a thin Node.js bridge exposes MCP over stdio. This design refines that architecture using MCP TypeScript best practices from the reference set (`tool-design`, `implementation-patterns`, `resources-prompts`, `testing`).

Primary constraints:
- Node.js >= 20, TypeScript for bridge and plugin.
- Bridge stdio must remain protocol-safe (no non-protocol stdout logs).
- Localhost-only plugin transport with API key authentication.
- Read-only context should be modeled as Resources where possible.
- Tool interfaces must use strict Zod schemas and explicit annotations.
- Plugin operations must not degrade Obsidian UI responsiveness.

Stakeholders:
- End users: require low-latency, context-aware editing and predictable failure modes.
- Agent clients: require stable tool semantics, structured outputs, and clear capability boundaries.
- Maintainers: require testable architecture, low coupling, and safe rollout/rollback.

## Goals / Non-Goals

**Goals:**
- Establish a production-ready bridge/plugin contract with explicit request/response/error semantics.
- Enforce intent-based MCP surface design: Tools for side effects, Resources for read-only context, Prompts for reusable workflows.
- Deliver deterministic editor-context read/write behavior against unsaved editor state.
- Deliver semantic indexing/search with bounded resource usage and measurable quality.
- Preserve minimum functionality through bridge fallback when plugin is unavailable.
- Make implementation test-first and verifiable at module, contract, and scenario levels.

**Non-Goals:**
- Implement visual diagram editing (handled by sibling project `obsidian-excalidraw-mcp`).
- Introduce cloud-only dependency requirements for core flows.
- Define final model/provider benchmarking methodology beyond baseline acceptance criteria.
- Create catch-all mega-tools that multiplex unrelated actions.

## Decisions

### 1) Keep hybrid runtime boundaries
Plugin handles Obsidian-coupled, long-lived work; bridge handles MCP transport and surface composition.

### 2) Use localhost WebSocket + JSON-RPC for plugin transport
This provides low-latency request/response, correlation IDs, and compatibility with future event notifications.

### 3) Enforce explicit capability classification
Every user-facing capability is first classified as Tool, Resource, or Prompt before implementation.

### 4) Keep transport layer thin and domain layer thick
Registration files adapt MCP input/output only; business rules remain in domain services.

### 5) Standardize strict schema and output policy
All tool input is strict Zod (`z.object`, enum constraints, bounded numeric fields), and all successful outputs return text plus structured content.

### 6) Return recoverable failures as tool results
Recoverable business failures return `isError: true` payloads instead of protocol-breaking uncaught throws.

### 7) Enforce annotation policy
Read-only tools set `readOnlyHint: true`, destructive tools set `destructiveHint: true`, and idempotent transformations set `idempotentHint: true` where valid.

### 8) Make bridge logging stdio-safe
No `console.log` in bridge runtime paths; diagnostics are written to stderr.

### 9) Index asynchronously with bounded concurrency
Incremental, mtime-aware indexing and bounded queues avoid UI stalls.

## Detailed Architecture

### Bridge module layout

```
bridge/src/
	server.ts
	tools/
		semanticSearch.ts
		updateEditor.ts
		manageNote.ts
		manageMetadata.ts
	resources/
		capabilityMatrix.ts
		schemas.ts
		fallbackGuide.ts
	prompts/
		contextRewrite.ts
		searchThenInsert.ts
	domain/
		editorService.ts
		semanticService.ts
		noteService.ts
	infra/
		pluginClient.ts
		fallbackStorage.ts
		logger.ts
	schemas/
		common.ts
		semantic.ts
		editor.ts
		notes.ts
```

Rules:
- `server.ts` composes and registers only.
- `tools/` parse validated input and call domain services.
- `resources/` expose read-only context documents and metadata.
- `prompts/` provide workflow scaffolds without business side effects.
- `domain/` contains use-case logic and policy.
- `infra/` contains plugin transport, storage, and runtime dependencies.

### Plugin module responsibilities

Plugin exposes authenticated JSON-RPC methods:
- `health.ping`
- `editor.getContext`
- `editor.applyCommand`
- `semantic.search`
- `notes.read|create|update|delete`
- `metadata.update`

Plugin internal services:
- editor adapter (active markdown view, cursor, selection, unsaved content)
- indexing queue (mtime-based change detection)
- embedding provider abstraction (local-first default)
- persistence adapter for vectors and metadata

### MCP surface design

Tools (side effects or operational execution):
- `semantic_search`
- `insert_at_cursor`
- `replace_range`
- `manage_note`
- `manage_metadata`

Resources (read-only context):
- `capability://matrix`
- `schema://tool-inputs`
- `fallback://behavior`
- `context://active-editor` (read-only snapshot)

Prompts (workflow templates):
- `workflow_context_rewrite`
- `workflow_search_then_insert`

## Contracts and Data Model

### Bridge to plugin JSON-RPC envelope

Request fields:
- `id`
- `jsonrpc`
- `method`
- `params`
- `protocolVersion`

Response success fields:
- `id`
- `result`
- `protocolVersion`

Response error fields:
- `id`
- `error.code`
- `error.message`
- `error.data.correlationId`

### Tool input schema policy

- All tool schemas are `z.object({...})`.
- Enumerated behavior is encoded with `z.enum` or discriminated union.
- List-size or result-size controls must include min/max/default.
- Shared fields live in `schemas/common.ts` and are spread into per-tool schemas.

### Tool output policy

Success shape:
- `content`: human-readable short summary
- `structuredContent`: deterministic machine payload

Recoverable failure shape:
- `isError: true`
- `content`: actionable text
- `structuredContent`: stable error metadata (code, category, correlationId)

## Error Handling Strategy

- Domain layer uses typed error classes (`VALIDATION`, `NOT_FOUND`, `CONFLICT`, `UNAVAILABLE`, `INTERNAL`).
- Bridge maps plugin transport and domain errors into MCP-safe tool results.
- Uncaught exceptions are treated as internal failures and returned with correlation IDs.
- Fallback trigger conditions are explicit: auth failure is hard error, connectivity timeout is degraded-mode candidate.

## Verification Strategy

### Unit tests
- Domain services for editor operations, note operations, and fallback policies.
- Zod schemas for valid/invalid payload cases.

### Registration tests
- Mock `McpServer` and assert exact tool/resource/prompt names.
- Assert annotation policy (`readOnlyHint`, `destructiveHint`, `idempotentHint`).

### Contract tests
- Bridge-plugin handshake, version compatibility, auth rejection, and error envelope conformance.
- `structuredContent` shape snapshots for critical tools.

### Regression tests
- No-active-editor scenarios.
- Invalid range write attempts.
- Large vault semantic query behavior.
- Multilingual content handling.

### Quality gates
- Business logic coverage target >= 90%.
- Registration and annotation checks at 100% expected surface.
- Required commands before merge: `just check`, and if needed `just fix` then `just check`.

## Risks / Trade-offs

- [Protocol mismatch between bridge and plugin versions] -> Mitigation: include protocol version field and compatibility check at connect time.
- [Obsidian UI jank during embedding generation] -> Mitigation: worker-based execution, queue throttling, and max concurrent jobs.
- [Fallback behavior diverges from plugin behavior] -> Mitigation: shared response schema and explicit capability flags in bridge.
- [Authentication key leakage in logs] -> Mitigation: redact sensitive fields and avoid printing auth material.
- [Cross-platform socket/connectivity instability] -> Mitigation: startup health checks, retry backoff, and actionable error mapping.
- [Tool surface grows into ambiguous mega-tools] -> Mitigation: enforce intent-based naming and one-tool-one-responsibility review checklist.
- [Invalid schema design weakens tool safety] -> Mitigation: lint/test rules for required `z.object`, enum usage, and bounded limit fields.
- [JSON-RPC corruption from stdout logs] -> Mitigation: ban `console.log` in bridge runtime and test transport framing.

## Migration Plan

1. Phase 0: Scaffold bridge and plugin service boundaries, introduce protocol type definitions.
2. Phase 1: Implement MCP surface skeleton (`server.ts`, `tools/`, `resources/`, `prompts/`, `domain/`, `infra/`, `schemas/`).
3. Phase 2: Implement authenticated handshake + `health.ping` with compatibility metadata.
4. Phase 3: Implement resource endpoints and read-only tool/resource boundary checks.
5. Phase 4: Implement editor read/write operations with range validation and structured outputs.
6. Phase 5: Implement semantic indexing/search and note/metadata tools with fallback.
7. Phase 6: Implement prompt templates and wire them to documented tool/resource flows.
8. Phase 7: Execute verification suite (registration, schema policy, annotation policy, contract, regression), then release.

Rollback strategy:
- Feature-flag each capability area in bridge tool registration.
- If plugin communication regresses, disable affected live-context tools while retaining file-based fallback operations.

## Open Questions

- Should v1 ship WebSocket-only transport, or include HTTP compatibility from day one?
- Which vector backend is preferred for v1 (`lancedb`, SQLite extension, or in-memory MVP)?
- What SLO targets are required for editor command latency and semantic query latency?
- How should multi-vault identity and index isolation be encoded in storage keys?
- Which resources are mandatory in v1 versus optional (`capability://matrix`, `schema://tool-inputs`, `fallback://behavior`)?
- What acceptance criteria should gate new prompt additions to avoid prompt sprawl?
