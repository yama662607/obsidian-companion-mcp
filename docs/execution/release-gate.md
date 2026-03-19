# リリースゲート方針

## 必須インプット

- 最新の just check 成功証跡: docs/execution/evidence/just-check-latest.json
- 品質ゲートスクリプト結果: node scripts/execution/validate-quality-gates.mjs
- 互換性 probe 証跡: docs/execution/evidence/compatibility-probes-latest.json

## 手動 sign-off が必要な追加証跡

- 対象フェーズの sign-off 証跡
- Obsidian 実機での Companion E2E 証跡
- Dual MCP 併用（Companion + Excalidraw）E2E 証跡

## Go/No-Go 判定ルール

- PASS 条件: 必須インプットが全て揃い、かつ E2E 指摘に High が 0 件
- CONDITIONAL 条件: Medium 以下のみで回避策と期限が承認済み
- FAIL 条件: 必須インプット不足、または High が 1 件以上

## E2E 観点（最小セット）

1. 起動時 handshake の結果と availability が記録されている
2. `read_active_context` -> `edit_note` が実行できる
3. `patch_note_metadata` 後に `read_note` で frontmatter 反映が確認できる
4. `semantic_search_notes` の結果に index 状態メタが含まれ、payload が bounded である
5. discovery-first フロー（`list_notes` または `search_notes` / `semantic_search_notes` -> `read_note`）が成立する
6. `move_note` と `get_semantic_index_status` が実行できる
7. `refresh_semantic_index` 後に `pendingCount == 0` または未完了理由が明示される
8. text-only client でも `readHint` / `editTarget` 相当の follow-up 情報が確認できる
9. Dual MCP 同時設定でツール干渉がない

## 追加の互換性ゲート

- `read_note.anchor` を JSON string で渡しても解釈できる
- `edit_note.target` / `change` を JSON string で渡しても解釈できる
- legacy semantic index を load しても `semantic_search_notes` が巨大 payload を返さない
- large active editor buffer でも `read_active_context` が bounded payload を返す

## 失敗時の対応

1. 次フェーズ移行を即時凍結する
2. オーナーと期限付きの remediation を起票する
3. 修正後に just check と品質ゲートを再実行する
4. E2E を再実行し、Go/No-Go 記録を更新してから再開する

補助資料:

- [MCP Tool Surface Hardening Playbook](/Users/daisukeyamashiki/Code/Projects/obsidian-companion-mcp/docs/execution/tool-surface-hardening-playbook.md)
