# Runtime 安定化の移行ガイド

## 対象範囲

本ガイドは runtime 安定化変更に伴う移行影響をまとめたものです。

## API / 応答の変更点

1. plugin availability を起動時 handshake で確定するようになりました。
2. editor 系ツールの応答に degraded と degradedReason が含まれます。
3. note / metadata 系応答に degradedReason が含まれます。
4. semantic_search 応答に indexStatus メタ情報が含まれます。
5. delete_note は path のみ受け取る入力契約に変更されました。

## 互換性メモ

1. 互換維持のため、manage_note の delete action は引き続き利用できます。
2. 破壊操作は delete_note を優先してください。
3. semantic の空結果は indexStatus.ready を見て解釈してください。

## クライアント更新手順

1. delete_note 入力スキーマを path-only へ更新する。
2. degradedReason を参照してリカバリ分岐を実装する。
3. semantic 再試行前に indexStatus.pendingCount を確認する。

## ロールアウト推奨順

1. startup handshake 有効版 bridge をデプロイする。
2. Companion 単体 E2E を実行する。
3. Dual MCP E2E を実行して証跡を残す。
4. release-gate 方針に従って go/no-go 判定を行う。
