# Obsidianプラグイン公開前テスト手順

このドキュメントは、公開前に必要なアセット準備と実機導入確認の最短手順をまとめたランブックです。

Community Plugin の正式公開手順（GitHub Release作成、obsidian-releases申請、
version整合ルール）は次を参照してください。

- docs/execution/obsidian-community-plugin-publish-guide.md

## 1. 公開アセットの準備

リポジトリルートで実行します。

```bash
just plugin-release-prepare
```

出力先（想定）:

- dist/plugin-release/main.js
- dist/plugin-release/manifest.json
- dist/plugin-release/versions.json
- dist/plugin-release/styles.css（存在する場合のみ）

## 2. 実機導入テスト（ローカルVault）

対象Vaultへプラグインを導入します。

```bash
just plugin-install-local /absolute/path/to/YourVault
```

その後、Obsidianアプリで以下を確認します。

1. Settings -> Community plugins を開く
2. Community plugins が無効なら有効化
3. companion-mcp がインストール一覧にあり、有効化できる
4. 有効化して Obsidian を再起動する
5. 期待動作を確認する
   - 起動時エラーが出ない
   - エディタ関連機能が利用できる
   - mcp から接続できる

## 3. 公開前チェック

GitHub Release 作成前に確認します。

- plugin/manifest.json の version が x.y.z 形式
- GitHub Release の tag が manifest.json の version と完全一致
- Release 添付ファイルが main.js / manifest.json / styles.css（任意）
- plugin公開用リポジトリのルートにも manifest.json がある

## 4. Obsidianコミュニティ公開

初回公開アセットを出した後、community plugins へ申請します。

- obsidianmd/obsidian-releases の community-plugins.json にエントリ追加
- Bot 検証とレビュー待ち
- 指摘があれば同じPRと同じRelease系統で更新

## 5. エージェント試験とDual MCPレビュー

Obsidian実利用手順、Companion + Excalidraw を併用したレビューシナリオ、MCP設定例は次を参照してください。

- docs/execution/agent-dual-mcp-review-playbook.md
