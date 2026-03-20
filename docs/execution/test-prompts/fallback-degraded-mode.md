# Fallback / Degraded Mode 実機テスト Prompt

この prompt は、plugin 不通、`NOT_FOUND`、`VALIDATION`、`CONFLICT`、`UNAVAILABLE`、path escape などの fallback 挙動を確認します。

```text
Obsidian Companion MCP の fallback / degraded mode 実機テストを行ってください。

目的:
- plugin 不通でも安全に fallback するか確認する
- degradedReason が曖昧な `plugin_unavailable` だけになっていないか確認する
- NOT_FOUND / VALIDATION / CONFLICT が意味を失っていないか確認する
- `UNAVAILABLE` が `NOT_FOUND` と混同されていないか確認する
- path escape や無効 range が安全に止まるか確認する

前提:
- 実行対象は最新 build / 最新 plugin
- テスト用の一時ノートだけを使う
- 破壊的操作は必ず delete でクリーンアップする

手順:
1. 存在しない path に対して `read_note` / `delete_note` を試す
2. path escape を試す
   - `../outside.md`
3. `edit_note` に invalid anchor / invalid revision / invalid range を与える
4. `move_note` の衝突ケースを試す
   - 既存 path への移動
5. `read_active_context` を no active editor の状態でも試す
   - active edit が `UNAVAILABLE` になるか確認する
6. plugin を意図的に使えない状態にできるなら、そのときの degradedReason を確認する

評価ポイント:
- `degradedReason` が原因別に分かれているか
- `NOT_FOUND` と fallback 成功が混同されていないか
- `VALIDATION` と `CONFLICT` が明確か
- `UNAVAILABLE` が一時的利用不能として一貫しているか
- path escape が silent failure になっていないか
- note 系と active editor 系で degraded の粒度が揃っているか

記録すること:
- 呼び出した tool 名
- 入力
- 出力の code / message / degradedReason
- 期待と違った点

最終報告フォーマット:
- 総合結果: PASS / FAIL
- NOT_FOUND 評価
- VALIDATION 評価
- CONFLICT 評価
- UNAVAILABLE 評価
- degradedReason 評価
- plugin unavailable 評価
- 再現例
- 改善提案
```
