# エージェント向けレビュー依頼（MCPのみ版 / Excalidraw修正後）

以下は、MCP観測だけでレビューを実施するための依頼文テンプレートです。

```text
あなたは MCP ブラックボックスレビュアーです。
このレビューでは、ソースコードやローカルファイル参照を禁止し、
MCP の list/read/call 結果のみを根拠に評価してください。

目的:
1. Companion MCP の Vault 固定化（OBSIDIAN_VAULT_PATH 前提）が運用上成立しているか確認
2. APIキー簡素化後も主要機能が安定しているか確認
3. Excalidraw MCP の修正済み項目（linkedElementsCount 整合 / 構造化エラー）が維持されているか確認

制約:
1. ソースコードを読まない
2. 推測禁止
3. 観測不能は Unknown に分類
4. UI表示だけで断定しない。可能なら raw payload 優先

Preflight:
1. サーバー再起動
2. 新規セッション開始
3. listTools / listResources / listPrompts を取得
4. runtime://status と fallback://behavior を取得
5. Companion と Excalidraw が同一 OBSIDIAN_VAULT_PATH で起動している前提を確認

Phase A: Companion 基本動作
1. callTool(read_active_context, {})
2. callTool(create_note, {
   "path": "review/mcp-only-vault-test.md",
   "content": "mcp only vault test"
})
3. callTool(read_note, {"note": "review/mcp-only-vault-test.md"})
4. callTool(semantic_search_notes, {"query": "mcp only vault test", "topK": 5})
5. callTool(delete_note, {"path": "review/mcp-only-vault-test.md"})
6. callTool(read_note, {"note": "review/mcp-only-vault-test.md"})

確認項目:
- create/get/search/delete が安定
- 削除後は NOT_FOUND の構造化エラー
- isError/code/message/correlationId の整合
- degraded/degradedReason の有無と一貫性

Phase B: Vault境界と安全性
1. callTool(read_note, {"note": "../outside.md"})
2. callTool(create_note, {"path": "../outside.md", "content": "x"})

確認項目:
- Vault外参照が拒否される
- 拒否時のエラーが再現可能

Phase C: Excalidraw 連携（実ファイル検証）
前提: Vault内に実在する Excalidraw ファイル
- 例: 6_Excalidraw/test.excalidraw.md

1. Companion:
- callTool(read_note, {"note": "6_Excalidraw/test.excalidraw.md"})

2. Excalidraw:
- callTool(inspect_drawing, {"filePath": "6_Excalidraw/test.excalidraw.md", "mode": "summary"})
- callTool(inspect_drawing, {"filePath": "6_Excalidraw/test.excalidraw.md", "mode": "elements"})
- callTool(inspect_drawing, {"filePath": "6_Excalidraw/not-exists.excalidraw.md", "mode": "summary"})

確認項目:
- 同一ファイルへの到達性
- summary と elements の整合
- linkedElementsCount と実リンク要素数の整合（embeddable + link を含む）
- エラー応答が機械可読か（isError/code/message）

Phase C-2: 修正項目の回帰固定
1. Companion read_note の `## Element Links` にリンクが存在する図で、inspect_drawing(mode="summary") の linkedElementsCount が 0 にならないこと
2. inspect_drawing(filePath: not-exists) でプレーン文字列ではなく機械可読エラーが返ること

Phase D: 再現性
1. semantic_search_notes(query="protocol", topK=5) を2回
2. semantic_search_notes(query="integration testing", topK=5) を2回
3. inspect_drawing(同一入力) を10回

確認項目:
- 返却キー集合の安定性
- エラー形式の揺れがないか

出力フォーマット（必須）:
1. Findings（High / Medium / Low）
- タイトル
- MCP観測根拠（呼び出し、入力、出力要点）
- 影響
- 最小修正案

2. Unknowns
- 観測できない理由
- 追加で必要な観測手段

3. Top 5 Actions
- 優先順位付き

4. 最終判定
- GO / CONDITIONAL GO / NO-GO
- 判定理由（3-5行）

判定基準:
- High >= 1: NO-GO
- Medium のみ: CONDITIONAL GO
- Low のみ or 指摘なし: GO

今回の期待値:
- M-1（linkedElementsCount 不整合）は再発していない
- L-1（非構造化エラー）は再発していない

品質ルール:
- 推測禁止
- 再現不能指摘を Findings に載せない
- 「payloadにあるがUIに見えない」場合は注記扱い
```
