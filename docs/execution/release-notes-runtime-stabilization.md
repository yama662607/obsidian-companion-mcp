# リリースノート: Runtime 安定化

## 主な変更

- 起動時 plugin handshake と runtime status resource を追加
- editor 操作を plugin-first 実行経路へ切替
- fallback 時の metadata frontmatter round-trip 正規化を追加
- note 更新を semantic indexing パイプラインへ接続
- delete_note ツール契約を path-only に簡素化

## 運用上の改善

- degradedReason による degraded 状態の可観測性を強化
- semantic_search 応答に indexStatus メタを追加
- 実機 E2E / Dual MCP E2E の release gate 判定基準を追加

## 互換性・挙動変更

- delete_note は action/content を受け付けなくなりました

## 推奨検証

- just check を実行する
- runtime-e2e-template 形式で Obsidian 実機 E2E 証跡を残す
- リリース承認前に Dual MCP 併用を検証する
