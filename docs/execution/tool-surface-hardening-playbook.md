# MCP Tool Surface Hardening Playbook

このドキュメントは、MCP ツールの設計・実装・レビューで「動くのに使いにくい」「特定クライアントでだけ壊れる」「旧データでだけ壊れる」問題を早期に炙り出すための実践ガイドです。

対象:

- MCP server maintainers
- plugin / bridge maintainers
- runtime reviewer
- release owner

## 1. 基本原則

### 1.1 コードではなくフローを設計する

最初に確認するべきことは「内部実装がきれいか」ではなく、以下の主導線が自然かです。

1. search
2. read
3. edit
4. verify

ツールの返り値は、次のツール入力にそのままつながる必要があります。

### 1.2 正常系より境界条件を疑う

本番で壊れやすいのは次です。

- text-only client
- nested object を JSON string で渡す client
- 旧 version が保存した persisted state
- partially refreshed index
- plugin 一時不通
- large vault / large note / large payload

### 1.3 degraded は曖昧な成功にしない

`degraded: true` だけでは不十分です。最低限次を返します。

- `degraded`
- `degradedReason`
- fallback したか
- recovery hint があるならその情報

### 1.4 refresh / sync / rebuild の名前は完了 semantics と一致させる

`refresh_*` が「開始だけ」で終わるなら、名前か返り値を変える必要があります。

## 2. 設計レビュー checklist

各ツールごとに、以下を上から順に確認します。

- [ ] ツールの primary intent は 1 つか
- [ ] 名前が user workflow と一致しているか
- [ ] 入力 schema は strict object か
- [ ] limit / topK / maxPerNote / maxChars などの bounded field があるか
- [ ] 結果 payload は bounded か
- [ ] 検索ツールが全文や巨大 blob を返していないか
- [ ] read ツールが follow-up edit に必要な handoff を返しているか
- [ ] write ツールが read-back / revision / warning を返しているか
- [ ] error が success payload に埋め込まれていないか
- [ ] degraded reason が machine-readable か
- [ ] legacy data / old persisted state を読んでも壊れないか
- [ ] text-only client でも最低限使える text summary があるか
- [ ] structured client でも schema discovery が壊れないか
- [ ] plugin failure を過度に `plugin_unavailable` に潰していないか

## 3. テスト戦略テンプレート

各ツール群は、最低限この 5 層で検証します。

### 3.1 Pure unit

対象:

- anchor 解決
- revision token
- exact text replace
- pagination cursor
- snippet truncation
- degraded reason mapping

見ること:

- positive path
- boundary values
- invalid input
- ambiguous input

### 3.2 Contract / schema

対象:

- `tools/list`
- `inputSchema`
- `outputSchema`
- annotation

見ること:

- public tool names
- legacy tool names が消えているか
- required fields が見えているか
- nested object schema が client から discoverable か

### 3.3 Compatibility

対象:

- text-only client
- JSON-stringified nested args
- legacy saved state
- stale plugin state

最低限必要なケース:

- `read_note.anchor` を JSON string で渡す
- `edit_note.target` / `change` を JSON string で渡す
- semantic index の旧保存形式を load する
- plugin 側 `NOT_FOUND` から fallback 成功する

### 3.4 Isolated E2E

対象:

- `npx` / `node dist/index.js`
- mock plugin
- isolated vault

見ること:

- handshake
- tool discovery
- search -> read -> edit
- fallback path
- refresh / status consistency

### 3.5 Real-agent review

対象:

- 実際の agent runtime
- 実 vault
- real client rendering

見ること:

- 迷わず次のツールを選べるか
- text summary だけでも進行できるか
- docs を見なくても schema から理解できるか
- results が大きすぎて agent が読めなくなっていないか

## 4. 改善点を炙り出すループ

リリース前だけでなく、機能追加ごとに次の順で確認します。

1. **Tool list review**
   - 名前と責務の重なりを確認
2. **Text-only probe**
   - `content[0].text` だけで使えるか確認
3. **Structured probe**
   - `tools/list` で nested schema が見えるか確認
4. **Legacy-state probe**
   - 旧 index / 旧 config / 旧 plugin を読む
5. **Large-payload probe**
   - 巨大 note / huge semantic result で上限を確認
6. **Fallback probe**
   - plugin failure -> fallback success の意味が正しく出るか確認
7. **Real-agent review**
   - 開発者以外の agent に task を実行させる

## 5. よくある failure pattern

### 5.1 StructuredContent は正しいが、text summary が弱い

兆候:

- ツール自体は成功する
- しかし agent が「何が返ったか分からない」と言う

対処:

- `content[0].text` に bounded, actionable summary を入れる
- 次の一手に必要な `readHint` / `editTarget` を text にも出す

### 5.2 New-path tests は通るが legacy data で壊れる

兆候:

- fresh vault では pass
- 実運用 vault でだけ payload が巨大化する、shape が違う

対処:

- load path に legacy migration test を足す
- persisted format の backward-compatibility を明示的に管理する

### 5.3 refresh が完了 semantics を持っていない

兆候:

- `refresh_*` の直後に `pendingCount > 0`
- `ready=false`
- しかし UI / text では「完了」に見える

対処:

- 完了まで flush する
- もしくは `start_*` に改名する
- status tool と必ずセットでテストする

### 5.4 degraded reason が雑で原因が見えない

兆候:

- 何でも `plugin_unavailable`
- 実際は `NOT_FOUND`, `CONFLICT`, stale state, fallback success などが混在

対処:

- fallback 前の plugin failure を保持する
- `plugin_not_found_fallback_used` のような reason を導入する

## 6. この repo の release 前必須 probe

- `tools/list` を live `npx` で確認
- text-only client probe
- JSON-stringified nested args probe
- legacy semantic index probe
- `refresh_semantic_index` -> `get_semantic_index_status` consistency probe
- search -> read -> edit happy path
- fallback move / delete / read probe
- real-agent review

## 7. GO 条件

以下を満たさない限り GO にしません。

- `just check` pass
- contract / schema / annotation checks pass
- isolated E2E pass
- legacy compatibility probe pass
- real-agent review で High issue が 0
- release gate evidence 更新済み
