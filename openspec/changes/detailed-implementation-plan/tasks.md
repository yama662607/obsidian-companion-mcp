## 1. MCP Interface Architecture Baseline

- [ ] 1.1 Create bridge structure: `src/server.ts`, `src/tools/`, `src/resources/`, `src/prompts/`, `src/domain/`, `src/infra/`, `src/schemas/`
- [ ] 1.2 Implement registration-only composition in `server.ts` and move operational logic out of registration callbacks
- [ ] 1.3 Define and document intent-based classification rules for Tools, Resources, and Prompts

## 2. Shared Contracts and Transport

- [ ] 2.1 Define shared protocol types (request/response/error/version/correlation) in a contract module used by plugin and bridge
- [ ] 2.2 Implement plugin-side localhost JSON-RPC host with API key auth middleware and handshake metadata
- [ ] 2.3 Implement bridge transport client with compatibility checks, retry/backoff, and degraded-mode state transitions

## 3. Tool Schema and Annotation Policy

- [ ] 3.1 Define Zod schemas with `z.object()` for all tools, including enum-constrained options and bounded `limit` fields
- [ ] 3.2 Register read-only tools with `readOnlyHint: true` and destructive tools with `destructiveHint: true` where required
- [ ] 3.3 Add helper enforcement (lint/test) to reject unbounded payload patterns (`z.any`, unrestricted records) in core tool inputs

## 4. Resource and Prompt Surface

- [ ] 4.1 Implement read-only Resources for capability metadata, schema summaries, and fallback behavior guidance
- [ ] 4.2 Implement Prompts for repeat workflows (context-aware rewrite, search-then-insert) without embedding side-effect logic
- [ ] 4.3 Validate that Prompts reduce repetitive user instruction while Tools remain single-responsibility

## 5. Editor Context and Command Tools

- [ ] 5.1 Implement plugin methods for active file, cursor, selection, and unsaved content retrieval
- [ ] 5.2 Implement plugin editor commands (`insertText`/`replaceRange`) with strict position/range validation
- [ ] 5.3 Implement bridge handlers returning both text summary and `structuredContent` for context and command outcomes

## 6. Semantic Search and Note Operations

- [ ] 6.1 Implement incremental indexing queue and local-first embedding provider abstraction
- [ ] 6.2 Implement `semantic_search` tool with bounded limit, ranking metadata, and deterministic structured result shape
- [ ] 6.3 Implement note CRUD and metadata update tools with validation-first behavior and plugin-unavailable fallback

## 7. Error Handling and Output Consistency

- [ ] 7.1 Implement unified tool result adapters for success (`content` + `structuredContent`) and recoverable failure (`isError: true`)
- [ ] 7.2 Map plugin JSON-RPC errors to actionable MCP tool errors with stable error classes and correlation IDs
- [ ] 7.3 Ensure bridge runtime logs diagnostics to stderr and never emits non-protocol output to stdout

## 8. Verification and Release Gates

- [ ] 8.1 Add integration tests for auth handshake, compatibility negotiation, and degraded-mode transitions
- [ ] 8.2 Add compliance tests for schema policy (`z.object`, enum use, limit bounds) and annotation policy
- [ ] 8.3 Add scenario tests for editor context, semantic search output shape, and note/metadata fallback behavior
- [ ] 8.4 Run `just check`, fix issues with `just fix` when needed, re-run `just check`, and document release/rollback steps
