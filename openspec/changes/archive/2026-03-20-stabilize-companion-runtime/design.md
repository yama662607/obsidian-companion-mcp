## Context

現在の Companion 実装は「MCP surface は提供できるが、plugin 実体との接続が未完成なため多くの処理が fallback に退避する」状態にある。実機レビューでは以下を再現した。

- `manage_note` が常に `degraded: true` を返す。
- `manage_metadata` 実行後に `manage_note read` へ frontmatter 反映が見えない。
- `semantic_search` がノート作成直後に空配列を返す。
- `get_active_context` が実エディタではなく bridge 内状態を返す。

制約:

- 既存の MCP ツール名は極力維持し、互換性を壊さない。
- stdio framing 安全性（stdout 汚染禁止）を維持する。
- plugin 不通時 fallback は維持するが、理由を明示する。

ステークホルダー:

- エンドユーザー: Obsidian 上で実際に編集・検索できること。
- エージェント利用者: 応答の意味（normal/degraded）を判断可能であること。
- メンテナ: 失敗要因を再現・診断可能であること。

## Goals / Non-Goals

**Goals:**

- bridge 起動時の plugin 接続状態を deterministic にする。
- editor/note/metadata/semantic の連携経路を実体接続ベースへ修正する。
- degraded 応答の理由と回復条件を structured に返す。
- E2E 検証（Obsidian app + MCP agent）をリリース前ゲートに組み込む。

**Non-Goals:**

- 新規大機能の追加（例: 新しい MCP ドメイン機能）。
- Excalidraw MCP 側の実装変更。
- クラウド依存サービスへの移行。

## Decisions

### 1) 起動時 handshake を接続前提条件にする
- `runServer` 初期化時に plugin handshake を実行し、availability を `normal|degraded|unavailable` へ遷移。
- 代替案: lazy connect（各リクエスト初回接続）
- 不採用理由: 最初のユーザー操作で失敗が遅延顕在化し、診断難度が上がる。

### 2) EditorService を plugin pass-through 優先に変更
- `get_active_context` / `insert_at_cursor` / `replace_range` は plugin RPC を一次系にする。
- bridge 内メモリ状態は fallback かテスト用へ限定。

### 3) metadata の round-trip 一貫性を強制
- `updateMetadata` 後の `read` で frontmatter が確認できることを要件化。
- fallback でも同等の見え方になるよう content 合成ルールを導入。

### 4) note 書き込みと semantic index をイベント連携
- note create/update 時に indexing queue へ enqueue。
- 検索不能時は空配列だけでなく状態メタ（indexing/pending）を返す。

### 5) ツール入力契約の単責務化
- `delete_note` から不要な `action`/`content` 入力を削減し、破壊操作の明確性を上げる。
- destructive ツールの description と annotation を整合させる。

### 6) degraded reason の structured 化
- `degraded: true` のみではなく `degradedReason`（例: `plugin_unavailable`, `index_pending`）を返す。

## Risks / Trade-offs

- [起動時 handshake 導入で初期遅延増加] → Mitigation: タイムアウト短縮 + 再試行上限 + 理由返却。
- [fallback と plugin 挙動の乖離] → Mitigation: 共通正規化層を設け、read 表現を一致させる。
- [schema 変更によるクライアント互換性リスク] → Mitigation: 破壊的変更は段階的に導入し、互換期間を設ける。
- [indexing 連携で負荷増加] → Mitigation: enqueue 上限・バッチ flush・遅延実行。

## Migration Plan

1. 診断強化: 接続状態・degraded reason・index 状態の可視化を先行。
2. 接続修正: startup handshake と plugin pass-through を導入。
3. データ整合: metadata round-trip と fallback content 合成を実装。
4. 検索連携: note write -> index enqueue/flush を接続。
5. 契約整理: destructive ツールの入力契約を改訂。
6. E2E 検証: Obsidian 実機 + dual MCP シナリオを通して release gate 判定。

Rollback:

- 変更を feature flag で段階有効化し、問題時は従来 fallback 優先ルートへ退避。

## Open Questions

- metadata の正規化表現を `frontmatter string` と `parsed object` のどちらを正とするか。
- semantic index flush を同期応答に含めるか、非同期状態返却にするか。
- `delete_note` 入力契約の変更を即時適用するか、互換モードを挟むか。
- plugin 側 API key 供給経路をユーザー設定化するか。
