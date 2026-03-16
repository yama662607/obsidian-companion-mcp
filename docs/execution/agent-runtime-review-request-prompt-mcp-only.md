# エージェント向け Runtime レビュー依頼プロンプト（MCPのみ版）

このファイルは、ソースコードにアクセスできず、MCPで公開された
Tools / Resources / Prompts のみを利用可能なエージェント向けの
レビュー依頼テンプレートです。

## 前提

- あなたはソースコードやリポジトリファイルを読めません。
- 利用できる情報源は MCP で取得できるものだけです。
- 推測ではなく、取得したレスポンスを根拠にレビューしてください。

## 推奨テンプレート（そのまま貼り付け可）

以下をそのままエージェントに渡してください。

---

あなたは MCP サーバーのブラックボックスレビュアーです。
このレビューではソースコード参照を禁止し、MCP経由の観測結果のみで評価してください。

目的:
公開前の最終確認として、MCP 公開契約とランタイム品質をブラックボックス視点で検証する。

制約:
1. ソースコードを読まない
2. ファイルパスや実装詳細を前提にしない
3. すべての指摘に MCP 観測ログを添える

レビュー実行フロー:

Phase 0: セッション初期化
1. listTools / listResources / listPrompts を実行
2. それぞれの結果を「契約ベースライン」として保存
3. 取得不能な API がある場合は即座に Unknown として記録

Phase 1: 公開契約の静的点検（MCPメタ情報）
1. 全 Tool の description / inputSchema / annotations を点検
2. readOnly/destructive/idempotent の矛盾を検出
3. Resource URI と mimeType の一貫性を点検
4. Prompt 名・引数仕様を点検
5. Annotation は以下のキー名で厳密確認する
- readOnlyHint
- destructiveHint
- idempotentHint

Phase 2: Runtime 可観測性の動作点検
1. readResource(runtime://status) を実行
2. readResource(fallback://behavior) を実行
3. readResource(review://checklist) を実行
4. degraded / availability / retryCount など可観測状態の有無を確認

Phase 3: Tool の実行シナリオ点検
以下を順番に実行し、入力と出力要点をログ化する:
1. 読み取り系シナリオ
- callTool(get_active_context)
- callTool(search_notes_semantic, { query, limit })
2. Note 操作シナリオ
- callTool(create_note)
- callTool(update_note_metadata)
- callTool(get_note)
- callTool(delete_note)
3. エラー系シナリオ
- 存在しない note に対する delete_note
- 不正入力での editor / note tool
- isError と structuredContent.code の返却確認
- 可能なら raw JSON-RPC payload を保存し、UI表示との乖離を確認

Phase 4: Prompt 整合シナリオ点検
1. getPrompt(workflow_search_then_insert, args) を実行
2. getPrompt(workflow_context_rewrite, args) を実行
3. getPrompt(workflow_agent_runtime_review, args) を実行
4. prompt 文面が実在する tool/resource 名を参照しているか確認

Phase 5: 整合性クロスチェック
1. capability resource の公開一覧と listTools/listResources/listPrompts を突合
2. state 語彙（degradedReason/noActiveEditor/indexStatus）が一貫しているか確認
3. structuredContent の形が呼び出し間で安定しているか確認

Phase 6: 誤検知防止の再判定
1. 「アノテーション欠如」を指摘する前に、raw response で annotations を再確認
2. 「構造化エラー欠如」を指摘する前に、raw response で isError / structuredContent を再確認
3. UIに見えないが payload に存在する場合は Finding ではなく注記にする
4. 観測手段不足で断定できない場合は必ず Unknown に分類する

出力フォーマット（必須）:
1. Findings（重大度順: High / Medium / Low）
- 各 finding に以下を含める
  - タイトル
  - MCP観測根拠（呼び出し名、入力、出力要点）
  - 再現手順（実行順付き）
  - 影響
  - 最小修正案
2. Unknowns（コード非参照ゆえに断定不可な点）
3. 即時対応すべき上位3件
4. 結論（GO / NO-GO）

品質ルール:
1. 推測禁止、観測ログ優先
2. 観測できないことは Unknown と明記
3. 指摘がない場合でも residual risk を明記
4. 再現不能な指摘は Findings に載せない
5. UI表示のみを根拠にしない（raw response 優先）

---

## 実行補助（推奨）

MCP Prompt が使える場合:

- name: workflow_agent_runtime_review
- arguments:
  - scope: mcp-only black-box runtime contract review
  - severityThreshold: medium

その後、以下の順序で追加実行して証拠を補強:

1. listTools
2. listResources
3. listPrompts
4. readResource(runtime://status)
5. readResource(fallback://behavior)
6. readResource(review://checklist)
7. getPrompt(workflow_agent_runtime_review, { scope, severityThreshold })
8. callTool(search_notes_semantic)
9. callTool(get_active_context)

## 注意

このテンプレートは「実装品質そのもの」ではなく、
「公開契約としての妥当性と運用時の安全性」を評価するためのものです。
実装内部の欠陥を網羅するには、別途ソースコードレビュー版テンプレートを併用してください。
