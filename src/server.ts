import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerGetLawTool } from './tools/get-law.js';
import { registerSearchLawTool } from './tools/search-law.js';
import { registerGetTsutatsuTool } from './tools/get-tsutatsu.js';
import { registerListTsutatsuTool } from './tools/list-tsutatsu.js';
import { registerListSaiketsuTool } from './tools/list-saiketsu.js';
import { registerSearchSaiketsuTool } from './tools/search-saiketsu.js';
import { registerGetSaiketsuTool } from './tools/get-saiketsu.js';

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'tax-law-mcp',
    version: '0.4.0',
  });

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
