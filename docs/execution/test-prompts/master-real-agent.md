# Obsidian Companion MCP 総合実機テスト Prompt

この prompt は、Obsidian Companion MCP を実際に使って作業するエージェント向けの総合実機テストです。

目的は単なる動作確認ではなく、以下を確認することです。

- `search -> read -> edit` が自然につながるか
- `read_note` / `read_active_context` の返り値が次の編集にそのまま使えるか
- 大規模 vault でも payload が bounded か
- legacy state / text-only client / stringified nested args に耐えるか
- fallback / degraded reason / not found / conflict が意味を失っていないか

```text
Obsidian Companion MCP の総合実機テストを行ってください。

あなたは開発者ではなく、実際にこの MCP を使って Obsidian vault 上で作業する一人のエージェントです。
推測ではなく、実際に呼んだ tool の入力と返り値を根拠に、使いやすさと安全性を評価してください。

前提:
- 実行対象は最新 build / 最新 plugin
- vault は実運用中のものを使う
- 既存の大事なノートは壊さない
- 書き込みは原則テスト用ノートだけで行う
- text-only client と structured client の両方を意識する
- 旧 tool 名や retired prompt 名は使わない

Current public tool surface:
- list_notes
- search_notes
- semantic_search_notes
- read_note
- read_active_context
- edit_note
- create_note
- patch_note_metadata
- move_note
- delete_note
- get_semantic_index_status
- refresh_semantic_index

最初に確認すること:
1. tools/list を実行する
2. 旧 tool 名が見えていないことを確認する
3. 返り値が text-only client でも役に立つ形か確認する

Phase A: Discovery
1. `list_notes` を 1_Inbox など件数の多い場所で実行する
2. `nextCursor` を使って複数ページを確認する
3. `search_notes` を query のみ、filters 付き、pathPrefix 付きで実行する
4. `semantic_search_notes` を 2 クエリ以上で実行する
確認項目:
- entries / results が bounded か
- readHint が次の read にそのまま使えるか
- semantic 結果が全文になっていないか
- 大きすぎて読めない payload になっていないか

Phase B: Persisted note read/edit
1. `create_note` でテストノートを作成する
   - path は `1_Inbox/Agent-Deep-Review.md`
2. `read_note` を full / heading / frontmatter / block / line で試す
3. `edit_note` に `read_note` の `editTarget` をそのまま渡す
4. `patch_note_metadata` を実行する
5. `move_note` を実行する
6. `delete_note` を実行する
確認項目:
- `read_note` の `editTarget` / `documentEditTarget` が使いやすいか
- `edit_note` が全文置換、追記、文字列置換を迷わず処理できるか
- metadata round-trip が崩れないか
- move / delete の degradedReason が意味のある粒度か

Phase C: Active editor
1. ユーザーに上記テストノートを Obsidian で開いてもらう
2. 可能なら selection を作る
3. `read_active_context` を実行する
4. `edit_note` に `editTargets.selection` / `editTargets.cursor` / `editTargets.document` を渡す
確認項目:
- selection / cursor / document の区別が分かりやすいか
- large buffer でも `contentTruncated` / `selectionTruncated` が機能するか
- active editor から persisted note への handoff が自然か

Phase D: Semantic / index
1. `get_semantic_index_status` を実行する
2. `refresh_semantic_index` を実行する
3. 再度 `get_semantic_index_status` を実行する
4. `semantic_search_notes` を再実行する
確認項目:
- `ready` の semantics が分かりやすいか
- `pendingCount` と `modelReady` が矛盾しないか
- refresh 後も結果が bounded か

Phase E: Compatibility / failure
1. `read_note.anchor` を JSON string で渡す
2. `edit_note.target` を JSON string で渡す
3. `edit_note.change` を JSON string で渡す
4. 存在しない note に `read_note` と `delete_note` を試す
5. path escape を試す
6. `no active editor` の状態を確認する
7. invalid range / invalid anchor を試す
確認項目:
- schema と client の渡し方が噛み合うか
- `NOT_FOUND` / `VALIDATION` / `CONFLICT` が明確か
- `plugin_unavailable` に潰されすぎていないか

Phase F: Text-only probe
1. 各 tool の `content[0].text` だけを見て次の一手が分かるか確認する
2. structuredContent を見なくても作業を継続できるか確認する

最終報告フォーマット:
- 総合結果: PASS / FAIL
- discovery 結果
- read/edit 結果
- active editor 結果
- semantic/index 結果
- compatibility/failure 結果
- text-only probe 結果
- 問題があれば再現手順、入力、実際の出力、推定原因
- 残タスク
```
