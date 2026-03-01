import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { resolveTsutatsuName, listSupportedTsutatsu } from '../lib/tsutatsu-registry.js';
import { fetchTsutatsuToc, fetchNtaPage, getNtaUrl } from '../lib/tsutatsu-client.js';
import { parseTocLinks, findPageForNumber, extractTsutatsuEntry, getCandidatePages } from '../lib/tsutatsu-parser.js';

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

        // 1. TOCページを取得
        const tocHtml = await fetchTsutatsuToc(entry.tocPath, entry.encoding);

        // 2. TOCリンクを解析
        const tocLinks = parseTocLinks(tocHtml, entry.tocFormat, entry.tocPath);

        // 3. 通達番号から該当ページを特定
        const pageHref = findPageForNumber(tocLinks, args.number);

        // 4. ページを取得してエントリを抽出（見つからなければ候補ページをフォールバック検索）
        let tsutatsuEntry: import('../lib/types.js').TsutatsuEntry | null = null;

        if (pageHref) {
          const pageHtml = await fetchNtaPage(pageHref, entry.encoding);
          const pageUrl = getNtaUrl(pageHref);
          tsutatsuEntry = extractTsutatsuEntry(pageHtml, args.number, pageUrl);

          if (!tsutatsuEntry) {
            // フォールバック: 同セクションの前後ページも検索
            tsutatsuEntry = await searchNearbyPages(tocLinks, pageHref, args.number, entry.encoding);
          }
        }

        // TOCからページが見つからなかった or ページ内に見つからなかった場合
        if (!tsutatsuEntry) {
          const candidates = getCandidatePages(tocLinks, args.number);
          for (const candidateHref of candidates) {
            if (candidateHref === pageHref) continue;
            try {
              const html = await fetchNtaPage(candidateHref, entry.encoding);
              const url = getNtaUrl(candidateHref);
              tsutatsuEntry = extractTsutatsuEntry(html, args.number, url);
              if (tsutatsuEntry) break;
            } catch {
              // skip
            }
          }
        }

        if (!tsutatsuEntry) {
          return {
            content: [{
              type: 'text' as const,
              text: `${name} ${args.number} が見つかりませんでした。\n\n通達番号の表記を確認してください（例: "33-6", "2-1-1"）。\n目次から探す場合は list_tsutatsu ツールを使用してください。`,
            }],
            isError: true,
          };
        }

        return {
          content: [{
            type: 'text' as const,
            text: formatTsutatsuResult(name, tsutatsuEntry),
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

function formatTsutatsuResult(tsutatsuName: string, entry: import('../lib/types.js').TsutatsuEntry): string {
  return `# ${tsutatsuName} ${entry.number}\n${entry.caption ? `（${entry.caption}）\n` : ''}\n${entry.body}\n\n---\n出典：国税庁ホームページ\nURL: ${entry.url}`;
}

/**
 * フォールバック: 該当ページの前後のページも検索
 */
async function searchNearbyPages(
  tocLinks: import('../lib/types.js').TsutatsuTocLink[],
  currentHref: string,
  number: string,
  encoding: 'shift_jis' | 'utf-8'
): Promise<import('../lib/types.js').TsutatsuEntry | null> {
  // currentHrefの前後3ページを検索
  const currentIdx = tocLinks.findIndex(l => l.href === currentHref);
  if (currentIdx === -1) return null;

  const start = Math.max(0, currentIdx - 2);
  const end = Math.min(tocLinks.length, currentIdx + 3);

  for (let i = start; i < end; i++) {
    if (tocLinks[i].href === currentHref) continue; // 既に検索済み

    try {
      const html = await fetchNtaPage(tocLinks[i].href, encoding);
      const pageUrl = getNtaUrl(tocLinks[i].href);
      const entry = extractTsutatsuEntry(html, number, pageUrl);
      if (entry) return entry;
    } catch {
      // ページ取得エラーは無視して次へ
    }
  }

  return null;
}
