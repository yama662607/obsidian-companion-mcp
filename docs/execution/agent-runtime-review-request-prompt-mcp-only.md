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

Preflight: バージョン固定
1. MCPサーバーを最新ビルドで再起動する
2. 既存セッション/キャッシュを破棄して新規接続する
3. 取得した runtime://status を証跡として保存する

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

Phase 7: Semantic Correctness 検証（内容妥当性）
1. create_note で一意文字列を含むノートを作成する
2. get_note で内容が一致することを確認する
3. search_notes_semantic で一意文字列検索し、作成ノートがヒットすることを確認する
4. delete_note で削除後、get_note が NOT_FOUND になることを確認する
5. get_active_context の値が意味的に妥当かを確認する
- noActiveEditor=false なら cursor は content の行範囲内
- noActiveEditor=true なら矛盾する editor 情報を返さない

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

## 再レビュー依頼テンプレート（詳細版）

以下は、修正後の再検証を依頼する時にそのまま使えるメッセージです。

```text
再レビューをお願いします。今回は「応答形式」だけでなく
「応答内容が実際に正しいか（semantic correctness）」まで検証してください。

前提:
1. ソースコード非参照（MCP-only）
2. 最新ビルドで再起動後、新規セッションで実施
3. UI表示ではなく raw JSON-RPC payload を根拠にする
4. 断定不能は Unknown に分類する

Preflight（必須）:
1. サーバー再起動
2. セッション/キャッシュ破棄
3. runtime://status 取得（証跡保存）
4. capability://matrix 取得（公開契約ベースライン保存）

A. 構造検証（形式）
1. get_note(path: missing)
2. delete_note(path: missing)
3. insert_at_cursor(invalid position)
確認項目:
- isError
- structuredContent.code
- structuredContent.message
- content.text が JSON error envelope として解釈可能か

B. 内容妥当性検証（意味）
1. create_note（一意 marker を含む）
2. get_note で内容一致確認
3. search_notes_semantic で作成ノートがヒットするか確認
4. delete_note 実行
5. get_note が NOT_FOUND になるか確認
6. get_active_context 実行
- noActiveEditor=false の場合:
  - cursor.line >= 0
  - cursor.ch >= 0
  - cursor.line < content の行数
- noActiveEditor=true の場合:
  - エラーにせず状態が一貫していること

C. 一貫性検証
1. search_notes_semantic 応答に degraded/degradedReason があるか
2. capability://matrix の公開名と list 結果が一致するか
3. destructiveHint/readOnlyHint/idempotentHint の観測可否（不可なら Unknown）

出力:
1. Findings（High/Medium/Low）
2. Unknowns
3. Top 3 Actions
4. GO / NO-GO（根拠付き）
```
