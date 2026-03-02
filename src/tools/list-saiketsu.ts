import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { listSaiketsuTaxTypes, listSaiketsuCategories } from '../lib/services/saiketsu-service.js';

export function registerListSaiketsuTool(server: McpServer) {
  server.tool(
    'list_saiketsu',
    '国税不服審判所の公表裁決事例の税目・カテゴリ一覧を表示する。税目名を省略すると13税目の一覧を表示。税目を指定するとカテゴリ階層を表示。',
    {
      tax_type: z.string().optional().describe(
        '税目名または略称。例: "所得税法関係", "所得税", "法人税", "消費税", "相続税", "国税通則法関係", "通則法", "措置法"。省略時は税目一覧を表示'
      ),
    },
    async (args) => {
      try {
        if (!args.tax_type) {
          const result = await listSaiketsuTaxTypes();
          const lines = result.taxTypes.map(t => `- ${t.name}`);
          return {
            content: [{
              type: 'text' as const,
              text: `# 裁決事例 — 税目一覧\n\n${lines.join('\n')}\n\n---\n出典：国税不服審判所ホームページ（公表裁決事例要旨）\nURL: ${result.url}`,
            }],
          };
        }

        const result = await listSaiketsuCategories(args.tax_type);
        const lines: string[] = [];
        for (const cat of result.categories) {
          lines.push(`## ${cat.name}`);
          for (const item of cat.items) {
            const countStr = item.count > 0 ? `（${item.count}件）` : '';
            lines.push(`- ${item.name}${countStr}`);
          }
          lines.push('');
        }

        return {
          content: [{
            type: 'text' as const,
            text: `# 裁決事例 — ${result.taxTypeName}\n\n${lines.join('\n')}\n---\n出典：国税不服審判所ホームページ（公表裁決事例要旨）\nURL: ${result.url}`,
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
