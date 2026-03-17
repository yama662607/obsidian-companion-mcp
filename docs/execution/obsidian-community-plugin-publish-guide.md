# Obsidian Community Plugin 公開ガイド

このガイドは、このリポジトリの plugin を Obsidian Community Plugins へ公開するための
実務手順をまとめたものです。

対象:

- 初回掲載
- 既存掲載後のアップデート

## 1. 事前条件

- GitHub リポジトリが公開状態
- GitHub Releases を作成できる権限
- npm 公開とは独立した作業であることを理解している
  - Community Plugin 配布は GitHub Release アセットが正

## 2. バージョン整合ルール

公開前に次の3ファイルを必ず一致させる:

1. plugin/package.json の version
2. plugin/manifest.json の version
3. plugin/versions.json のキー

例: 0.1.2 を公開する場合

- package.json: 0.1.2
- manifest.json: 0.1.2
- versions.json: {"0.1.2": "1.5.0"}

## 3. リリースアセット生成

リポジトリルートで実行:

```bash
just plugin-release-prepare
```

生成物:

- dist/plugin-release/main.js
- dist/plugin-release/manifest.json
- dist/plugin-release/versions.json
- dist/plugin-release/styles.css（存在する場合のみ）

## 4. ローカル実機確認

対象Vaultへ導入して起動確認:

```bash
just plugin-install-local /absolute/path/to/YourVault
```

確認項目:

1. Community plugins で有効化できる
2. Obsidian 再起動後も有効状態を維持
3. 起動エラーが出ない
4. Companion MCP と接続できる

## 5. GitHub Release 作成

1. タグを作成（例: 0.1.2）
2. Release タイトルと本文を作成
3. 次を添付:
   - main.js
   - manifest.json
   - versions.json
   - styles.css（存在する場合）

重要:

- タグ名と manifest.json の version は一致させる
- 既存タグの上書きは避ける

## 6. Community Plugins 申請（初回）

対象: obsidianmd/obsidian-releases

community-plugins.json に次の形式で追加提案する:

```json
{
  "id": "companion-mcp",
  "name": "Companion MCP",
  "author": "yama662607",
  "description": "Enables AI agents to use MCP tools for semantic vault search and editor actions via the companion MCP server.",
  "repo": "yama662607/obsidian-companion-mcp"
}
```

PR 前チェック:

1. id が manifest.json の id と一致
2. repo が公開リポジトリを指す
3. 最新 Release に必要アセットがある

## 7. 掲載後アップデート運用

1. 新バージョン作成
2. 本ガイドの 2-5 を実施
3. Community Plugins 側の再申請は通常不要
   - 同一 repo の新しい Release が配布ソースになる

## 8. 失敗時の切り分け

- プラグインが更新されない
  - versions.json のキーが新versionになっているか確認
  - Release に versions.json が添付されているか確認
- インストール時エラー
  - manifest.json の id/version/minAppVersion を確認
  - main.js が添付されているか確認
- 認識されない
  - community-plugins.json の id と manifest id の一致確認

## 9. このリポジトリでの推奨公開フロー

1. コード修正
2. just check
3. version 整合（package/manifest/versions）
4. just plugin-release-prepare
5. just plugin-install-local で実機確認
6. GitHub Release 作成とアセット添付
7. 初回のみ obsidian-releases に PR
