import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getTsutatsu } from '../lib/services/tsutatsu-service.js';
import type { TsutatsuEntry } from '../lib/types.js';
import { formatTsutatsuHistory, type TsutatsuHistory } from '../lib/tsutatsu-history.js';

export function registerGetTsutatsuTool(server: McpServer) {
  server.tool(
    'get_tsutatsu',
    '国税庁の通達(基本通達・措置法通達)から特定の通達を取得する。NTAサイトからスクレイピング。略称にも対応(所基通→所得税基本通達 等)。' +
    '国税庁には現行の本文しかない。結果の末尾の【改正履歴】に、本文の注記から読んだ最終改正の日付・改正通達・新旧対照表を示す。' +
    '⚠ が付いたら、過年分や改正前の事実に当てはめる前に、新旧対照表で改正前の取扱いと適用時期を確かめること。',
    {
      tsutatsu_name: z.string().describe(
        '通達名または略称。例: "所得税基本通達", "法人税基本通達", "所基通", "法基通", "消基通", "相基通", "評基通", "措置法通達（山林所得・譲渡所得関係）", "措通（譲渡）", "措通（申告）", "措通（法人税）", "措通（相続税）", "通法基通", "印基通"'
      ),
      number: z.string().describe(
        '通達番号。例: "33-6", "2-1-1", "5-1-1", "33-6の2"'
      ),
      history: z.boolean().optional().describe(
        '改正履歴（最終改正の日付・新旧対照表）を付ける（既定 true）。false で省略して速くする'
      ),
    },
    async (args) => {
      try {
        const result = await getTsutatsu({
          tsutatsuName: args.tsutatsu_name,
          number: args.number,
          history: args.history,
        });

        return {
          content: [{
            type: 'text' as const,
            text: formatTsutatsuResult(result.tsutatsuName, result.entry, result.history),
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

function formatTsutatsuResult(
  tsutatsuName: string,
  entry: TsutatsuEntry,
  history?: TsutatsuHistory,
): string {
  const hist = history ? `\n\n${formatTsutatsuHistory(history)}` : '';
  return `# ${tsutatsuName} ${entry.number}\n${entry.caption ? `（${entry.caption}）\n` : ''}\n${entry.body}${hist}\n\n---\n出典：国税庁ホームページ\nURL: ${entry.url}`;
}
