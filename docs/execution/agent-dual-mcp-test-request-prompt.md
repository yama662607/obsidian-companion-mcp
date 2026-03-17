# エージェント向け Dual MCP テスト依頼プロンプト

このテンプレートは、以下2つの MCP を同時利用する実運用テストを依頼するためのものです。

- Obsidian Companion MCP
- Obsidian Excalidraw MCP

## 事前設定（エージェント側 MCP 設定例）

```json
{
  "mcpServers": {
    "obsidian-companion": {
      "command": "npx",
      "args": [
        "-y",
        "@yama662607/obsidian-companion-mcp"
      ],
      "env": {
        "OBSIDIAN_VAULT_PATH": "/absolute/path/to/YourVault"
      }
    },
    "obsidian-excalidraw": {
      "command": "npx",
      "args": [
        "-y",
        "@yama662607/obsidian-excalidraw-mcp"
      ],
      "env": {
        "OBSIDIAN_VAULT_PATH": "/absolute/path/to/YourVault"
      }
    }
  }
}
```

重要: 2つの MCP で同一の `OBSIDIAN_VAULT_PATH` を使ってください。異なる値だと Companion で作成したノートを Excalidraw 側で参照できません。

## コピペ用プロンプト

```text
あなたは MCP ブラックボックステスターです。
Obsidian Companion MCP と Obsidian Excalidraw MCP を同時に使い、
ノートと図の整合性を公開前観点で検証してください。

制約:
1. ソースコードを読まない
2. MCP の list/read/call で観測できる情報のみ根拠にする
3. 推測を禁止し、観測不能は Unknown に分類する

Preflight:
1. MCP サーバーを再起動し、新規セッションを作成
2. listTools / listResources / listPrompts を両 MCP で取得
3. 取得結果をテストベースラインとして保存

Phase A: Companion 単体健全性
1. callTool(get_active_context)
2. callTool(search_notes_semantic, { query: "protocol", limit: 5 })
3. create_note -> get_note -> delete_note の往復を実行
4. エラー系を確認（missing note 取得/削除時）
確認ポイント:
- isError と structuredContent.code/message の整合
- degraded/degradedReason の有無
- noActiveEditor と editorState の意味整合

Phase B: Excalidraw 単体健全性
1. Excalidraw MCP の主要 read/list 系ツールを実行
2. .excalidraw.md 図の取得・解析が可能か確認
3. 図メタデータ/要素参照の返却構造を確認
確認ポイント:
- エラー応答が構造化されているか
- read 操作が readOnly 的挙動になっているか

Phase C: ノートと図のクロス整合
1. Companion で対象ノートを収集（設計要素、コンポーネント名、関係性）
2. Excalidraw で対応図を取得
3. 以下の不整合を抽出:
- 命名不一致
- ノートにはあるが図にない要素
- 図にはあるがノートで廃止済みの要素
- 関係線や依存方向の矛盾
4. 可能なら修正優先順位を High/Medium/Low で付与

Phase D: 再現性チェック
1. 同じ問い合わせを2回実行し、構造が安定するか確認
2. 可能なら別キーワードでも同手順を実行して再現性を見る

出力フォーマット（必須）:
1. Findings（High / Medium / Low）
- タイトル
- 根拠（MCP 呼び出し名、入力、出力要点）
- 影響
- 最小修正案
2. Unknowns（観測不能項目）
3. Top 3 Actions
4. GO / NO-GO 判定（理由付き）

品質ルール:
- UI 表示だけで断定しない。raw payload を優先する。
- 断定できない内容は Findings に入れない。
- 指摘ゼロでも residual risk を明示する。
```

## 補足

- Companion 側の MCP-only ランタイム契約レビューには
  `docs/execution/agent-runtime-review-request-prompt-mcp-only.md` も併用してください。
- 実運用フロー全体は
  `docs/execution/agent-dual-mcp-review-playbook.md` を参照してください。
