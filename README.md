# tax-law-mcp

日本の税法・通達・裁決事例を取得する MCP サーバー。

Claude が税務の質問に回答する際、**条文や通達のハルシネーションを防止**するために、e-Gov法令APIおよび国税庁サイトから原文を取得して裏取りさせます。

## 特徴

- **法令取得** — e-Gov法令API v2 から条文をMarkdown形式で取得
- **法令検索** — キーワードで法令を横断検索
- **通達取得** — 国税庁サイトから基本通達・措置法通達をスクレイピング（17通達対応）
- **通達目次** — 通達の章・節構造を一覧表示
- **裁決事例** — 国税不服審判所（kfs.go.jp）の公表裁決事例1,950件を検索・取得
- **Shift_JIS対応** — 国税庁・国税不服審判所サイトの文字エンコーディングに対応
- **主要税法プリセット** — 所得税法・法人税法・消費税法・措置法等のlaw_idをハードコード
- **略称対応** — 「所法」「措法」「所基通」「措通（譲渡）」等の略称で指定可能

## MCP ツール

| ツール | 説明 |
|---|---|
| `get_law` | e-Gov法令APIから条文を取得。法令名 + 条番号で指定 |
| `search_law` | キーワードで法令を検索 |
| `get_tsutatsu` | 国税庁サイトから通達を取得。通達名 + 通達番号で指定 |
| `list_tsutatsu` | 通達の目次を表示 |
| `list_saiketsu` | 裁決事例の税目・カテゴリ一覧を表示 |
| `search_saiketsu` | キーワードで裁決事例を検索（1,950件から） |
| `get_saiketsu` | 裁決事例の全文を取得 |

## 対応法令（プリセット）

所得税法、法人税法、消費税法、相続税法、租税特別措置法、国税通則法、国税徴収法、各施行令・施行規則 等（24法令）

## 対応通達（17通達）

### 基本通達

| 通達名 | 略称 |
|--------|------|
| 所得税基本通達 | 所基通 |
| 法人税基本通達 | 法基通 |
| 消費税法基本通達 | 消基通 |
| 相続税法基本通達 | 相基通 |
| 財産評価基本通達 | 評基通 |
| 連結納税基本通達 | — |
| 国税通則法基本通達 | 通法基通 |
| 印紙税法基本通達 | 印基通 |
| 税理士法基本通達 | 税理士通達 |
| 国税徴収法基本通達 | 徴基通 |
| 酒税法基本通達 | 酒基通 |

### 措置法通達

| 通達名 | 略称 |
|--------|------|
| 措置法通達（山林所得・譲渡所得関係） | 措通（譲渡） |
| 措置法通達（申告所得税関係） | 措通（申告） |
| 措置法通達（法人税編） | 措通（法人税） |
| 措置法通達（相続税関係） | 措通（相続税） |
| 措置法通達（源泉所得税関係） | 措通（源泉） |
| 措置法通達（株式等譲渡所得等関係） | 措通（株式） |

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

自前のVercelにデプロイすれば、チームメンバーはインストール不要で利用できます:

```bash
vercel deploy
```

```json
{
  "mcpServers": {
    "tax-law": {
      "url": "https://<your-deployment>.vercel.app/mcp"
    }
  }
}
```

## REST API（v0.4.0〜）

MCP に加えて、REST API エンドポイントも提供しています。Custom GPT (ChatGPT) の Actions や、Gemini、その他のAIツールから利用できます。

### エンドポイント一覧

| エンドポイント | 説明 |
|---|---|
| `GET /api/get-law` | 条文取得（`law_name`, `article` 必須） |
| `GET /api/search-law` | 法令検索（`keyword` 必須） |
| `GET /api/get-tsutatsu` | 通達取得（`tsutatsu_name`, `number` 必須） |
| `GET /api/list-tsutatsu` | 通達目次（`tsutatsu_name` 必須） |
| `GET /api/list-saiketsu` | 裁決税目一覧（パラメータなし or `tax_type`） |
| `GET /api/search-saiketsu` | 裁決検索（`keyword` 必須） |
| `GET /api/get-saiketsu` | 裁決全文（`url` or `collection_no`+`case_no`） |

### 使用例

```bash
# 所得税法第33条を取得
curl "https://<your-domain>/api/get-law?law_name=所得税法&article=33"

# キーワードで法令検索
curl "https://<your-domain>/api/search-law?keyword=インボイス"

# 通達を取得
curl "https://<your-domain>/api/get-tsutatsu?tsutatsu_name=所基通&number=33-6"
```

### Custom GPT での利用

1. Vercel にデプロイ（`vercel deploy`）
2. `openapi.yaml` の `servers.url` をデプロイ先URLに書き換え
3. Custom GPT の「Actions」→「Schema」に `openapi.yaml` の内容を貼り付け
4. GPT に「所得税法33条を教えて」と聞くと、API で条文を取得して根拠付きで回答

### OpenAPI 仕様書

`openapi.yaml` に OpenAPI 3.1 仕様書が含まれています。Custom GPT の Actions や Swagger UI でそのまま使えます。

## 使い方の例（MCP）

### 条文の取得

> 「所得税法第33条を取得して」

→ `get_law(law_name="所得税法", article="33")`

### 通達の取得

> 「所得税基本通達33-6を取得して」

→ `get_tsutatsu(tsutatsu_name="所基通", number="33-6")`

### 措置法通達の取得

> 「措置法通達（譲渡）の33-8を取得して」

→ `get_tsutatsu(tsutatsu_name="措通（譲渡）", number="33-8")`

### 裁決事例の検索

> 「重加算税に関する裁決事例を探して」

→ `search_saiketsu(keyword="重加算税")`

### 裁決事例の全文取得

> 「裁決事例集第139集の1番を読みたい」

→ `get_saiketsu(collection_no=139, case_no=1)`

### 税目別の裁決事例一覧

> 「所得税関係の裁決事例のカテゴリを見せて」

→ `list_saiketsu(tax_type="所得税")`

### ハルシネーション防止ワークフロー

1. Claude が税務の質問に仮回答を作成
2. 引用した条文・通達を `get_law` / `get_tsutatsu` で取得
3. 実際の原文と仮回答を照合し、誤りがあれば修正
4. 2-3 を収束するまで繰り返す（最大4ラウンド）

## 裁決事例（v0.3.0〜）

国税不服審判所（kfs.go.jp）の公表裁決事例（97冊・1,950件）を検索・取得できます。

### 対応税目（13税目）

国税通則法関係、所得税法関係、法人税法関係、相続税法関係、消費税法関係、地価税法関係、登録免許税法関係、印紙税法関係、揮発油税法関係、自動車重量税法関係、国税徴収法関係、租税特別措置法関係、たばこ税法関係

### 検索の仕組み

- 事例集目次ページ（97冊分）をスクレイピングし、要旨テキストからキーワード検索
- 初回は全ページ取得（30-60秒）、以降はキャッシュ利用（TTL 1時間）
- `latest` パラメータで検索範囲を最新N冊に絞ることも可能

## 出典

- 法令: [e-Gov法令検索](https://laws.e-gov.go.jp/)（デジタル庁）
- 通達: [国税庁ホームページ](https://www.nta.go.jp/)
- 裁決事例: [国税不服審判所ホームページ](https://www.kfs.go.jp/)

通達の利用は[国税庁コンテンツの利用について](https://www.nta.go.jp/chuijiko/copy.htm)に基づきます。

## 参考

- [takurot/egov-law-mcp](https://github.com/takurot/egov-law-mcp) — XML→Markdown変換、ツール設計を参考にしました
- [e-Gov法令API v2](https://laws.e-gov.go.jp/api/2/swagger-ui) — API仕様

## ライセンス

MIT
