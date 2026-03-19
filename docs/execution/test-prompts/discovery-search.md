# Discovery / Search 実機テスト Prompt

この prompt は、`list_notes` / `search_notes` / `semantic_search_notes` の探索性を重点的に確認します。

```text
Obsidian Companion MCP の discovery/search 実機テストを行ってください。

目的:
- large vault でも候補探索が迷わずできるか確認する
- `list_notes` と `search_notes` と `semantic_search_notes` の役割分担を確認する
- search 結果が全文になりすぎず、read に渡す前提として使えるか確認する

前提:
- 実行対象は最新 build / 最新 plugin
- 推測ではなく、返り値の実データを根拠に判断する
- 既存ノートは壊さない

手順:
1. `listTools` を実行し、以下を確認する
   - list_notes
   - search_notes
   - semantic_search_notes
   - read_note
   - get_semantic_index_status
2. `list_notes` を `1_Inbox` で実行する
   - limit は 5〜10
   - recursive は false と true の両方を試す
3. 次ページ取得を試す
   - nextCursor が自然に使えるか
4. `search_notes` を query のみで試す
   - 例: `MCP`, `semantic`, `frontmatter`
5. `search_notes` を filters 付きで試す
   - pathPrefix
   - tags_any / tags_all
   - frontmatter_equals
6. `semantic_search_notes` を意味検索で試す
   - ファイル名や正確な文言を覚えていなくても見つかるか
   - topK は小さめにする
   - maxPerNote は 1 か 2 にする

評価ポイント:
- `list_notes` が bounded pagination になっているか
- `search_notes` が候補ノートを絞り込む用途に向いているか
- `semantic_search_notes` が候補確認用 excerpt を返しているか
- `readHint` が次の `read_note` にそのまま渡せるか
- 1 つの検索結果を読むために余計な手順が要らないか

失敗時に記録すること:
- payload が大きすぎる
- 結果が細かいノート位置ではなく全文に近い
- path / title / score / anchor が不足している
- 同じクエリを繰り返したときに結果が不安定

最終報告フォーマット:
- 総合結果: PASS / FAIL
- list_notes の評価
- search_notes の評価
- semantic_search_notes の評価
- read_hint の評価
- 改善提案
- 再現例
```
