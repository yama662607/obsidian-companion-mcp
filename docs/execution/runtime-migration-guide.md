# Runtime 安定化の移行ガイド

## 対象範囲

本ガイドは runtime 安定化変更に伴う移行影響をまとめたものです。

## API / 応答の変更点

1. plugin availability を起動時 handshake で確定するようになりました。
2. editor 系ツールの応答に degraded と degradedReason が含まれます。
3. note / metadata 系応答に degradedReason が含まれます。
4. search_notes_semantic 応答に indexStatus メタ情報が含まれます。
5. ノート系ツールは create/get/update/delete/update_metadata の単機能分割へ変更されました。
6. `search_notes_semantic` の match は全文ではなく `excerpt` を返します。
7. `insert_at_cursor` / `replace_range` はデフォルトで全文 `content` を返さず、軽量な mutation 確認 payload を返します。
8. `list_notes` / `move_note` / `get_index_status` が追加されました。

## 互換性メモ

1. manage_note / manage_metadata は廃止されました。
2. 破壊操作は delete_note を利用してください。
3. semantic の空結果は indexStatus.ready を見て解釈してください。
4. semantic のヒット本文が必要な場合は `get_note` を呼んでください。
5. editor mutation 後に全文が必要な場合は `get_active_context` を呼んでください。

## クライアント更新手順

1. create_note / get_note / update_note_content / delete_note / update_note_metadata に呼び出しを置き換える。
2. `list_notes` を discovery 起点、`get_note` を詳細取得に使うフローへ更新する。
3. `search_notes_semantic.matches[*].excerpt` を候補確認に使い、全文依存を避ける。
4. editor mutation の後続で全文が必要なら `get_active_context` を追加で呼ぶ。
5. degradedReason を参照してリカバリ分岐を実装する。
6. semantic 再試行前に `get_index_status` または `indexStatus.pendingCount` を確認する。

## ロールアウト推奨順

1. startup handshake 有効版 mcp をデプロイする。
2. Companion 単体 E2E を実行する。
3. Dual MCP E2E を実行して証跡を残す。
4. release-gate 方針に従って go/no-go 判定を行う。
