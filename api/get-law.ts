import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withMiddleware, queryString, queryNumber } from './_shared/middleware.js';
import { getLawArticle, getLawToc } from '../src/lib/services/law-service.js';

async function handler(req: VercelRequest, res: VercelResponse) {
  const lawName = queryString(req.query.law_name);
  const article = queryString(req.query.article);
  const paragraph = queryNumber(req.query.paragraph);
  const item = queryNumber(req.query.item);
  const format = queryString(req.query.format);

  if (!lawName || !article) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'law_name と article は必須です' },
    });
  }

  if (format === 'toc') {
    const result = await getLawToc({ lawName });
    return res.status(200).json({
      result: `# ${result.lawTitle} — 目次\n\n${result.toc}`,
      source: 'e-Gov法令検索',
      url: result.egovUrl,
    });
  }

  const result = await getLawArticle({ lawName, article, paragraph, item });

  return res.status(200).json({
    result: `# ${result.lawTitle} 第${article}条\n${result.articleCaption ? `（${result.articleCaption}）\n` : ''}\n${result.text}`,
    source: 'e-Gov法令検索',
    url: result.egovUrl,
  });
}

export default withMiddleware(handler);
