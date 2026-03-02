import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withMiddleware, queryString, queryNumber } from './_shared/middleware.js';
import { getSaiketsu } from '../src/lib/services/saiketsu-service.js';

async function handler(req: VercelRequest, res: VercelResponse) {
  const url = queryString(req.query.url);
  const collectionNo = queryNumber(req.query.collection_no);
  const caseNo = queryNumber(req.query.case_no);

  const result = await getSaiketsu({ url, collectionNo, caseNo });

  return res.status(200).json({
    date: result.fullText.date,
    body: result.fullText.body,
    source: '国税不服審判所ホームページ',
    url: result.fullText.url,
  });
}

export default withMiddleware(handler);
