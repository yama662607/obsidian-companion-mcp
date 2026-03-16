# エージェント向け Runtime レビュー依頼プロンプト

以下をそのままエージェントに渡してください。

---

あなたはMCPサーバーのレビュアーです。以下の要件でレビューしてください。

対象:
- bridge のツール公開面
- runtime の接続と degraded 動作
- resource / prompt の整合

レビュー観点:
1. ツール設計
- 1ツール1責務になっているか
- 名前が意図ベースで分かりやすいか
- inputSchema が厳密で、危険操作は最小入力になっているか
- annotations が適切か

2. ランタイム設計
- 起動時 handshake が明確に実行されるか
- degradedReason が機械可読で返るか
- fallback 動作が silent failure になっていないか

3. 検索・整合性
- ノート更新と semantic index が接続されているか
- metadata 更新が read round-trip で反映されるか
- index 未準備と一致0件を区別できるか

4. Resource / Prompt
- 読み取り専用情報が resource に適切に分離されているか
- ワークフロー誘導が prompt に適切に置かれているか
- ツール名変更が prompt と docs に反映されているか

出力形式:
- 重大度順に列挙（High / Medium / Low）
- 各指摘に再現条件、影響、最小修正案を含める
- ファイルと行番号を必ず示す
- 最後に「即時対応すべき上位3件」を提示する

追加条件:
- 推測ではなくコード根拠ベースで書く
- 破壊的変更が必要なら互換移行案も書く
- テスト不足があれば、追加すべきテスト名と観点を提案する

---

補足:
- MCP上で prompt を使う場合は workflow_agent_runtime_review を呼び出し、scope と severityThreshold を指定してください。
