import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withMiddleware, queryString, queryNumber } from './_shared/middleware.js';
import { searchSaiketsu } from '../src/lib/services/saiketsu-service.js';

async function handler(req: VercelRequest, res: VercelResponse) {
  const keyword = queryString(req.query.keyword);
  const taxType = queryString(req.query.tax_type);
  const latest = queryNumber(req.query.latest);
  const limit = queryNumber(req.query.limit);

  if (!keyword) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'keyword は必須です' },
    });
  }

  const result = await searchSaiketsu({ keyword, taxType, latest, limit });

  return res.status(200).json({
    results: result.results.map(c => ({
      collection_no: c.collectionNo,
      tax_type: c.taxType,
      category: c.category,
      summary: c.summary,
      date: c.date,
      case_url: c.caseUrl,
    })),
    total_hits: result.totalHits,
    displayed: result.results.length,
    scope: result.scope,
    fetch_errors: result.fetchErrors,
    source: '国税不服審判所ホームページ',
  });
}

export default withMiddleware(handler);
