# エージェント向けレビュー依頼（Vault固定化 + APIキー簡素化後）

このテンプレートは、今回の実装修正結果を第三者エージェントにレビューしてもらうための依頼文です。

## コピペ用レビュー依頼文

```text
あなたは MCP サーバーのブラックボックスレビュー担当です。
今回は Obsidian Companion MCP の「Vault固定化」と「APIキー簡素化」変更の妥当性を検証してください。

目的:
1. どの作業ディレクトリで起動しても、ノート操作が Vault 内で完結することを確認
2. APIキー依存が除去され、運用が簡素化されたことを確認
3. 既存の構造化エラー契約と再現性が維持されていることを確認

制約:
1. ソースコードを読まない
2. MCP 観測（list/read/call）を根拠に判定する
3. 断定不能は Unknown とする

前提:
- Companion MCP は OBSIDIAN_VAULT_PATH を env で受け取っている
- APIキー設定は不要

Preflight:
1. サーバー再起動
2. 新規セッションで listTools / listResources / listPrompts 取得
3. runtime://status と fallback://behavior を取得

Phase A: Vault固定化の検証
1. callTool(create_note, { path: "review/vault-anchor-test.md", content: "vault anchor test" })
2. callTool(read_note, { note: "review/vault-anchor-test.md" })
3. callTool(delete_note, { path: "review/vault-anchor-test.md" })
4. callTool(read_note, { note: "review/vault-anchor-test.md" }) で NOT_FOUND を確認

確認点:
- create/get/delete が成功
- 削除後は構造化 NOT_FOUND
- 応答に isError / code / message / correlationId がある

Phase B: パス安全性の検証
1. callTool(read_note, { note: "../outside.md" })
2. callTool(create_note, { path: "../outside.md", content: "x" })

確認点:
- Vault外参照が拒否される
- 拒否時に code/message が返る

Phase C: APIキー簡素化の検証
1. MCP 起動時に APIキー未設定でも稼働するか確認
2. read_active_context / semantic_search_notes / read_note が通常動作するか確認

確認点:
- 認証エラー依存の挙動が不要になっている
- 既存ツールの安定性が維持されている

Phase D: 再現性
1. semantic_search_notes(query="protocol", topK=5) を2回
2. read_active_context を2回

確認点:
- 応答構造（主要キー）が揺れない

出力フォーマット:
1. Findings（High / Medium / Low）
- タイトル
- 観測根拠（呼び出し、入力、出力要点）
- 影響
- 最小修正案
2. Unknowns
3. Top 3 Actions
4. GO / CONDITIONAL GO / NO-GO

評価基準:
- High あり: NO-GO
- Medium のみ: CONDITIONAL GO
- Low 以下のみ: GO
```

## 注意事項

- Excalidraw MCP 側の内部実装（例: summary の linkedElementsCount、エラー応答形式）は本リポジトリ外です。
- そのため本レビューは Companion MCP の実装品質と、Companion-Excalidraw の統合観測結果を分けて評価してください。
