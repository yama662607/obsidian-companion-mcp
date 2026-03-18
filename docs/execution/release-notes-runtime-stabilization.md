# リリースノート: Runtime 安定化

## 主な変更

- 起動時 plugin handshake と runtime status resource を追加
- editor 操作を plugin-first 実行経路へ切替
- fallback 時の metadata frontmatter round-trip 正規化を追加
- note 更新を semantic indexing パイプラインへ接続
- delete_note ツール契約を path-only に簡素化
- `list_notes` / `move_note` / `get_index_status` を追加
- `search_notes_semantic` を discovery-oriented excerpt 応答へ変更
- editor mutation ツールを軽量確認 payload 応答へ変更

## 運用上の改善

- degradedReason による degraded 状態の可観測性を強化
- search_notes_semantic 応答に indexStatus メタを追加
- 実機 E2E / Dual MCP E2E の release gate 判定基準を追加

## 互換性・挙動変更

- delete_note は action/content を受け付けなくなりました
- search_notes_semantic の match は全文ではなく `excerpt` を返します
- insert_at_cursor / replace_range は全文 `content` を既定で返しません
- discovery-first フローは `list_notes` / `search_notes_semantic` -> `get_note` を推奨します

## 推奨検証

- just check を実行する
- runtime-e2e-template 形式で Obsidian 実機 E2E 証跡を残す
- リリース承認前に Dual MCP 併用を検証する
- discovery-first prompt を使って `list_notes` / `move_note` / `get_index_status` の実機動作を確認する
