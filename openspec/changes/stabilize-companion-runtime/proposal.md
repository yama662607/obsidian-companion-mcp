## Why

実機レビューで、Companion MCP の主要ツールが期待どおりに plugin 実体と連携せず、常時 degraded 応答・メタデータ非反映・semantic_search 空結果が発生することを確認した。運用前に bridge-plugin 実行経路を再設計し、ツールの契約を実利用レベルで安定化する必要がある。

## What Changes

- bridge 起動時に plugin handshake を必須化し、接続状態を明示管理する。
- editor 系ツールを bridge 内メモリ状態ではなく plugin のアクティブエディタ状態に連携する。
- note/metadata の fallback 実装を仕様化し、`degraded` の意味と理由を機械可読で返す。
- metadata 更新結果が read 結果に反映される round-trip 一貫性を定義する。
- note 更新系と semantic indexing を接続し、検索可能状態への遷移を保証する。
- ツール定義の責務境界を見直し、`delete_note` など単機能ツールの入力契約を整理する。
- Obsidian アプリ + agent + dual MCP（Companion/Excalidraw）での E2E 検証計画を追加する。

## Capabilities

### New Capabilities
- `runtime-e2e-validation`: Obsidian 実機、agent 設定、MCP 呼び出しを通した運用前検証要件を定義する。

### Modified Capabilities
- `plugin-bridge-protocol`: 起動時接続判定、ハンドシェイク失敗時の可観測性、availability 遷移を厳密化する。
- `editor-context-operations`: 実エディタ連携を必須化し、ダミー状態返却を許容しない。
- `note-metadata-management`: metadata 書き込みと read 反映の整合、および degraded 理由返却を定義する。
- `semantic-vault-search`: note 操作とインデクシング連携、検索不能状態の明示返却を定義する。
- `mcp-interface-modeling`: 単責務ツール入力契約（特に destructive 系）と structured error 方針を強化する。

## Impact

- Affected code: `bridge/src/server.ts`, `bridge/src/infra/pluginClient.ts`, `bridge/src/domain/*`, `bridge/src/tools/*`, `plugin/src/main.ts`。
- Affected APIs: MCP tools (`get_active_context`, `manage_note`, `manage_metadata`, `semantic_search`, `delete_note`) と plugin RPC (`editor.*`, `notes.*`, `metadata.update`)。
- Dependencies/systems: Obsidian plugin runtime、MCP SDK stdio transport、fallback storage、index queue。
- Operational impact: degraded 応答の意味が厳密化され、E2E 検証とリリース判断が定量化される。
