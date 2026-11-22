import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getLawArticle, getLawToc, listSuppl, getSupplProvision } from '../lib/services/law-service.js';

export function registerGetLawTool(server: McpServer) {
  server.tool(
    'get_law',
    '日本の法令から特定の条文を取得する。e-Gov法令API v2を使用。略称にも対応（所法→所得税法、措法→租税特別措置法 等）。' +
    '条番号が分かっていれば必ず条・項を指定して取る（目次や附則一覧は大きいので最後の手段）。' +
    '改正法の経過措置は本則ではなく改正法の附則にある。例: インボイスの免税事業者等からの仕入れの80%・50%控除＝' +
    'law_name "消費税法", supplementary "平成28年法律第15号", article "52"（80%）・"53"（その後の段階的控除）、' +
    '少額特例（1万円未満の帳簿のみ保存）＝同 article "53の2"、2割特例＝ supplementary "平成28年法律第15号", article "51の2"。',
    {
      law_name: z.string().describe(
        '法令名または略称。例: "所得税法", "法人税法", "租税特別措置法", "所法", "措法", "所得税法施行令", "所令"。' +
        'e-Gov の law_id を直接指定することもできる（例: "405AC0000000088" = 行政手続法）。プリセット未登録の法令はこちらが確実。'
      ),
      article: z.string().optional().describe(
        '条文番号（format="toc"の場合は省略可）。例: "33", "33の2", "57の3", "第33条"'
      ),
      paragraph: z.number().optional().describe(
        '項番号（省略時は条文全体）。例: 1, 2'
      ),
      item: z.union([z.number(), z.string()]).optional().describe(
        '号番号（省略時は項全体）。paragraph を省略しても全項から探す。' +
        '枝番号の号は文字列で指定する。例: 1, 2, "3の2", "12の5の2", "六"'
      ),
      subitem: z.string().optional().describe(
        '号の下のサブアイテム。item と併せて指定する。階層が深い場合は区切って並べる。' +
        '例: "イ", "ロ", "イ (1)", "イ-1-i"'
      ),
      supplementary: z.union([z.boolean(), z.string()]).optional().describe(
        '附則を対象にする。true または "制定" で制定時附則。' +
        '改正法の附則は法令番号で指定する。例: true, "制定", "平成29年法律第45号", "令和元年法律第34号"。' +
        'format="suppl" と併せて "平成28年" などを渡すと附則一覧をその改正法だけに絞り込む'
      ),
      format: z.enum(['markdown', 'toc', 'suppl']).optional().describe(
        '出力形式。"markdown"=条文全文（デフォルト）, "toc"=目次のみ, "suppl"=附則の一覧（消費税法は160件超と大きいので supplementary で絞り込む）'
      ),
    },
    async (args) => {
      try {
        if (args.format === 'suppl') {
          const filter =
            typeof args.supplementary === 'string' &&
            !['true', 'false', '制定', ''].includes(args.supplementary.trim().toLowerCase())
              ? args.supplementary
              : undefined;
          const result = await listSuppl({ lawName: args.law_name, filter });
          const body = result.items.length === 0
            ? (filter ? `（「${filter}」に当たる附則はありません）` : '（この法令に附則は収録されていません）')
            : result.items
                .map((i) => {
                  const label = i.amendLawNum ?? '（制定時附則）';
                  const ex = i.extract ? '（抄）' : '';
                  const arts = i.articleNums.length
                    ? `条: ${i.articleNums.join(', ')}`
                    : `条なし・項${i.paragraphCount}件`;
                  return `- ${label}${ex} — ${arts}`;
                })
                .join('\n');
          return {
            content: [{
              type: 'text' as const,
              text: `# ${result.lawTitle} — 附則一覧（${filter ? `「${filter}」で絞り込み ${result.items.length}件／全${result.total}件` : `${result.items.length}件`}）\n\n` +
                `取り方: get_law に supplementary（改正法の法令番号）と article（条番号）を渡す。\n\n${body}\n\n---\n出典：e-Gov法令検索（デジタル庁）\nURL: ${result.egovUrl}`,
            }],
          };
        }

        const wantsSuppl =
          args.supplementary !== undefined &&
          args.supplementary !== false &&
          String(args.supplementary).toLowerCase() !== 'false';
        if (wantsSuppl) {
          const result = await getSupplProvision({
            lawName: args.law_name,
            supplementary: args.supplementary,
            article: args.article,
            paragraph: args.paragraph,
            item: args.item,
            subitem: args.subitem,
          });
          const label = result.amendLawNum ?? '制定時附則';
          const artDisp = args.article ? ` 第${args.article.replace(/_/g, 'の')}条` : '';
          return {
            content: [{
              type: 'text' as const,
              text: `# ${result.lawTitle} 附則（${label}${result.extract ? '・抄' : ''}）${artDisp}\n\n${result.text}\n\n---\n出典：e-Gov法令検索（デジタル庁）\nURL: ${result.egovUrl}`,
            }],
          };
        }

        if (args.format === 'toc') {
          const result = await getLawToc({ lawName: args.law_name });
          return {
            content: [{
              type: 'text' as const,
              text: `# ${result.lawTitle} — 目次\n\n${result.toc}\n\n（目次は本則のみ。経過措置・特例は附則にある: format="suppl" と supplementary="平成28年" 等で附則一覧を絞り込み、supplementary＋article で条文を取る）\n\n---\n出典：e-Gov法令検索（デジタル庁）\nURL: ${result.egovUrl}`,
            }],
          };
        }

        if (!args.article) {
          return {
            content: [{
              type: 'text' as const,
              text: 'エラー: 条文番号（article）を指定してください。目次を取得する場合は format="toc" を指定してください。',
            }],
            isError: true,
          };
        }

        const result = await getLawArticle({
          lawName: args.law_name,
          article: args.article,
          paragraph: args.paragraph,
          item: args.item,
          subitem: args.subitem,
        });

        const articleDisplay = args.article.replace(/_/g, 'の');
        const effectiveParagraph = args.paragraph ?? result.matchedParagraph;
        const paraDisplay = effectiveParagraph !== undefined ? `第${effectiveParagraph}項` : '';
        const itemDisplay =
          args.item !== undefined ? `第${String(args.item).replace(/_/g, 'の')}号` : '';
        const subDisplay = args.subitem !== undefined ? ` ${args.subitem}` : '';

        return {
          content: [{
            type: 'text' as const,
            text: `# ${result.lawTitle} 第${articleDisplay}条${paraDisplay}${itemDisplay}${subDisplay}\n${result.articleCaption ? `（${result.articleCaption}）\n` : ''}\n${result.text}\n\n---\n出典：e-Gov法令検索（デジタル庁）\nURL: ${result.egovUrl}`,
          }],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        const looksAmendAct =
          /改正する法律|法律第.+号/.test(args.law_name) || /^\d{3}AC\d{10}$/.test(args.law_name.trim());
        const amendHint = looksAmendAct && /法令が見つかりません|一致する法令が見つかりませんでした/.test(msg)
          ? '\n改正法（「〜の一部を改正する法律」）の附則は単独では取れないことが多い。改正された側の法令の附則として収録されているので、' +
            'law_name に元の法令（例: "消費税法"）、supplementary に改正法の法令番号（例: "平成28年法律第15号"）、article に附則の条番号を指定する。' +
            '例: インボイス80%経過措置 = {law_name:"消費税法", supplementary:"平成28年法律第15号", article:"52"}'
          : '';
        return {
          content: [{
            type: 'text' as const,
            text: `エラー: ${msg}${amendHint}`,
          }],
          isError: true,
        };
      }
    }
  );
}
