import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getTsutatsu } from '../lib/services/tsutatsu-service.js';
import type { TsutatsuEntry } from '../lib/types.js';

export function registerGetTsutatsuTool(server: McpServer) {
  server.tool(
    'get_tsutatsu',
    '国税庁の通達(基本通達・措置法通達)から特定の通達を取得する。NTAサイトからスクレイピング。略称にも対応(所基通→所得税基本通達 等)。',
    {
      tsutatsu_name: z.string().describe(
        '通達名または略称。例: "所得税基本通達", "法人税基本通達", "所基通", "法基通", "消基通", "相基通", "評基通", "措置法通達（山林所得・譲渡所得関係）", "措通（譲渡）", "措通（申告）", "措通（法人税）", "措通（相続税）", "通法基通", "印基通"'
      ),
      number: z.string().describe(
        '通達番号。例: "33-6", "2-1-1", "5-1-1", "33-6の2"'
      ),
    },
    async (args) => {
      try {
        const result = await getTsutatsu({
          tsutatsuName: args.tsutatsu_name,
          number: args.number,
        });

        return {
          content: [{
            type: 'text' as const,
            text: formatTsutatsuResult(result.tsutatsuName, result.entry),
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

function formatTsutatsuResult(tsutatsuName: string, entry: TsutatsuEntry): string {
  return `# ${tsutatsuName} ${entry.number}\n${entry.caption ? `（${entry.caption}）\n` : ''}\n${entry.body}\n\n---\n出典：国税庁ホームページ\nURL: ${entry.url}`;
}
