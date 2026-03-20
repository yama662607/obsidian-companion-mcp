# MCP Discovery Tools

このドキュメントは、最終的な discovery/search 系ツールを定義します。  
役割は「候補を探す」「一覧を取る」「インデックス状態を確認する」であり、本文の詳細取得は `read_note` に委ねます。

## Tool Set

- `list_notes`
- `search_notes`
- `semantic_search_notes`
- `get_semantic_index_status`
- `refresh_semantic_index`

## Common Principles

- discovery 系はすべて `readOnlyHint: true`
- 結果は `outputSchema` 前提
- 本文全文は返さない
- follow-up は `read_note` へつながる `readHint` で表す
- `limit` / `topK` / sample 系はすべて bounded

## `list_notes`

**Purpose**  
指定フォルダ配下の note / directory を、安全なページング付きで列挙する。

**Description**  
List notes and directories under a vault-relative folder with bounded pagination.

**Input**

```json
{
  "path": "",
  "cursor": "opaque-string",
  "limit": 100,
  "recursive": false,
  "includeDirs": true
}
```

**Output**

```json
{
  "path": "",
  "returned": 100,
  "hasMore": true,
  "nextCursor": "opaque-string",
  "entries": [
    {
      "path": "Projects/Alpha.md",
      "name": "Alpha.md",
      "kind": "file",
      "updatedAt": "2026-03-19T10:00:00Z",
      "size": 1234
    }
  ]
}
```

**Notes**

- note 本文は読まない
- directory は `kind = "directory"`
- `path` は vault-relative

## `search_notes`

**Purpose**  
exact/lexical query と metadata filter による note-level 検索。

**Description**  
Find notes by lexical text matching and metadata filters.

**Input**

```json
{
  "query": "onboarding checklist",
  "pathPrefix": "Projects/",
  "filters": {
    "tagsAny": ["retro"],
    "tagsAll": ["alpha"],
    "frontmatterEquals": [
      { "key": "status", "value": "active" }
    ],
    "modifiedAfter": "2026-03-01T00:00:00Z",
    "modifiedBefore": "2026-03-20T00:00:00Z",
    "filenameGlob": "Projects/**/*.md"
  },
  "sort": "relevance",
  "limit": 10,
  "cursor": null,
  "include": {
    "snippet": true,
    "matchLocations": true,
    "tags": false,
    "frontmatterKeys": ["status", "project"]
  }
}
```

**Output**

```json
{
  "query": "onboarding checklist",
  "sort": "relevance",
  "total_matches": 12,
  "returned": 10,
  "hasMore": true,
  "nextCursor": "opaque-string",
  "results": [
    {
      "note": {
        "path": "Projects/Alpha/Retro.md",
        "title": "Retro",
        "modifiedAt": "2026-03-16T11:24:00Z"
      },
      "score": 0.93,
      "matchedFields": ["text", "frontmatter"],
      "bestAnchor": {
        "type": "line",
        "startLine": 42,
        "endLine": 46
      },
      "snippet": {
        "text": "- Update onboarding checklist",
        "startLine": 42,
        "endLine": 42
      },
      "metadata": {
        "tags": ["retro", "alpha"],
        "frontmatter": {
          "status": "active",
          "project": "alpha"
        }
      },
      "readHint": {
        "note": "Projects/Alpha/Retro.md",
        "anchor": {
          "type": "line",
          "startLine": 42,
          "endLine": 46
        }
      }
    }
  ]
}
```

**Notes**

- `query` または `filters` のどちらかは必須
- `linked_to`、DQL、JsonLogic は v1 では入れない
- 結果は note-level。詳細本文は `read_note`

## `semantic_search_notes`

**Purpose**  
idea-based query に対して chunk-level の概念検索を行う。

**Description**  
Find conceptually related note passages using a server-side semantic index.

**Input**

```json
{
  "query": "notes about handoff quality and onboarding gaps",
  "pathPrefix": "Projects/",
  "filters": {
    "tagsAny": ["retro"],
    "modifiedAfter": "2026-03-01T00:00:00Z",
    "notePaths": ["Projects/Alpha/Retro.md"]
  },
  "topK": 8,
  "maxPerNote": 2,
  "minScore": 0.6,
  "include": {
    "tags": false,
    "frontmatterKeys": ["status"],
    "neighboringLines": 2
  }
}
```

**Output**

```json
{
  "query": "notes about handoff quality and onboarding gaps",
  "returned": 3,
  "indexStatus": {
    "pendingCount": 0,
    "indexedNoteCount": 120,
    "indexedChunkCount": 860,
    "running": false,
    "ready": true,
    "modelReady": true
  },
  "results": [
    {
      "rank": 1,
      "score": 0.88,
      "note": {
        "path": "Projects/Alpha/Retro.md",
        "title": "Retro",
        "modifiedAt": "2026-03-16T11:24:00Z"
      },
      "anchor": {
        "type": "line",
        "startLine": 42,
        "endLine": 48,
        "headingPath": ["Action Items"]
      },
      "chunk": {
        "id": "Projects/Alpha/Retro.md:42-48",
        "text": "Update onboarding checklist and add handoff notes.",
        "startLine": 42,
        "endLine": 48
      },
      "metadata": null,
      "readHint": {
        "note": "Projects/Alpha/Retro.md",
        "anchor": {
          "type": "line",
          "startLine": 42,
          "endLine": 48
        }
      }
    }
  ]
}
```

**Notes**

- 結果は chunk-level
- note 本文全文は返さない
- semantic index が未準備なら `index_status` で分かる

## `get_semantic_index_status`

**Purpose**  
semantic index の readiness と pending queue を検索なしで確認する。

**Description**  
Inspect semantic index readiness, queue depth, bounded pending samples, and the last reconciliation counters.

**Input**

```json
{
  "pendingSampleLimit": 20
}
```

**Output**

```json
{
  "pendingCount": 12,
  "indexedNoteCount": 120,
  "indexedChunkCount": 860,
  "running": true,
  "ready": false,
  "isEmpty": false,
  "modelReady": true,
  "scannedCount": 120,
  "skippedCount": 84,
  "queuedCount": 36,
  "flushedCount": 36,
  "removedCount": 2,
  "pendingSample": [
    "Projects/Alpha/Retro.md",
    "Daily/2026-03-19.md"
  ]
}
```

## `refresh_semantic_index`

**Purpose**  
semantic index の rebuild / refresh を完了まで実行する。

**Description**  
Run a metadata-first reconciliation pass, read only changed note bodies, remove stale indexed paths, then flush pending items and report the final queue state.

**Input**

```json
{}
```

**Output**

```json
{
  "totalFound": 120,
  "scannedCount": 120,
  "skippedCount": 84,
  "queuedCount": 35,
  "flushedCount": 35,
  "removedCount": 2,
  "pendingCount": 0,
  "indexedNoteCount": 120,
  "indexedChunkCount": 860,
  "modelReady": true
}
```

**Notes**

- heavy tool なので read-only ではないが destructive でもない
- refresh は vault metadata を先に比較し、変更されたノートだけ本文を読む
- 外部削除されたノートが index に残っていれば refresh 中に除去される
- 通常は queue を空にして返す
- `pendingCount > 0` のまま返る場合は provider/runtime 側の未完了理由を別途確認する
