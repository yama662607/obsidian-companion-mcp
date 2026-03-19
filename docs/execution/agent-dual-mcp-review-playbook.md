# Obsidian実機試験 + Dual MCPレビュー実践ガイド

このドキュメントでは以下を説明します。

1. Obsidianアプリで本プラグインを実際に使って試す手順
2. 2つのMCPを使ってエージェントにレビューしてもらう観点
   - Obsidian Companion MCP
   - Obsidian Excalidraw MCP
3. 両方のMCPを使うためのエージェント設定ファイル例

## 0. 前提と重要ポイント

- このリポジトリには Companion のプラグイン本体と mcp が含まれます。
- Excalidraw MCP は兄弟プロジェクトで、併用できます。
- Companion で MCP サーバーとして動くのは「plugin本体」ではなく「mcp」です。

つまり、次の整理になります。

- plugin: Obsidianアプリ内で常駐して動く
- mcp: MCPサーバーとしてエージェントから起動される

そのため、npx で設定する対象は plugin ではなく mcp です。

## 1. Obsidianアプリでの実機試験手順

### 1.1 ビルドとVaultへの導入

リポジトリのルートで実行します。

```bash
just setup
just plugin-install-local /absolute/path/to/YourVault
just mcp-build
```

### 1.2 Obsidianで有効化

1. 同じVaultでObsidianを開く
2. Settings -> Community plugins を開く
3. Community plugins が無効なら有効化
4. plugin companion-mcp を有効化
5. Obsidianを1回再起動

### 1.3 Vaultの試験データ準備

最低限、以下を用意します。

- 関連するMarkdownノートを3件以上
- frontmatter付きノートを1件以上
- Dual MCPレビューを行う場合は .excalidraw.md を1件以上

### 1.4 スモークチェック

- プラグイン有効化時に明確なエラーが出ない
- 通常のノート編集が継続して可能
- エージェント側で Companion ツール群が見える

## 2. エージェント設定ファイル例

絶対パスで記述してください。

### 2.1 ワークスペース .mcp.json の例

```json
{
  "mcpServers": {
    "obsidian-companion": {
      "command": "node",
      "args": [
        "/absolute/path/to/obsidian-companion-mcp/mcp/dist/index.js"
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

### 2.2 Companion を npx で使う場合

Companion mcp が npm 公開済みなら、次のような設定も可能です。

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
    }
  }
}
```

npx 不可なのは plugin 本体であり、mcp は公開形態次第で npx 設定できます。

### 2.3 Excalidraw をローカル実行する場合

```json
{
  "mcpServers": {
    "obsidian-excalidraw": {
      "command": "node",
      "args": [
        "/absolute/path/to/obsidian-excalidraw-mcp/dist/index.js"
      ],
      "env": {
        "OBSIDIAN_VAULT_PATH": "/absolute/path/to/YourVault"
      }
    }
  }
}
```

Companion と Excalidraw は同一の `OBSIDIAN_VAULT_PATH` を設定してください。これが一致しないと、ノートと図のクロス検証で `file not found` が発生します。

### 2.4 Companion 側で確認したいツール名

以下が見えれば、mcp の登録は概ね成功です。

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

表示されない場合は以下を確認してください。

- just mcp-build を実行済みか
- 設定ファイルの mcp パスが存在するか
- エージェント側で MCP サーバーを再読み込みしたか

## 3. Dual MCPレビューで試すべきこと

以下の順で進めると、ノートと図の往復レビューがしやすくなります。

### 3.1 レビューA: ノート品質レビュー

目的:

- 意味的な重複、矛盾、欠落を洗い出す
- 重要度付きで修正優先順位を得る

プロンプト例:

```text
Vault内の設計ノートをレビューしてください。
Companion MCPで関連ノートを検索し、search -> read の流れで重複・矛盾・不足セクションを指摘してください。
重要度 High/Medium/Low で分類し、最後に修正提案を TODO 形式で出してください。
```

### 3.2 レビューB: ノートと図の整合レビュー

目的:

- Markdown説明と Excalidraw 図の差分を発見
- 命名ズレ、要素欠落、古い関係線を特定

プロンプト例:

```text
Companion MCPで plugin-mcp protocol 関連ノートを検索して read_note で読み、
Excalidraw MCPで対応する .excalidraw.md 図を確認して、
不整合（命名差分、欠落コンポーネント、古い関係線）を一覧化してください。
必要なら図の更新案も提案してください。
```

### 3.3 レビューC: 修正計画の具体化

目的:

- 指摘を実際の編集手順へ落とす
- 小さな差分で安全に直せる状態にする

プロンプト例:

```text
直前のレビュー結果をもとに、
1) 先に直すべき3点
2) 各修正の対象ファイル
3) 期待される差分の要約
を出してください。
可能なら Companion MCPで read_note の edit target を使った本文修正、Excalidraw MCPで図修正の順に提案してください。
```

## 4. 完了判定チェックリスト

- Obsidianアプリで plugin を有効化できる
- エージェントで Companion MCP と Excalidraw MCP の両方が起動する
- ノート検索と図レビューを横断して実行できる
- 重要度付きのレビュー結果が再現できる
- 修正案がファイル単位で提示される

## 5. トラブルシュート

- mcp が見つからない
  - just mcp-build を再実行
  - mcp/dist/index.js のパスを確認
- Excalidraw MCP が見つからない
  - npx -y @yama662607/obsidian-excalidraw-mcp の実行可否を確認
  - または local 実行に切り替える
- plugin が反応しない
  - Community plugins の有効化状態を再確認
  - plugin のON/OFFをやり直す
  - Obsidianを再起動する
