# エージェント向け Discovery-First 実機テスト依頼

このテンプレートは、Companion MCP の large-vault 向け discovery-first フローを
Obsidian 実機で確認するための依頼文です。

## 目的

- `list_notes` が bounded pagination で動くことを確認する
- `semantic_search_notes` が全文ではなく候補確認用 excerpt を返すことを確認する
- `read_note` が詳細取得の read path として使えることを確認する
- `move_note` と `get_semantic_index_status` が実運用で使えることを確認する

## 推奨テンプレート（そのまま貼り付け可）

```text
Obsidian Companion MCP の discovery-first 実機テストを行ってください。

前提:
- 実行対象は最新 build / 最新 plugin
- vault は実利用中のものを使う
- 推測ではなく、MCP の入力と実際のレスポンスを根拠に判断する

目的:
1. large-vault でも list/search/read の役割分担が自然か確認する
2. semantic search が全文ではなく excerpt を返すか確認する
3. move_note / get_semantic_index_status が運用に足るか確認する

手順:
1. listTools を実行し、以下の tool が見えることを確認する
- list_notes
- move_note
- get_semantic_index_status
- semantic_search_notes
- read_note

2. list_notes を実行する
- path: 1_Inbox などエントリの多いディレクトリ
- limit: 5
確認項目:
- entries が 5 件以下で返る
- hasMore / nextCursor がある
- 全文 content を返していない

3. nextCursor を使って 2 ページ目を取得する
確認項目:
- 1 ページ目と別の結果が返る
- 順序が破綻していない

4. semantic_search_notes を実行する
- 実在しそうな意味検索クエリを使う
確認項目:
- matches[].path がある
- matches[].score がある
- matches[].excerpt がある
- 全文 content や旧 snippet 依存の巨大 payload になっていない

5. search で見つかった 1 件に対して read_note を実行する
確認項目:
- ここで初めて全文が取得できる
- discovery -> read の流れが自然

6. get_semantic_index_status を実行する
確認項目:
- pendingCount
- indexedCount
- ready
- modelReady
- pendingSample

7. move_note をテスト用ノートで実行する
確認項目:
- from / to が返る
- 移動後に old path が読めない
- 移動後に new path が読める

最終報告フォーマット:
- 総合結果: PASS / FAIL
- list_notes 結果
- semantic_search_notes 結果
- read_note 連携結果
- get_semantic_index_status 結果
- move_note 結果
- 問題があれば再現手順、入力、出力、推定原因
```
