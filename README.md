# tax-law-mcp

日本の税法・通達を取得する MCP サーバー。

Claude が税務の質問に回答する際、**条文や通達のハルシネーションを防止**するために、e-Gov法令APIおよび国税庁サイトから原文を取得して裏取りさせます。

## 特徴

- **法令取得** — e-Gov法令API v2 から条文をMarkdown形式で取得
- **法令検索** — キーワードで法令を横断検索
- **通達取得** — 国税庁サイトから基本通達をスクレイピング（世界初のMCP対応）
- **通達目次** — 通達の章・節構造を一覧表示
- **Shift_JIS対応** — 国税庁サイトの文字エンコーディングに対応
- **主要税法プリセット** — 所得税法・法人税法・消費税法・措置法等のlaw_idをハードコード
- **略称対応** — 「所法」「措法」「所基通」等の略称で指定可能

## MCP ツール

| ツール | 説明 |
|---|---|
| `get_law` | e-Gov法令APIから条文を取得。法令名 + 条番号で指定 |
| `search_law` | キーワードで法令を検索 |
| `get_tsutatsu` | 国税庁サイトから通達を取得。通達名 + 通達番号で指定 |
| `list_tsutatsu` | 通達の目次を表示 |

## 対応法令（プリセット）

所得税法、法人税法、消費税法、相続税法、租税特別措置法、国税通則法、国税徴収法、各施行令・施行規則 等（24法令）

## 対応通達

所得税基本通達、法人税基本通達、消費税法基本通達、相続税法基本通達、財産評価基本通達、連結納税基本通達

## セットアップ

### npx（推奨）

インストール不要。以下の設定をコピペするだけ:

```json
{
  "mcpServers": {
    "tax-law": {
      "command": "npx",
      "args": ["-y", "tax-law-mcp"]
    }
  }
}
```

**Claude Desktop**: `~/Library/Application Support/Claude/claude_desktop_config.json` に追加

**Claude Code**: `claude mcp add tax-law -- npx -y tax-law-mcp`

### ローカル（ソースから）

```bash
git clone https://github.com/kentaroajisaka/tax-law-mcp.git
cd tax-law-mcp
npm install
npm run build
```

```json
{
  "mcpServers": {
    "tax-law": {
      "command": "node",
      "args": ["/path/to/tax-law-mcp/dist/index.js"]
    }
  }
}
```

### リモート（Vercel）

事務所チームメンバー向け。インストール不要:

```json
{
  "mcpServers": {
    "tax-law": {
      "url": "https://tax-law-mcp.vercel.app/mcp"
    }
  }
}
```

## 使い方の例

### 条文の取得

> 「所得税法第33条を取得して」

→ `get_law(law_name="所得税法", article="33")`

### 通達の取得

> 「所得税基本通達33-6を取得して」

→ `get_tsutatsu(tsutatsu_name="所基通", number="33-6")`

### ハルシネーション防止ワークフロー

1. Claude が税務の質問に仮回答を作成
2. 引用した条文・通達を `get_law` / `get_tsutatsu` で取得
3. 実際の原文と仮回答を照合し、誤りがあれば修正
4. 2-3 を収束するまで繰り返す（最大4ラウンド）

## 出典

- 法令: [e-Gov法令検索](https://laws.e-gov.go.jp/)（デジタル庁）
- 通達: [国税庁ホームページ](https://www.nta.go.jp/)

通達の利用は[国税庁コンテンツの利用について](https://www.nta.go.jp/chuijiko/copy.htm)に基づきます。

## 参考

- [takurot/egov-law-mcp](https://github.com/takurot/egov-law-mcp) — XML→Markdown変換、ツール設計を参考にしました
- [e-Gov法令API v2](https://laws.e-gov.go.jp/api/2/swagger-ui) — API仕様

## ライセンス

MIT
