# Fallback / Degraded Mode Runtime Report (2026-03-20)

## Summary

- Overall result: `PASS`
- Scope: real-agent runtime validation of fallback, degraded mode, and failure semantics
- Focus:
  - `NOT_FOUND`
  - `VALIDATION`
  - `CONFLICT`
  - `UNAVAILABLE`
  - `degradedReason`
  - path escape handling

## Results

### Missing path handling

| Tool | Input | Result | Verdict |
| --- | --- | --- | --- |
| `read_note` | `non/existent/path.md` | `NOT_FOUND` / `Note not found` | PASS |
| `delete_note` | `non/existent/path.md` | `NOT_FOUND` / `Note not found` | PASS |

### Path escape handling

| Tool | Input | Result | Verdict |
| --- | --- | --- | --- |
| `read_note` | `../escape-to-parent.md` | MCP validation / `Path must be vault-relative` | PASS |
| `create_note` | `../escape-creation.md` | MCP validation / `Path must be vault-relative` | PASS |
| `read_note` | `Test/../../../escape-far.md` | `VALIDATION` / `Invalid vault-relative path` | PASS |

### `edit_note` failure cases

| Case | Result | Verdict |
| --- | --- | --- |
| Invalid revision | `CONFLICT` / `Target revision no longer matches` | PASS |
| Text not found | `NOT_FOUND` / `Text to replace was not found` | PASS |
| Invalid anchor type | MCP validation / invalid discriminator | PASS |

### `move_note` conflicts

| Case | Result | Verdict |
| --- | --- | --- |
| Move to existing path | `CONFLICT` / `Destination already exists` | PASS |
| Move missing note | `NOT_FOUND` / `Note not found` | PASS |

### Active editor unavailable

| Case | Result | Verdict |
| --- | --- | --- |
| No active editor | `noActiveEditor=true`, `editorState="none"` | PASS |
| Active edit without editor | `UNAVAILABLE` / `No active editor found` | PASS |

### Additional edge cases

| Case | Result | Verdict |
| --- | --- | --- |
| Missing heading | `NOT_FOUND` / `Heading not found` | PASS |
| Missing block | `NOT_FOUND` / `Block not found` | PASS |

### Search / semantic status

| Tool | Result | Verdict |
| --- | --- | --- |
| `search_notes` | normal, `degraded=false` | PASS |
| `semantic_search_notes` | normal, `indexStatus.ready=true` | PASS |

## Interpretation

- `NOT_FOUND`, `VALIDATION`, `CONFLICT`, and `UNAVAILABLE` are cleanly separated.
- path escape is blocked by both MCP-level validation and domain validation.
- degraded fallback does not mask missing resources as success.
- `degradedReason` is specific enough to diagnose at least one fallback path, including `plugin_internal_fallback_used`.

## Known Gaps

1. True `plugin_unavailable` runtime was not reproduced with Obsidian fully stopped.
2. `plugin_internal_fallback_used` appeared on an early `create_note` call only; startup-timing dependency is still worth investigating.

## Recommended Follow-up

1. Add a dedicated runtime test with Obsidian/plugin intentionally unavailable.
2. Keep `UNAVAILABLE` documented separately from `NOT_FOUND`.
3. Observe startup timing around first plugin-backed write to understand when fallback activates.
