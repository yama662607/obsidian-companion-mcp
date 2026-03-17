# Runtime 安定化の移行ガイド

## 対象範囲

本ガイドは runtime 安定化変更に伴う移行影響をまとめたものです。

## API / 応答の変更点

1. plugin availability を起動時 handshake で確定するようになりました。
2. editor 系ツールの応答に degraded と degradedReason が含まれます。
3. note / metadata 系応答に degradedReason が含まれます。
4. search_notes_semantic 応答に indexStatus メタ情報が含まれます。
5. ノート系ツールは create/get/update/delete/update_metadata の単機能分割へ変更されました。

## 互換性メモ

1. manage_note / manage_metadata は廃止されました。
2. 破壊操作は delete_note を利用してください。
3. semantic の空結果は indexStatus.ready を見て解釈してください。

## クライアント更新手順

1. create_note / get_note / update_note_content / delete_note / update_note_metadata に呼び出しを置き換える。
2. degradedReason を参照してリカバリ分岐を実装する。
3. semantic 再試行前に indexStatus.pendingCount を確認する。

## ロールアウト推奨順

1. startup handshake 有効版 mcp をデプロイする。
2. Companion 単体 E2E を実行する。
3. Dual MCP E2E を実行して証跡を残す。
4. release-gate 方針に従って go/no-go 判定を行う。
