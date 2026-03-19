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

**Anchor Types**

- `full`
- `frontmatter`
- `heading`
- `block`
- `line`

`block` は explicit block ref (`^block-id`) のみ対応します。

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
  "documentMap": null,
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

`maxChars` で本文が切り詰められた場合、`content.text` は truncated になり、`editTarget.currentText` や `documentEditTarget.currentText` は省略されることがあります。編集の安全性は `revision` と resolved anchor で担保します。

## `read_active_context`

**Purpose**  
active editor の unsaved buffer と selection/cursor 状態を読む。

**Description**  
Read the active editor buffer and return edit targets for the current active context.

**Input**

```json
{}
```

**Output**

```json
{
  "activeFile": "Daily/2026-03-19.md",
  "cursor": { "line": 10, "ch": 5 },
  "selection": "selected text",
  "selectionRange": {
    "from": { "line": 10, "ch": 0 },
    "to": { "line": 10, "ch": 13 }
  },
  "content": "# note body...",
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
