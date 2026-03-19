# Dual MCP Cross Review Prompt

この prompt は、Obsidian Companion MCP と Obsidian Excalidraw MCP を併用して、ノートと図の整合性を確認します。

```text
Obsidian Companion MCP と Obsidian Excalidraw MCP を同時に使い、
ノートと図の整合性をレビューしてください。

目的:
- ノートで説明されている内容と図が一致しているか確認する
- 命名、依存関係、古い説明の残骸を洗い出す
- 修正優先順位を High / Medium / Low で出す

前提:
- 2つの MCP は同じ vault を参照する
- ソースコードは読まない
- 推測ではなく MCP の観測結果だけで判断する

手順:
1. listTools / listResources / listPrompts を両 MCP で取得する
2. Companion で対象ノートを探す
   - `list_notes`
   - `search_notes`
   - `semantic_search_notes`
3. `read_note` で対象ノートを読む
4. Excalidraw 側で対応する図を読む
5. 不整合を分類する
   - 命名差分
   - 要素欠落
   - 古い関係線
   - 依存方向の矛盾
   - 用語の揺れ
6. 可能なら修正順を提案する

評価ポイント:
- Companion の read/edit ハンドオフが図の修正計画に自然につながるか
- Excalidraw 側の read が図の理解に十分か
- ノートと図の両方で同じ用語が使われているか

最終報告フォーマット:
- 総合結果: PASS / FAIL
- Companion 側の発見
- Excalidraw 側の発見
- 不整合一覧
- 修正優先順位
- 再現例
- 改善提案
```
