import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withMiddleware, queryString, queryNumber } from './_shared/middleware.js';
import {
  getLawArticle,
  getLawToc,
  listSuppl,
  getSupplProvision,
} from '../src/lib/services/law-service.js';

async function handler(req: VercelRequest, res: VercelResponse) {
  const lawName = queryString(req.query.law_name);
  const article = queryString(req.query.article);
  const paragraph = queryNumber(req.query.paragraph);
  // 号は枝番号（"12の5の2"）や漢数字の見出し（"六"）を取りうるので文字列で受ける
  const item = queryString(req.query.item);
  const subitem = queryString(req.query.subitem);
  const supplementary = queryString(req.query.supplementary);
  const format = queryString(req.query.format);

  if (!lawName) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'law_name は必須です' },
    });
  }

  // 附則の一覧
  if (format === 'suppl') {
    const result = await listSuppl({ lawName });
    const body =
      result.items.length === 0
        ? '（この法令に附則は収録されていません）'
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
    return res.status(200).json({
      result: `# ${result.lawTitle} — 附則一覧（${result.items.length}件）\n\n${body}`,
      source: 'e-Gov法令検索',
      url: result.egovUrl,
    });
  }

  // 目次
  if (format === 'toc') {
    const result = await getLawToc({ lawName });
    return res.status(200).json({
      result: `# ${result.lawTitle} — 目次\n\n${result.toc}`,
      source: 'e-Gov法令検索',
      url: result.egovUrl,
    });
  }

  // 附則の条文
  const wantsSuppl =
    supplementary !== undefined && supplementary.toLowerCase() !== 'false';
  if (wantsSuppl) {
    const result = await getSupplProvision({
      lawName,
      supplementary,
      article,
      paragraph,
      item,
      subitem,
    });
    const label = result.amendLawNum ?? '制定時附則';
    const artDisp = article ? ` 第${article.replace(/_/g, 'の')}条` : '';
    return res.status(200).json({
      result: `# ${result.lawTitle} 附則（${label}${result.extract ? '・抄' : ''}）${artDisp}\n\n${result.text}`,
      source: 'e-Gov法令検索',
      url: result.egovUrl,
    });
  }

  if (!article) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'article は必須です（format=toc / format=suppl / supplementary 指定時を除く）',
      },
    });
  }

  const result = await getLawArticle({ lawName, article, paragraph, item, subitem });

  const articleDisplay = article.replace(/_/g, 'の');
  const effectiveParagraph = paragraph ?? result.matchedParagraph;
  const paraDisplay = effectiveParagraph !== undefined ? `第${effectiveParagraph}項` : '';
  const itemDisplay = item !== undefined ? `第${String(item).replace(/_/g, 'の')}号` : '';
  const subDisplay = subitem !== undefined ? ` ${subitem}` : '';

  return res.status(200).json({
    result: `# ${result.lawTitle} 第${articleDisplay}条${paraDisplay}${itemDisplay}${subDisplay}\n${result.articleCaption ? `（${result.articleCaption}）\n` : ''}\n${result.text}`,
    source: 'e-Gov法令検索',
    url: result.egovUrl,
  });
}

export default withMiddleware(handler);
