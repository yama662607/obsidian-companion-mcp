# エージェント向け MCP レビュー依頼プロンプト（release 0.1.2）

このテンプレートは、MCP を利用できるエージェントに対して
release 0.1.2 の最終レビューを依頼するための実行用プロンプトです。

## 利用目的

- npm 公開後の最終確認
- MCP 公開契約（Tools / Resources / Prompts）の整合確認
- runtime 挙動とエラー契約の回帰検知
- `npx @yama662607/obsidian-companion-mcp` 起動経路の回帰検知

## そのまま使える依頼文

以下をそのままエージェントに渡してください。

---

あなたは MCP サーバー品質レビュー担当です。
対象は `@yama662607/obsidian-companion-mcp` release `0.1.2` です。

レビュー目的:
1. 公開契約（Tools / Resources / Prompts）が一貫していること
2. runtime が degraded 状態を機械可読に返すこと
3. エラーが構造化されていること
4. npx 起動経路で shebang/実行エントリの不整合が再発していないこと

前提:
1. 推測ではなく観測結果ベースで記述する
2. 可能な限り MCP 呼び出しログを根拠として添える
3. 断定できないものは Unknown に分類する

実施手順:

Phase 0: Preflight
1. `npm view @yama662607/obsidian-companion-mcp version dist-tags.latest bin --json` を取得
2. `npx -y @yama662607/obsidian-companion-mcp` を短時間実行し、起動ログを取得
3. shebang 回帰観点として、シェル解釈エラー（`line 1: //: is a directory`）が出ないことを確認

Phase 1: 公開契約ベースライン
1. `listTools`
2. `listResources`
3. `listPrompts`
4. 取得結果を契約ベースラインとして保存

Phase 2: Resource 可観測性
1. `readResource(runtime://status)`
2. `readResource(fallback://behavior)`
3. `readResource(review://checklist)`
4. degraded / availability / retryCount などの状態が説明可能か確認

Phase 3: Tool 実行シナリオ
1. `callTool(get_active_context)`
2. `callTool(search_notes_semantic, { query: "release smoke", limit: 3 })`
3. `callTool(create_note, ...)`
4. `callTool(update_note_metadata, ...)`
5. `callTool(get_note, ...)`
6. `callTool(delete_note, ...)`

Phase 4: エラー契約
1. 存在しない path で `get_note`
2. 存在しない path で `delete_note`
3. 不正引数で editor/note 系ツール
4. `isError`, `structuredContent.code`, `structuredContent.message` の有無確認

Phase 5: Prompt 整合
1. `getPrompt(workflow_search_then_insert, ...)`
2. `getPrompt(workflow_context_rewrite, ...)`
3. `getPrompt(workflow_agent_runtime_review, ...)`
4. Prompt 文面中の tool/resource 名が実在名と一致するか確認

出力フォーマット（必須）:
1. Findings（High / Medium / Low）
2. Unknowns
3. Top 3 Actions
4. Release 判定（GO / NO-GO）

各 Finding には以下を含める:
1. タイトル
2. 根拠ログ（呼び出し、入力、出力要点）
3. 影響
4. 最小修正案
5. 追加テスト案

---

## 実行時メモ

- release 0.1.2 では CLI エントリの shebang 回帰が最重要確認項目です。
- shebang 回帰が再発した場合は NO-GO とし、公開成果物を再作成してください。
- 問題なしの場合は GO 判定に加えて residual risk を 1-3 件記載してください。
