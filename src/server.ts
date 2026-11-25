import { createRequire } from 'node:module';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerGetLawTool } from './tools/get-law.js';
import { registerSearchLawTool } from './tools/search-law.js';
import { registerGetTsutatsuTool } from './tools/get-tsutatsu.js';
import { registerListTsutatsuTool } from './tools/list-tsutatsu.js';
import { registerListSaiketsuTool } from './tools/list-saiketsu.js';
import { registerSearchSaiketsuTool } from './tools/search-saiketsu.js';
import { registerGetSaiketsuTool } from './tools/get-saiketsu.js';

const { version } = createRequire(import.meta.url)('../package.json') as { version: string };

export function createServer(): McpServer {
  const server = new McpServer(
    {
      name: 'tax-law-mcp',
      version,
    },
    {
      instructions: `日本の税法（法令・通達・裁決事例）の原文を取得するMCPサーバーです。

## 絶対ルール
- 条文・通達の内容に言及するときは、必ず本サーバーのツールで原文を取得すること
- 自分の知識だけで条文番号や通達内容を述べてはいけない
- 取得した原文を「」で囲んでそのまま引用し、出典URLを明記すること
- 取得した条文が自分の知識と矛盾する場合、条文を正とすること
- 根拠条文の引用なしに結論を述べてはいけない

## 作業手順（Todoを出力しながら進めよ）
回答する際は、以下のTodoリストを出力し、各ステップを順に実行せよ。

1. **仮説の整理と根拠条文の特定**
   - 知識から関連しそうな法令・条文・通達を特定する
   - 調査計画を箇条書きで出力する

2. **条文・通達・裁決事例を並行取得する（ラウンド1）**
   以下を並行して実行する:
   a. 仮説で特定した法令名・条文番号で get_law / get_tsutatsu 等を呼び出し原文を取得する
   b. WebSearchで関連する通達・判例・裁決事例の番号や名称を検索する
   c. WebSearchで新たに特定した法令は search_law で実在を確認し、get_law で原文を取得する
   ※ search_law は精度が低いため、法令の発見にはWebSearchを優先せよ
   ※ WebSearchの結果を鵜呑みにせず、必ず本サーバーのツールで原文を取得すること

3. **終了条件チェック（不足があれば追加取得→ラウンド2…最大4ラウンド）**
   以下を1つずつ確認し、結果を箇条書きで出力せよ。未達の項目があれば追加取得してから再チェックせよ。
   - [ ] 結論を支える条文を最低1つ取得し引用しているか
   - [ ] 関連する通達または裁決事例も確認したか
   - [ ] ツール呼び出しの失敗を放置していないか
   - [ ] 条文中の「政令で定める」「省令で定める」等の委任先も確認したか
   たとえ1ラウンド目で結論が出せると感じても、上記チェックをすべて満たすまでサイクルを止めるな。

4. **回答前に終了条件の充足を出力して最終確認する**
   上記チェック結果をすべて ✅ にした上で回答に進め。

5. **結論を回答する**
   条文・通達に基づく結論を述べる。取得した原文を「」で囲んでそのまま引用し、出典URLを明記すること。

## 本サーバーで取得できないデータ
- 判例・裁判例は本サーバーの対象外である
- これらはWebSearch / WebFetch で補完すること。ただし下記「一次情報と二次情報の区別」ルールに従うこと

## 一次情報と二次情報の区別
本サーバーのツールで取得した原文は「一次情報」、WebSearch / WebFetch で得た情報は「二次情報」である。
回答では必ず両者を明確に区別して表示せよ。

### 表示ルール
- 一次情報: 「」で囲んで引用し、出典URLを明記（従来通り）
- 二次情報: 以下の形式で表示すること
  ⚠️ 二次情報（本サーバーで原文取得不可）
  内容: （WebSearchで得た情報の要約）
  情報源: （URLまたは検索クエリ）
  信頼度: （政府系サイト→高 / 法律事務所等の解説→中 / 個人ブログ等→低）
- 結論が二次情報のみに依拠する場合は、その旨を明示し「原文未確認のため参考情報」と注記すること
- 一次情報と二次情報が矛盾する場合は、一次情報を正とすること

## ツール呼び出しが失敗した場合
- エラーで取得できなかった場合、別のキーワードや番号で再試行すること
- list_tsutatsu で目次を確認して正しい番号を探すこと
- 本サーバーのツールで2回空振りした場合は、WebSearchで通達名・番号を特定し、特定できた情報で本サーバーのツールを再試行すること
- WebSearchで特定した情報もWebFetchで原文を取得し、本サーバーのツールの結果と照合すること
- 取得失敗を放置して結論を述べてはいけない`,
    },
  );

  // 法令ツール（e-Gov API v2）
  registerGetLawTool(server);       // get_law: 条文取得
  registerSearchLawTool(server);    // search_law: 法令キーワード検索

  // 通達ツール（NTAスクレイピング）
  registerGetTsutatsuTool(server);  // get_tsutatsu: 通達取得
  registerListTsutatsuTool(server); // list_tsutatsu: 通達目次表示

  // 裁決事例ツール（KFSスクレイピング）
  registerListSaiketsuTool(server);   // list_saiketsu: 税目・カテゴリ一覧
  registerSearchSaiketsuTool(server); // search_saiketsu: キーワード検索
  registerGetSaiketsuTool(server);    // get_saiketsu: 裁決全文取得

  return server;
}
