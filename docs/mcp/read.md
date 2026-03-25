# MCP Read Tools

このドキュメントは、最終的な read 系ツールを定義します。  
両ツールの目的は「読む」ことですが、最も重要なのは **次の `edit_note` にそのまま渡せる `editTarget` / `editTargets` を返すこと**です。

## Tool Set

- `read_note`
- `read_active_context`

## Shared Design

両ツールは共通して次を返します。

- 読み取った範囲の content
- resolved selection
- 必要に応じた metadata
- `editTarget` または `editTargets`

`editTarget` は `edit_note` にそのまま渡せる machine-readable contract です。

## Shared `editTarget`

persisted note:

```json
{
  "source": "note",
  "note": "Projects/Alpha/Retro.md",
  "anchor": {
    "type": "heading",
    "headingPath": ["Action Items"],
    "startLine": 4,
    "endLine": 7
  },
  "revision": "rev_abc123",
  "currentText": "- Update onboarding checklist\n"
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

## `read_note`

**Purpose**  
persisted note の全体または一部を読む。

**Description**  
Read part or all of a persisted Obsidian note and return a follow-up edit target.

**Input**

```json
{
  "note": "Projects/Alpha/Retro.md",
  "anchor": {
    "type": "heading",
    "headingPath": ["Action Items"]
  },
  "maxChars": 6000,
  "include": {
    "metadata": true,
    "documentMap": false
  }
}
```

line window example:

```json
{
  "note": "Projects/Alpha/Retro.md",
  "anchor": {
    "type": "line",
    "startLine": 120,
    "endLine": 180
  },
  "maxChars": 6000,
  "include": {
    "metadata": false,
    "documentMap": false
  }
}
```

**Anchor Types**

- `full`
- `frontmatter`
- `heading`
- `block`
- `line`

`block` は explicit block ref (`^block-id`) のみ対応します。

`line` は persisted note を行範囲で windowing しながら読むための anchor です。長い仕様書やログを順番に読むときは、`line` を使うのが最も素直です。

**Output**

```json
{
  "note": {
    "path": "Projects/Alpha/Retro.md",
    "title": "Retro",
    "modifiedAt": "2026-03-16T11:24:00Z",
    "size": 4821
  },
  "revision": "rev_abc123",
  "selection": {
    "anchor": {
      "type": "heading",
      "headingPath": ["Action Items"],
      "startLine": 42,
      "endLine": 61
    },
    "totalLines": 138
  },
  "content": {
    "text": "- Update onboarding checklist\n- Add handoff notes\n",
    "truncated": false,
    "charsReturned": 49
  },
  "metadata": {
    "tags": ["retro", "alpha"],
    "frontmatter": {
      "project": "alpha",
      "status": "done"
    }
  },
  "metadataTruncated": false,
  "documentMap": null,
  "documentMapTruncated": false,
  "readMoreHint": null,
  "editTarget": {
    "source": "note",
    "note": "Projects/Alpha/Retro.md",
    "anchor": {
      "type": "heading",
      "headingPath": ["Action Items"],
      "startLine": 42,
      "endLine": 61
    },
    "revision": "rev_abc123",
    "currentText": "- Update onboarding checklist\n- Add handoff notes\n"
  },
  "documentEditTarget": {
    "source": "note",
    "note": "Projects/Alpha/Retro.md",
    "anchor": {
      "type": "full"
    },
    "revision": "rev_abc123"
  }
}
```

`maxChars` は本文 `content.text` の上限です。本文が切り詰められた場合、`content.text` は truncated になり、`editTarget.currentText` や `documentEditTarget.currentText` は省略されることがあります。編集の安全性は `revision` と resolved anchor で担保します。

`readMoreHint` の挙動は anchor によって異なります。

- `line` anchor: 次の同じ行数の window を返す。`maxChars` は据え置き
- それ以外の anchor: 本文が `maxChars` で切り詰められたときだけ、同じ anchor でより大きい `maxChars` を提案する

たとえば `startLine: 120, endLine: 180` で読んだ場合、次が存在すれば `readMoreHint.anchor` は `startLine: 181, endLine: 241` になります。

`metadata.frontmatter` と `documentMap` は別の response-side cap で bounded されます。

- `metadata.frontmatter`: string は 500 chars、array は 25 items、object は 50 keys
- `documentMap.headings`: 100 entries
- `documentMap.blocks`: 100 entries
- `documentMap.frontmatterFields`: 50 entries

これらの cap が発動した場合は `metadataTruncated` / `documentMapTruncated` が `true` になります。

`content[0].text` は compact summary で、raw `editTarget` / `documentEditTarget` JSON や長文本文は含めません。

## `read_active_context`

**Purpose**  
active editor の unsaved buffer と selection/cursor 状態を読む。

**Description**  
Read the active editor buffer and return edit targets for the current active context.

**Input**

```json
{
  "maxChars": 6000
}
```

**Output**

```json
{
  "activeFile": "Daily/2026-03-19.md",
  "cursor": { "line": 10, "ch": 5 },
  "selection": "selected text",
  "selectionTruncated": false,
  "selectionCharsReturned": 13,
  "selectionTotalChars": 13,
  "selectionRange": {
    "from": { "line": 10, "ch": 0 },
    "to": { "line": 10, "ch": 13 }
  },
  "content": "# note body...",
  "contentTruncated": false,
  "contentCharsReturned": 13,
  "contentTotalChars": 13,
  "degraded": false,
  "degradedReason": null,
  "noActiveEditor": false,
  "editorState": "active",
  "editTargets": {
    "selection": {
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
    },
    "cursor": {
      "source": "active",
      "activeFile": "Daily/2026-03-19.md",
      "anchor": {
        "type": "cursor",
        "position": { "line": 10, "ch": 5 }
      },
      "revision": null,
      "currentText": ""
    },
    "document": {
      "source": "active",
      "activeFile": "Daily/2026-03-19.md",
      "anchor": {
        "type": "full"
      },
      "revision": null,
      "currentText": "# note body..."
    }
  }
}
```

**Notes**

- no active editor なら `editTargets` は `null`
- selection が空なら `selection` target は返さない
- active editor 側では revision は持たない
- `selection` / `content` は `maxChars` で bounded される
- 返却が truncated の場合、対応する `editTargets.*.currentText` は省略されることがある
- `content[0].text` は compact summary で、raw `editTarget` JSON や本文全文は含めない
