# MCP Tool Surface Overview

最終的な public tool surface は workflow で分類します。特に重要なのは、`read_note` と `read_active_context` がどちらも `edit_note` にそのまま渡せる `editTarget` / `editTargets` を返すことです。

## 1. Discovery

- `list_notes`
- `search_notes`
- `semantic_search_notes`
- `get_semantic_index_status`
- `refresh_semantic_index`

## 2. Read

- `read_note`
- `read_active_context`

## 3. Edit

- `edit_note`

## 4. Lifecycle / Metadata

- `create_note`
- `patch_note_metadata`
- `move_note`
- `delete_note`

## Primary Flow

persisted note:

1. `search_notes` or `semantic_search_notes`
2. `read_note`
3. `edit_note`

active editor:

1. `read_active_context`
2. `edit_note`

## Legacy to Final Mapping

- `search_notes_semantic` -> `semantic_search_notes`
- `get_note` -> `read_note`
- `get_active_context` -> `read_active_context`
- `update_note_content` -> `edit_note`
- `insert_at_cursor` -> `edit_note`
- `replace_range` -> `edit_note`
- `update_note_metadata` -> `patch_note_metadata`
- `get_index_status` -> `get_semantic_index_status`

## Design Rules

- search は discovery-only
- read は `editTarget` または `editTargets` を返す
- edit は `edit_note` 1 つに統合
- metadata patch は content edit と分離
- destructive / read-only annotation は tool intent に正しく合わせる

## Error Semantics

public tools は domain error code を一貫して使います。

- `VALIDATION`
  - 入力が schema または vault safety rule に違反している
  - 例: path escape, invalid cursor, unsupported anchor
- `NOT_FOUND`
  - 対象 note / heading / block / text が存在しない
  - fallback 成功とは混同しない
- `CONFLICT`
  - revision や target text が現在状態と一致しない
  - 例: stale revision, destination already exists, ambiguous occurrence
- `UNAVAILABLE`
  - 対象リソースや runtime が一時的に利用できない
  - 例: no active editor, plugin communication failure, vault path 未設定
  - `NOT_FOUND` とは別で、リソース不在ではなく現在利用不能を表す
- `INTERNAL`
  - 予期しない内部エラー

degraded fallback が成功した場合は error を返さず、payload に `degraded=true` と具体的な `degradedReason` を含めます。
