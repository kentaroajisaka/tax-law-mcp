import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withMiddleware, queryString } from './_shared/middleware.js';
import { getTsutatsu } from '../src/lib/services/tsutatsu-service.js';

async function handler(req: VercelRequest, res: VercelResponse) {
  const tsutatsuName = queryString(req.query.tsutatsu_name);
  const number = queryString(req.query.number);

  if (!tsutatsuName || !number) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'tsutatsu_name と number は必須です' },
    });
  }

  const result = await getTsutatsu({ tsutatsuName, number });
  const entry = result.entry;

  return res.status(200).json({
    result: `# ${result.tsutatsuName} ${entry.number}\n${entry.caption ? `（${entry.caption}）\n` : ''}\n${entry.body}`,
    source: '国税庁ホームページ',
    url: entry.url,
  });
}

export default withMiddleware(handler);
