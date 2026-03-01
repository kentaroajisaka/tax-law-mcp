import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { resolveTsutatsuName, listSupportedTsutatsu } from '../lib/tsutatsu-registry.js';
import { fetchTsutatsuToc, getNtaUrl } from '../lib/tsutatsu-client.js';
import { parseTocLinks, formatTocAsText } from '../lib/tsutatsu-parser.js';

export function registerListTsutatsuTool(server: McpServer) {
  server.tool(
    'list_tsutatsu',
    '通達の目次（章・節・条の構造）を表示する。通達番号が分からない場合に使用。',
    {
      tsutatsu_name: z.string().describe(
        '通達名または略称。例: "所得税基本通達", "所基通", "措通（譲渡）", "措通（法人税）", "通法基通"'
      ),
      section: z.string().optional().describe(
        'セクション絞り込み。例: "第33条", "譲渡所得", "収用"'
      ),
    },
    async (args) => {
      try {
        const { name, entry } = resolveTsutatsuName(args.tsutatsu_name);

        if (!entry) {
          const supported = listSupportedTsutatsu();
          return {
            content: [{
              type: 'text' as const,
              text: `通達 "${args.tsutatsu_name}" は対応していません。\n\n対応通達:\n${supported.map(s => `- ${s}`).join('\n')}`,
            }],
            isError: true,
          };
        }

        const tocHtml = await fetchTsutatsuToc(entry.tocPath, entry.encoding);
        const tocLinks = parseTocLinks(tocHtml, entry.tocFormat, entry.tocPath);
        const tocText = formatTocAsText(tocLinks, args.section);
        const tocUrl = getNtaUrl(entry.tocPath);

        const header = args.section
          ? `# ${name} — 目次（"${args.section}" で絞り込み）`
          : `# ${name} — 目次`;

        return {
          content: [{
            type: 'text' as const,
            text: `${header}\n\n${tocText}\n\n---\n出典：国税庁ホームページ\nURL: ${tocUrl}`,
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
