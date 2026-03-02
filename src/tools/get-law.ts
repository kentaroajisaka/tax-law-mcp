import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getLawArticle, getLawToc } from '../lib/services/law-service.js';

export function registerGetLawTool(server: McpServer) {
  server.tool(
    'get_law',
    '日本の法令から特定の条文を取得する。e-Gov法令API v2を使用。略称にも対応（所法→所得税法、措法→租税特別措置法 等）。',
    {
      law_name: z.string().describe(
        '法令名または略称。例: "所得税法", "法人税法", "租税特別措置法", "所法", "措法", "所得税法施行令", "所令"'
      ),
      article: z.string().describe(
        '条文番号。例: "33", "33の2", "57の3", "第33条"'
      ),
      paragraph: z.number().optional().describe(
        '項番号（省略時は条文全体）。例: 1, 2'
      ),
      item: z.number().optional().describe(
        '号番号（省略時は項全体）。例: 1, 2'
      ),
      format: z.enum(['markdown', 'toc']).optional().describe(
        '出力形式。"markdown"=条文全文（デフォルト）, "toc"=目次のみ（トークン節約）'
      ),
    },
    async (args) => {
      try {
        if (args.format === 'toc') {
          const result = await getLawToc({ lawName: args.law_name });
          return {
            content: [{
              type: 'text' as const,
              text: `# ${result.lawTitle} — 目次\n\n${result.toc}\n\n---\n出典：e-Gov法令検索（デジタル庁）\nURL: ${result.egovUrl}`,
            }],
          };
        }

        const result = await getLawArticle({
          lawName: args.law_name,
          article: args.article,
          paragraph: args.paragraph,
          item: args.item,
        });

        const articleDisplay = args.article.replace(/_/g, 'の');
        const paraDisplay = args.paragraph ? `第${args.paragraph}項` : '';
        const itemDisplay = args.item ? `第${args.item}号` : '';

        return {
          content: [{
            type: 'text' as const,
            text: `# ${result.lawTitle} 第${articleDisplay}条${paraDisplay}${itemDisplay}\n${result.articleCaption ? `（${result.articleCaption}）\n` : ''}\n${result.text}\n\n---\n出典：e-Gov法令検索（デジタル庁）\nURL: ${result.egovUrl}`,
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
