## 1. 問題再現と診断基盤

- [ ] 1.1 実機レビューで報告された3症状（常時degraded、metadata非反映、semantic空結果）を再現テスト化する
- [ ] 1.2 bridge 側に availability と degradedReason の観測ポイントを追加する
- [ ] 1.3 plugin 接続の成否を E2E ログで相関可能にする（correlationId/phase 明記）

## 2. 起動時接続フローの安定化

- [ ] 2.1 bridge 起動時に plugin handshake を実行する初期化フローを設計する
- [ ] 2.2 handshake 失敗時の availability 遷移と再試行方針を実装する
- [ ] 2.3 起動直後の状態を resource または structured 応答で取得可能にする

## 3. Editor 経路の実体接続化

- [ ] 3.1 `get_active_context` を plugin 実エディタ情報優先へ変更する
- [ ] 3.2 `insert_at_cursor` / `replace_range` を plugin RPC 呼び出しに接続する
- [ ] 3.3 no-active-editor 時の応答仕様を明文化し、テストに反映する

## 4. Note/Metadata の整合性修正

- [ ] 4.1 fallback metadata 更新結果を read content へ反映する正規化層を実装する
- [ ] 4.2 `manage_metadata` 実行後 read round-trip の整合テストを追加する
- [ ] 4.3 `degradedReason` を note/metadata 応答へ追加する

## 5. Semantic 連携の実用化

- [ ] 5.1 note create/update 時に semantic index enqueue を接続する
- [ ] 5.2 index pending 時の応答メタ（例: pending件数）を返す仕様を実装する
- [ ] 5.3 semantic_search の期待結果が安定する統合テストを追加する

## 6. MCP 契約の整理と互換性

- [ ] 6.1 `delete_note` の入力契約を単責務化し、不要引数を段階廃止する
- [ ] 6.2 破壊的/読み取り系 annotation と description を再監査する
- [ ] 6.3 互換性リスクを release note と migration guide に記載する

## 7. Dual MCP 実機レビューゲート

- [ ] 7.1 Obsidian Companion + Excalidraw の同時設定で E2E 試験を実行する
- [ ] 7.2 指摘テンプレート（severity/再現手順/期待値）でレビュー結果を記録する
- [ ] 7.3 go/no-go 判定基準を docs/execution の gate ドキュメントへ追記する

## 8. 品質確認とリリース準備

- [ ] 8.1 `just check` と実装テストを通し、失敗要因を全解消する
- [ ] 8.2 OpenSpec artifacts（proposal/design/specs/tasks）の整合を validate で確認する
- [ ] 8.3 変更単位でコミットし、最終的に main へ push する
