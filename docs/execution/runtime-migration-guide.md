# Runtime Tool Surface 移行ガイド

## 対象範囲

本ガイドは final MCP tool surface への移行影響をまとめたものです。

## API / 応答の変更点

1. discovery/read/edit の workflow を中心に tool surface を再編しました。
2. `search_notes_semantic` は `semantic_search_notes` に変わり、chunk-level の discovery 結果を返します。
3. `get_note` は `read_note` に変わり、`editTarget` を返します。
4. `get_active_context` は `read_active_context` に変わり、`editTargets` を返します。
5. `update_note_content` / `insert_at_cursor` / `replace_range` は `edit_note` に統合されました。
6. `update_note_metadata` は `patch_note_metadata` に変わりました。
7. `get_index_status` は `get_semantic_index_status` に変わりました。
8. 全 public tool は `outputSchema` を公開します。

## 互換性メモ

1. `manage_note` / `manage_metadata` は廃止済みです。
2. semantic の結果は discovery 用です。詳細本文は `read_note` で取得してください。
3. active editor の編集前には `read_active_context` を呼び、返却された target を `edit_note` に渡してください。
4. persisted note の編集前には `read_note` を呼び、返却された `editTarget` を `edit_note` に渡してください。
5. metadata 更新は引き続き `patch_note_metadata` を使います。

## クライアント更新手順

1. `get_note` を `read_note` に置き換える。
2. `get_active_context` を `read_active_context` に置き換える。
3. `search_notes_semantic` を `semantic_search_notes` に置き換える。
4. `update_note_content` / `insert_at_cursor` / `replace_range` の呼び出しは `edit_note` に統合する。
5. `update_note_metadata` を `patch_note_metadata` に置き換える。
6. `get_index_status` を `get_semantic_index_status` に置き換える。
7. `read_* -> edit_note` の handoff に合わせてクライアントフローを更新する。

## ロールアウト推奨順

1. startup handshake 有効版 mcp をデプロイする。
2. Companion 単体 E2E を実行する。
3. Dual MCP E2E を実行して証跡を残す。
4. release-gate 方針に従って go/no-go 判定を行う。
