# MCP Interface Classification Rules

## Decision Flow

1. If operation mutates external state, expose as Tool.
2. If operation is read-only context, expose as Resource.
3. If operation provides repeatable workflow scaffolding, expose as Prompt.

## Tool Rules

- One tool, one responsibility.
- Input schema must use strict `z.object`.
- Finite modes must use enums.
- Size controls such as `limit` must define min/max/default.
- Read-only tools set `readOnlyHint: true`.
- Destructive tools set `destructiveHint: true`.

## Resource Rules

- Must be read-only.
- Must include stable URI and mime type.
- Should provide durable context that users would otherwise retype.

## Prompt Rules

- Must guide repeat workflows.
- Must not embed direct side effects.
- Should explicitly mention relevant tool/resource usage order.

## Validation

- Use `node scripts/execution/validate-quality-gates.mjs` for policy checks.
- Use `just check` as release gate baseline evidence.
