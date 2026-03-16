# Runtime Review Findings - 2026-03-16

## 概要

obsidian-companion-mcp bridge のランタイム実装に関するコードレビュー結果。
レビュー範囲: ツール公開面、ランタイム接続と degraded 動作、resource/prompt の整合性。

**レビュー日**: 2026-03-16
**レビューア**: Claude (MCP TypeScript Best Practices)
**対象バージョン**: commit e969dce

---

## 修正済み（High 1-3）

以下の3件は既に修正され、`just check` 通過済み。

### ✅ High-1: PluginClient.connect() の制御フロー修正
**ファイル**: `bridge/src/infra/pluginClient.ts:40-87`

**問題**: `while + 即return` で `retry_exhausted` 遷移に到達しない。

**対応**: `for attempt` ベースに変更し、リトライロジックが正しく動作するように修正。

---

### ✅ High-2: metadata round-trip/frontmatter整合性の改善
**ファイル**: `bridge/src/infra/fallbackStorage.ts:8-66`

**問題**: CRLF非対応、frontmatter除去不完全、文字列スカラーがYAMLとして不正。

**対応**:
- `detectEol()` で CRLF/LF 判定
- 正規表現ベースの frontmatter 除去
- `quoteYamlString()` で安全な文字列レンダリング

---

### ✅ High-3: semantic index状態の曖昧さ解消
**ファイル**: `bridge/src/domain/semanticService.ts:44-54`, `bridge/src/tools/semanticSearch.ts:22-28`

**問題**: index 未準備と一致0件の区別ができない。

**対応**:
- `indexStatus.isEmpty` を追加
- summary を3状態で明確化

---

## 対応結果（Medium/Low）

本レビューで指摘された Medium/Low は、以下の通りすべて実装反映済み。

1. M-1: `delete_note` の NOT_FOUND 契約を明確化
2. M-2: `replace_range` degraded 時の全文上書きを廃止
3. M-3: ToolResult 型の厳密化（`DomainErrorCode` 連携）
4. M-4: ツール名の一元管理（`TOOL_NAMES`）
5. L-1: `positionSchema` 重複解消
6. L-2: `insertText` 位置バリデーション強化
7. L-3: IndexingQueue 重複ジョブ置換
8. L-4: semantic search を STUB 実装として明示
9. M-5: metadata `invalid` 特殊キー判定の撤去
10. L-5: Prompt 引数処理の明確化（style fallback）
11. L-6: 不適切な `idempotentHint` の削除
12. L-7: Resource URI の定数一元管理

加えて、Prompt 名も `PROMPT_NAMES` / `PROMPT_NAME_LIST` で一元管理済み。

---

## 追加テスト実施結果

追加・更新した主要テスト:

1. `delete_note` の NOT_FOUND E2E
2. `replace_range` degraded 安全性の実装検査
3. naming constants（tool/resource/prompt）の実装検査
4. capability matrix の一元参照検査

実行結果:

- `just check` 通過
- `scripts/implementation/*.test.mjs` 全件 pass
- execution quality gates pass

---

## 現在の残課題（次回レビュー対象）

重大度の高い未解決は現時点でなし。次回は拡張改善を対象とする。

1. EmbeddingProvider の本実装（semantic STUB から移行）
2. Resource URI スキーム戦略の再設計（統一 vs 意味分離）
3. Prompt の業務テンプレート拡充
4. integration coverage の追加拡張
5. 公開契約のバージョニング方針明確化

---

## 参考ドキュメント

- MCP TypeScript Best Practices: `/Users/daisukeyamashiki/.claude/skills/mcp-bestpractice-typescript`
- エージェント向け Runtime レビュー依頼プロンプト: `docs/execution/agent-runtime-review-request-prompt.md`
