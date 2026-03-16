# リリースゲート方針

## 必須インプット

- 最新の just check 成功証跡: docs/execution/evidence/just-check-latest.json
- 品質ゲートスクリプト結果: node scripts/execution/validate-quality-gates.mjs
- 対象フェーズの sign-off 証跡
- Obsidian 実機での Companion E2E 証跡
- Dual MCP 併用（Companion + Excalidraw）E2E 証跡

## Go/No-Go 判定ルール

- PASS 条件: 必須インプットが全て揃い、かつ E2E 指摘に High が 0 件
- CONDITIONAL 条件: Medium 以下のみで回避策と期限が承認済み
- FAIL 条件: 必須インプット不足、または High が 1 件以上

## E2E 観点（最小セット）

1. 起動時 handshake の結果と availability が記録されている
2. get_active_context / insert_at_cursor / replace_range が実行できる
3. update_note_metadata 後に get_note で frontmatter 反映が確認できる
4. search_notes_semantic の結果に index 状態メタが含まれる
5. Dual MCP 同時設定でツール干渉がない

## 失敗時の対応

1. 次フェーズ移行を即時凍結する
2. オーナーと期限付きの remediation を起票する
3. 修正後に just check と品質ゲートを再実行する
4. E2E を再実行し、Go/No-Go 記録を更新してから再開する
