import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { searchLaw } from '../lib/services/law-service.js';

export function registerSearchLawTool(server: McpServer) {
  server.tool(
    'search_law',
    '法令を検索する。法令名・略称の部分一致で探し（完全一致→前方一致の順に並べる）、法令名で見つからないときは本文の全文検索に切り替える。法令名や law_id が分からない場合に使用。e-Gov法令API v2を使用。',
    {
      keyword: z.string().describe(
        '法令名・略称の一部、または本文中の語。例: "所得税", "税理士法", "社労士法", "収用", "適格請求書"'
      ),
      law_type: z.enum(['Act', 'CabinetOrder', 'MinisterialOrdinance']).optional().describe(
        '法令種別で絞り込み。Act=法律, CabinetOrder=政令（施行令）, MinisterialOrdinance=省令（施行規則）'
      ),
      limit: z.number().optional().describe(
        '取得件数（デフォルト10、最大20）'
      ),
    },
    async (args) => {
      try {
        const result = await searchLaw({
          keyword: args.keyword,
          lawType: args.law_type,
          limit: args.limit,
        });

        if (result.results.length === 0) {
          return {
            content: [{
              type: 'text' as const,
              text: `"${args.keyword}" に一致する法令が見つかりませんでした。`,
            }],
          };
        }

        const lines = result.results.map((r, i) =>
          `${i + 1}. **${r.lawTitle}**\n   法令番号: ${r.lawNum}\n   law_id: ${r.lawId}\n   種別: ${r.lawType}\n   URL: ${r.egovUrl}`
          + (r.snippet ? `\n   該当箇所: ${r.snippet}` : '')
        );
        const modeNote = result.mode === 'fulltext'
          ? `法令名・略称に一致する法令がないため、本文に「${result.keyword}」を含む法令を表示しています。\n\n`
          : '';

        return {
          content: [{
            type: 'text' as const,
            text: `# 法令検索結果: "${args.keyword}"\n\n${modeNote}${lines.join('\n\n')}\n\n---\n出典：e-Gov法令検索（デジタル庁）`,
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
