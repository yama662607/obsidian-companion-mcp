# Obsidian Companion 実機テスト Prompt Pack

このフォルダは、Obsidian Companion MCP の実機テストを分野別に実行するための canonical なプロンプト集です。

## 使い方

- まず `master-real-agent.md` を使うと、search -> read -> edit -> index -> fallback まで一通り確認できます。
- 目的が絞れているなら、各分野別 prompt を単独で使ってください。
- ここにある prompt は current public tool surface のみを前提にしています。
- 古い経緯の docs は残していますが、実運用ではこのフォルダを優先してください。

## Prompt 一覧

1. `master-real-agent.md`
   - 実運用の総合実機テスト
   - discovery、read/edit、active editor、semantic/index、compatibility、fallback を一括確認

2. `discovery-search.md`
   - `list_notes` / `search_notes` / `semantic_search_notes` の探索性を確認
   - 大規模 vault、ページネーション、read hint、payload boundedness を確認

3. `read-edit-integrity.md`
   - `read_note` / `read_active_context` / `edit_note` の handoff を確認
   - full / heading / block / line / selection / cursor の編集導線を確認

4. `semantic-index-compatibility.md`
   - `get_semantic_index_status` / `refresh_semantic_index` の semantics を確認
   - legacy semantic index、bounded chunk payload、再現性を確認

5. `fallback-degraded-mode.md`
   - plugin unavailable、NOT_FOUND、VALIDATION、CONFLICT、path escape などの fallback 挙動を確認
   - degraded reason の粒度と安全性を確認

6. `dual-mcp-cross-review.md`
   - Companion MCP と Excalidraw MCP を併用したクロスレビューを確認
   - ノートと図の整合性、命名、依存関係、更新順を確認

## 推奨実行順

### まず 1 本だけ試すなら

1. `master-real-agent.md`

### フルで確認するなら

1. `discovery-search.md`
2. `read-edit-integrity.md`
3. `semantic-index-compatibility.md`
4. `fallback-degraded-mode.md`
5. `master-real-agent.md`
6. `dual-mcp-cross-review.md`

## レポート基準

- `PASS` は「動いた」ではなく「次の一手が迷わず見える」ことを意味します。
- `Unknown` は観測不能な内容に限定します。
- `GO` を出す前に、少なくとも `search -> read -> edit` と `legacy state` と `large payload` を確認してください。
