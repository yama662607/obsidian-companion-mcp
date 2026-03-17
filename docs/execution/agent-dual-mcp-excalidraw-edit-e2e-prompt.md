# エージェント向け Dual MCP Excalidraw 編集E2Eプロンプト

このテンプレートは、Obsidian Companion MCP と Obsidian Excalidraw MCP を同時利用し、
「Excalidraw が実際に編集できるか」をブラックボックスで検証するためのものです。

## 目的

- Excalidraw MCP に書き込み系 capability があるかを特定する
- 書き込みがある場合、実編集 -> 検証 -> 復元までをE2Eで確認する
- Companion 側ノート参照と図編集の整合を確認する

## 事前条件

- Companion と Excalidraw で同一の OBSIDIAN_VAULT_PATH を使う
- テスト対象の .excalidraw.md ファイルを1つ用意する
- 失敗時に復元できるよう、編集前スナップショットを保存する

## コピペ用プロンプト

以下をそのままエージェントに渡してください。

---

あなたは Dual MCP の E2E テスターです。
目的は Excalidraw の「編集可能性」を証明することです。

制約:
1. ソースコード参照禁止
2. MCP の観測結果のみを根拠にする
3. 断定不能は Unknown
4. 本番ファイルを壊さないよう、必ず復元手順を実施する

テスト対象:
- testDrawingPath: 6_Excalidraw/test.excalidraw.md
- markerText: E2E_EDIT_MARKER_20260317

Phase 0: Preflight
1. 両MCPを再起動し新規セッションを作成
2. listTools/listResources/listPrompts を両方で取得
3. runtime://status と fallback://behavior を取得

Phase 1: 編集 capability 判定
1. Excalidraw MCP の tool 一覧から、書き込み候補を抽出
2. 判定基準:
- annotations.destructiveHint=true
- または tool 名に update/create/insert/replace/delete/edit/apply の語を含む
3. 候補が0件なら:
- 「Excalidraw MCP は現状 read-only」と結論
- 以降の編集フェーズは Unknown 扱い

Phase 2: ベースライン取得
1. Companion: get_note(testDrawingPath)
2. Excalidraw: inspect_drawing(testDrawingPath, mode=summary)
3. Excalidraw: inspect_drawing(testDrawingPath, mode=elements)
4. 上記3つのレスポンスを baseline として保存

Phase 3: 実編集テスト（候補ツールがある場合のみ）
1. 候補の中で最も限定的な変更ができる tool を1つ選ぶ
2. 次のいずれかの最小変更を実施:
- 既存テキスト要素末尾へ markerText を追記
- 新規テキスト要素を1つ追加（内容 markerText）
- メタデータに markerText を追加
3. 実行後、すぐに以下で検証:
- Companion get_note(testDrawingPath)
- Excalidraw inspect_drawing summary/elements
4. markerText が観測できることを確認

Phase 4: 復元テスト
1. 可能なら同じ書き込み系 tool で markerText を削除
2. 不可なら baseline へ戻す操作を行う
3. 復元後に再取得:
- Companion get_note
- Excalidraw inspect_drawing summary/elements
4. baseline と差分がないことを確認

Phase 5: エラー契約
1. 存在しない filePath で Excalidraw tool を実行
2. 不正入力（mode不正、空path等）を実行
3. isError / structuredContent.code / structuredContent.message を確認

Phase 6: クロス整合
1. Companion でノート本文を取得
2. Excalidraw summary/elements と突合
3. 以下の矛盾を確認:
- 要素数の矛盾
- 参照名の不一致
- 更新後に stale な summary が返る

出力フォーマット（必須）:
1. Findings（High/Medium/Low）
2. Unknowns
3. Top 3 Actions
4. 結論
- EDITABLE_GO: 編集と復元が成功
- READONLY_GO: read-only だが契約通り
- NO_GO: 編集失敗または復元失敗でリスクあり

各 Finding には以下を含める:
1. タイトル
2. 根拠ログ（tool名、入力、出力要点）
3. 影響
4. 最小修正案

品質ルール:
1. UI表示のみを根拠にしない
2. raw payload 優先
3. 復元確認が取れない場合は NO_GO

---

## 期待される判定の読み方

- EDITABLE_GO:
  - Excalidraw MCP で実編集でき、検証と復元が完了
- READONLY_GO:
  - 書き込み系 tool は無いが、read-only 契約として一貫
- NO_GO:
  - 編集後に不整合、または復元不能で運用リスクあり

## 補足

- 既存の包括テストは [docs/execution/agent-dual-mcp-test-request-prompt.md](docs/execution/agent-dual-mcp-test-request-prompt.md) を使用
- 実機運用手順は [docs/execution/agent-dual-mcp-review-playbook.md](docs/execution/agent-dual-mcp-review-playbook.md) を参照
