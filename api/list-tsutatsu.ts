import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withMiddleware, queryString } from './_shared/middleware.js';
import { listTsutatsuToc } from '../src/lib/services/tsutatsu-service.js';

async function handler(req: VercelRequest, res: VercelResponse) {
  const tsutatsuName = queryString(req.query.tsutatsu_name);
  const section = queryString(req.query.section);

  if (!tsutatsuName) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'tsutatsu_name は必須です' },
    });
  }

  const result = await listTsutatsuToc({ tsutatsuName, section });

  const header = section
    ? `# ${result.tsutatsuName} — 目次（"${section}" で絞り込み）`
    : `# ${result.tsutatsuName} — 目次`;

  return res.status(200).json({
    result: `${header}\n\n${result.tocText}`,
    source: '国税庁ホームページ',
    url: result.tocUrl,
  });
}

export default withMiddleware(handler);
