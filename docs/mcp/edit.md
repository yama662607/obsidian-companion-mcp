# MCP Edit Tool

このドキュメントは、最終的な unified editing tool を定義します。  
`edit_note` は persisted note と active editor の両方を編集します。

## Tool Set

- `edit_note`

## Core Principle

`edit_note` は `read_note` と `read_active_context` が返した `editTarget` / `editTargets.*` をそのまま受け取れる設計にします。  
これにより、モデルは target を再構築せずに read -> edit を実行できます。

## Description

Edit a persisted note or the active editor using a structured target and change contract.

## Annotations

- `readOnlyHint: false`
- `destructiveHint: true`
- `idempotentHint: false`
- `openWorldHint: false`

## Input

```json
{
  "target": {},
  "change": {}
}
```

## `target` Variants

persisted note:

```json
{
  "source": "note",
  "note": "Projects/Alpha/Retro.md",
  "anchor": {
    "type": "full"
  },
  "revision": "rev_abc123",
  "currentText": "# Full note text..."
}
```

```json
{
  "source": "note",
  "note": "Projects/Alpha/Retro.md",
  "anchor": {
    "type": "heading",
    "headingPath": ["Action Items"],
    "startLine": 42,
    "endLine": 61
  },
  "revision": "rev_abc123",
  "currentText": "- old line"
}
```

active editor:

```json
{
  "source": "active",
  "activeFile": "Daily/2026-03-19.md",
  "anchor": {
    "type": "selection",
    "range": {
      "from": { "line": 10, "ch": 0 },
      "to": { "line": 10, "ch": 13 }
    }
  },
  "revision": null,
  "currentText": "selected text"
}
```

```json
{
  "source": "active",
  "activeFile": "Daily/2026-03-19.md",
  "anchor": {
    "type": "range",
    "range": {
      "from": { "line": 10, "ch": 0 },
      "to": { "line": 12, "ch": 5 }
    }
  },
  "revision": null,
  "currentText": "current range text"
}
```

## `change` Variants

replace the target itself:

```json
{
  "type": "replaceTarget",
  "content": "replacement text"
}
```

append:

```json
{
  "type": "append",
  "content": "\n- new item"
}
```

prepend:

```json
{
  "type": "prepend",
  "content": "# Header\n"
}
```

insert at active cursor:

```json
{
  "type": "insertAtCursor",
  "content": "[Review Start] "
}
```

exact text replacement:

```json
{
  "type": "replaceText",
  "find": "old sentence",
  "replace": "new sentence",
  "occurrence": "first"
}
```

`occurrence` supports:

- `"first"`
- `"last"`
- `"all"`
- integer occurrence index

v1 では regex はサポートしません。

## Output

```json
{
  "status": "applied",
  "target": {
    "source": "note",
    "note": "Projects/Alpha/Retro.md",
    "anchor": {
      "type": "heading",
      "headingPath": ["Action Items"]
    }
  },
  "revisionBefore": "rev_abc123",
  "revisionAfter": "rev_def456",
  "preview": {
    "before": "- old line",
    "after": "- new line"
  },
  "previewMeta": {
    "beforeTotalChars": 10,
    "afterTotalChars": 10,
    "beforeTruncated": false,
    "afterTruncated": false
  },
  "degraded": false,
  "degradedReason": null,
  "readBack": {
    "tool": "read_note",
    "input": {
      "note": "Projects/Alpha/Retro.md",
      "anchor": {
        "type": "heading",
        "headingPath": ["Action Items"]
      }
    }
  },
  "warnings": []
}
```

active editor example:

```json
{
  "status": "applied",
  "target": {
    "source": "active",
    "activeFile": "Daily/2026-03-19.md",
    "anchor": {
      "type": "selection",
      "range": {
        "from": { "line": 10, "ch": 0 },
        "to": { "line": 10, "ch": 13 }
      }
    }
  },
  "revisionBefore": null,
  "revisionAfter": null,
  "preview": {
    "before": "selected text",
    "after": "rewritten text"
  },
  "previewMeta": {
    "beforeTotalChars": 13,
    "afterTotalChars": 14,
    "beforeTruncated": false,
    "afterTruncated": false
  },
  "degraded": false,
  "degradedReason": null,
  "readBack": {
    "tool": "read_active_context",
    "input": {}
  },
  "warnings": []
}
```

`preview.before` / `preview.after` は confirmation 用の excerpt で、各 500 chars までです。全文は返しません。全文確認が必要なら `readBack` に従って `read_note` / `read_active_context` を再実行します。

`previewMeta` は excerpt の元になった全文長と、excerpt 化で truncation が発生したかを示します。

## Failure Model

`edit_note` は success payload に `not_found` や `conflict` を埋め込みません。  
以下は MCP error envelope で返します。

- `NOT_FOUND`
- `VALIDATION`
- `CONFLICT`
- `UNAVAILABLE`

## Examples

persisted note 全文置換:

```json
{
  "target": {
    "source": "note",
    "note": "Projects/Alpha/Retro.md",
    "anchor": { "type": "full" },
    "revision": "rev_abc123"
  },
  "change": {
    "type": "replaceTarget",
    "content": "# New content\n..."
  }
}
```

active selection 置換:

```json
{
  "target": {
    "source": "active",
    "activeFile": "Daily/2026-03-19.md",
    "anchor": {
      "type": "selection",
      "range": {
        "from": { "line": 10, "ch": 0 },
        "to": { "line": 10, "ch": 13 }
      }
    },
    "currentText": "selected text"
  },
  "change": {
    "type": "replaceTarget",
    "content": "rewritten text"
  }
}
```

persisted note 内の exact string replace:

```json
{
  "target": {
    "source": "note",
    "note": "Projects/Alpha/Retro.md",
    "anchor": { "type": "full" },
    "revision": "rev_abc123"
  },
  "change": {
    "type": "replaceText",
    "find": "old sentence",
    "replace": "new sentence",
    "occurrence": "first"
  }
}
```

cursor target の場合は `change.type = "replaceTarget"` を insert として扱います。`replaceText` は cursor target では使えません。
