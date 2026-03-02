import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { searchSaiketsu } from '../lib/services/saiketsu-service.js';

export function registerSearchSaiketsuTool(server: McpServer) {
  server.tool(
    'search_saiketsu',
    '国税不服審判所の公表裁決事例をキーワードで検索する。要旨テキストとカテゴリ名を対象に検索。スペース区切りでAND検索。初回は事例集目次の取得に時間がかかる（以降はキャッシュ）。',
    {
      keyword: z.string().min(1).describe(
        '検索キーワード。スペース区切りでAND検索。例: "立退料", "重加算税 隠蔽", "仕入税額控除 帳簿"'
      ),
      tax_type: z.string().optional().describe(
        '税目で絞り込み。例: "所得税法関係", "法人税", "消費税", "通則法"'
      ),
      latest: z.number().int().min(1).optional().describe(
        '最新N冊のみ検索（デフォルト: 全件）。例: 10 で最新10冊のみ。初回の全件検索は30-60秒かかるため、高速に結果が欲しい場合は指定推奨'
      ),
      limit: z.number().int().min(1).optional().describe(
        '結果件数上限（デフォルト: 10、最大: 30）'
      ),
    },
    async (args) => {
      try {
        const result = await searchSaiketsu({
          keyword: args.keyword,
          taxType: args.tax_type,
          latest: args.latest,
          limit: args.limit,
        });

        if (result.results.length === 0) {
          let msg = `「${args.keyword}」に該当する裁決事例が見つかりませんでした（検索範囲: ${result.scope}）。\n\nキーワードを変えて再検索するか、list_saiketsu で税目・カテゴリを確認してください。`;
          if (result.fetchErrors.length > 0) {
            msg += `\n\n※ ${result.fetchErrors.length}冊の取得に失敗しました: ${result.fetchErrors.slice(0, 5).join(', ')}`;
          }
          return {
            content: [{
              type: 'text' as const,
              text: msg,
            }],
          };
        }

        const lines = result.results.map((c, i) => {
          const parts = [
            `${i + 1}. 【${c.taxType}】${c.category}`,
            `   要旨: ${c.summary.slice(0, 200)}${c.summary.length > 200 ? '...' : ''}`,
            `   裁決日: ${c.date}`,
            `   URL: ${c.caseUrl}`,
          ];
          return parts.join('\n');
        });

        let footer = `---\n出典：国税不服審判所ホームページ（公表裁決事例）\n全文を読むには get_saiketsu ツールにURLを指定してください。`;
        if (result.fetchErrors.length > 0) {
          footer += `\n\n※ ${result.fetchErrors.length}冊の取得に失敗（${result.fetchErrors.slice(0, 5).join(', ')}）。結果が不完全な可能性があります。`;
        }

        return {
          content: [{
            type: 'text' as const,
            text: `# 裁決事例検索結果: 「${args.keyword}」\n\n${result.totalHits}件中${result.results.length}件表示（検索範囲: ${result.scope}）\n\n${lines.join('\n\n')}\n\n${footer}`,
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
