# エージェント向け Runtime レビュー依頼プロンプト

このファイルは、obsidian-companion-mcp を搭載したエージェントに対し、
Runtime と MCP 公開契約をレビュー依頼するためのテンプレートです。

ソースコードを読めないエージェント向けには、
`docs/execution/agent-runtime-review-request-prompt-mcp-only.md` を使用してください。

## 推奨テンプレート（そのまま貼り付け可）

以下をそのままエージェントに渡してください。

---

あなたは TypeScript 製 MCP サーバーのシニアレビュアーです。
対象リポジトリは obsidian-companion-mcp です。

レビュー目的:
公開前の最終品質確認として、MCP公開契約（Tools/Resources/Prompts）と
ランタイム挙動（handshake/degraded/fallback）に重大な欠陥がないことを確認する。

レビュー対象:
1. mcp の tool/resource/prompt 公開面
2. runtime 接続と degraded 動作
3. note/metadata/semantic の整合
4. テスト・ドキュメントと実装の一致

必須チェック項目:
1. Tool 設計
- 1ツール1責務か
- 名前が意図ベースか
- inputSchema が厳密か（z.object、enum、limit境界）
- annotations（readOnlyHint/destructiveHint/idempotentHint）が妥当か
- 結果が text + structuredContent の二段構えか

2. Runtime 設計
- 起動時 handshake が実行されるか
- degradedReason が機械可読で返るか
- fallback が silent failure を起こさないか
- NOT_FOUND/VALIDATION/INTERNAL の契約が一貫しているか

3. Note / Metadata / Semantic
- update と delete が semantic index に正しく反映されるか
- metadata round-trip が崩れないか
- index 未準備とヒット0件を区別できるか

4. Resource / Prompt 整合
- 読み取り専用情報が Resource に分離されているか
- Prompt が現行ツール名に追従しているか
- 定数一元管理（TOOL_NAMES/RESOURCE_URIS/PROMPT_NAMES）と実装が一致するか

5. テストと実装整合
- scripts/implementation の期待値が現行実装と一致しているか
- 追加が必要な回帰テストがあるか

実施方法:
1. まず read-only で調査する
2. 問題があれば証拠（ファイル・行）を示す
3. 最小差分の修正案を示す
4. 必要なら追加テスト案を示す

出力フォーマット（必須）:
1. Findings（重大度順: High, Medium, Low）
- 各 finding に以下を含める
	- タイトル
	- 根拠（ファイルと行番号）
	- 再現条件
	- 影響
	- 最小修正案
	- 追加テスト案
2. Open Questions / Assumptions
3. 即時対応すべき上位3件
4. 結論（現状で release 可否: GO / NO-GO）

制約:
- 推測ではなくコード根拠ベースで記述する
- 破壊的変更を提案する場合は移行案も併記する
- 指摘がない場合は「No findings」を明記し、残留リスクだけ述べる

---

## MCP Prompt 呼び出し版

MCP Prompt を直接使う場合は以下を使ってください。

- name: workflow_agent_runtime_review
- arguments:
	- scope: mcp runtime + MCP contract
	- severityThreshold: medium

推奨 scope 例:
- mcp tool/resource/prompt surface
- degraded and fallback runtime behavior
- note metadata semantic consistency

## レビュー依頼時の添付推奨

1. docs/execution/runtime-review-findings-2026-03-16.md
2. scripts/implementation/mcp-runtime.e2e.test.mjs
3. scripts/implementation/scenarios.test.mjs
4. mcp/src/server.ts
5. mcp/src/domain/noteService.ts
6. mcp/src/domain/editorService.ts
