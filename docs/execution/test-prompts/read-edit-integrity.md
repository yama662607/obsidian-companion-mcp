# Read / Edit Integrity 実機テスト Prompt

この prompt は、`read_note` / `read_active_context` / `edit_note` の handoff と編集の安全性を確認します。

```text
Obsidian Companion MCP の read/edit 実機テストを行ってください。

目的:
- `read_note` の返り値が次の `edit_note` にそのまま使えるか確認する
- `read_active_context` の返り値が active editor 編集にそのまま使えるか確認する
- 全文置換、部分置換、追記、前置、文字列置換の差が自然か確認する

前提:
- 実行対象は最新 build / 最新 plugin
- テスト用ノートだけを編集する
- 既存ノートを壊さない

手順:
1. `create_note` でテストノートを作る
   - `1_Inbox/Read-Edit-Integrity.md`
   - frontmatter と複数 heading を含める
2. `read_note` を以下で試す
   - `anchor: full`
   - `anchor: frontmatter`
   - `anchor: heading`
   - `anchor: block`
   - `anchor: line`
3. `read_note` の `editTarget` をそのまま `edit_note` に渡して編集する
4. `edit_note` で以下を試す
   - `replaceTarget`
   - `replaceText`
   - `append`
   - `prepend`
5. `patch_note_metadata` を試す
6. `read_active_context` を試す
   - selection がある状態
   - selection がない状態
   - no active editor の状態
7. `read_active_context` の `editTargets.selection` / `cursor` / `document` を `edit_note` に渡して編集する

評価ポイント:
- `read_note` から `edit_note` へ迷いなく進めるか
- `read_active_context` から `edit_note` へ迷いなく進めるか
- nested object が文字列化されずに渡せるか
- `contentTruncated` / `selectionTruncated` がある場合でも次の行動が分かるか
- `revision` / `currentText` / conflict の扱いが安全か

追加で確認すること:
- JSON string 化した `anchor` / `target` / `change` でも動くか
- invalid range / invalid anchor / stale revision が明確に失敗するか
- `edit_note` の返り値だけで次の確認ができるか

最終報告フォーマット:
- 総合結果: PASS / FAIL
- read_note 評価
- read_active_context 評価
- edit_note 評価
- patch_note_metadata 評価
- active editor 編集評価
- compatibility 評価
- 再現例
```
