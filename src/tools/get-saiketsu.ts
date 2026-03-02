import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getSaiketsu } from '../lib/services/saiketsu-service.js';

export function registerGetSaiketsuTool(server: McpServer) {
  server.tool(
    'get_saiketsu',
    '国税不服審判所の裁決事例の全文を取得する。URLまたは事例集番号+事例番号で指定。search_saiketsuの検索結果から全文を読む場合に使用。',
    {
      url: z.string().optional().describe(
        '裁決事例のURL。例: "https://www.kfs.go.jp/service/JP/139/01/index.html" または パス "/service/JP/139/01/index.html"'
      ),
      collection_no: z.number().int().min(1).optional().describe(
        '裁決事例集の番号。例: 139（case_noと併用）'
      ),
      case_no: z.number().int().min(1).optional().describe(
        '事例番号。例: 1（collection_noと併用）'
      ),
    },
    async (args) => {
      try {
        const result = await getSaiketsu({
          url: args.url,
          collectionNo: args.collection_no,
          caseNo: args.case_no,
        });

        const header = result.fullText.date
          ? `# 裁決事例（${result.fullText.date}裁決）`
          : '# 裁決事例';

        return {
          content: [{
            type: 'text' as const,
            text: `${header}\n\n${result.fullText.body}\n\n---\n出典：国税不服審判所ホームページ（公表裁決事例）\nURL: ${result.fullText.url}`,
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: 'text' as const,
            text: `エラー: ${error instanceof Error ? error.message : String(error)}`,
          }],
          isError: true,
        };
      }
    }
  );
}
