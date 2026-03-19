# Semantic / Index 互換性 実機テスト Prompt

この prompt は、`get_semantic_index_status` / `refresh_semantic_index` / `semantic_search_notes` の semantics と legacy 互換性を確認します。

```text
Obsidian Companion MCP の semantic / index 実機テストを行ってください。

目的:
- semantic index の ready/pending/modelReady の意味が一貫しているか確認する
- refresh が完了 semantics を持っているか確認する
- legacy persisted index を読み込んでも semantic search が実用サイズで返るか確認する

前提:
- 実行対象は最新 build / 最新 plugin
- vault は実利用中のものを使う
- 既存ノートは壊さない

手順:
1. `get_semantic_index_status` を実行する
2. `refresh_semantic_index` を実行する
3. 再度 `get_semantic_index_status` を実行する
4. `semantic_search_notes` を実行する
   - topK は 2〜5
   - maxPerNote は 1〜2
   - neighboringLines は 0 から試す
5. 同じクエリをもう一度実行して再現性を確認する
6. 可能ならテストノートを更新して再検索する

評価ポイント:
- `ready` が `pendingCount === 0 && modelReady` として一貫しているか
- `pendingSample` が実運用上役に立つか
- refresh 後に semantic 結果が bounded のままか
- 旧 index を読んでも全文級 payload に戻らないか
- note の更新・移動・削除後に index が破綻しないか

追加で確認すること:
- `semantic_search_notes` の `readHint` が次の `read_note` にそのまま使えるか
- `indexStatus` が出力に含まれ、状態遷移が分かるか
- modelReady=false のときの挙動が明確か

最終報告フォーマット:
- 総合結果: PASS / FAIL
- get_semantic_index_status 評価
- refresh_semantic_index 評価
- semantic_search_notes 評価
- legacy state 評価
- 再現例
```
