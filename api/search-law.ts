import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withMiddleware, queryString, queryNumber } from './_shared/middleware.js';
import { searchLaw } from '../src/lib/services/law-service.js';

async function handler(req: VercelRequest, res: VercelResponse) {
  const keyword = queryString(req.query.keyword);
  const lawType = queryString(req.query.law_type);
  const limit = queryNumber(req.query.limit);

  if (!keyword) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'keyword は必須です' },
    });
  }

  const result = await searchLaw({ keyword, lawType, limit });

  return res.status(200).json({
    results: result.results,
    total: result.results.length,
    source: 'e-Gov法令検索',
    url: 'https://laws.e-gov.go.jp',
  });
}

export default withMiddleware(handler);
