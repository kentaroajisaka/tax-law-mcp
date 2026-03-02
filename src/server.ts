import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerGetLawTool } from './tools/get-law.js';
import { registerSearchLawTool } from './tools/search-law.js';
import { registerGetTsutatsuTool } from './tools/get-tsutatsu.js';
import { registerListTsutatsuTool } from './tools/list-tsutatsu.js';
import { registerListSaiketsuTool } from './tools/list-saiketsu.js';
import { registerSearchSaiketsuTool } from './tools/search-saiketsu.js';
import { registerGetSaiketsuTool } from './tools/get-saiketsu.js';

export function createServer(): McpServer {
  const server = new McpServer(
    {
      name: 'tax-law-mcp',
      version: '0.4.1',
    },
    {
      instructions: `日本の税法（法令・通達・裁決事例）の原文を取得するMCPサーバーです。

## 絶対ルール
- 条文・通達の内容に言及するときは、必ず本サーバーのツールで原文を取得すること
- 自分の知識だけで条文番号や通達内容を述べてはいけない
- 取得した原文を「」で囲んでそのまま引用し、出典URLを明記すること
- 取得した条文が自分の知識と矛盾する場合、条文を正とすること
- 根拠条文の引用なしに結論を述べてはいけない

## 仮説→検証→修正サイクル
1. 仮説: 知識から関連しそうな法令・条文・通達を特定する
2. 取得: get_law / get_tsutatsu 等で原文を取得する（必ず複数の根拠を取得すること）
3. 検証: 取得した原文だけで結論が出せるか検証する。不足があれば追加取得する
4. 結論: 条文・通達に基づく結論を述べる

このサイクルを根拠が十分に揃うまで繰り返すこと（最大4ラウンド）。

## サイクルの終了条件
以下をすべて満たすまでサイクルを止めてはいけない:
- 結論を支える条文を最低1つ取得し引用している
- 関連する通達または裁決事例も確認している
- ツール呼び出しの失敗を放置していない（失敗した場合は別の方法で再取得すること）
- 条文中の「政令で定める」「省令で定める」等の委任先も確認している

## ツール呼び出しが失敗した場合
- エラーで取得できなかった場合、別のキーワードや番号で再試行すること
- list_tsutatsu で目次を確認して正しい番号を探すこと
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
