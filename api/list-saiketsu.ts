import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withMiddleware, queryString } from './_shared/middleware.js';
import { listSaiketsuTaxTypes, listSaiketsuCategories } from '../src/lib/services/saiketsu-service.js';

async function handler(req: VercelRequest, res: VercelResponse) {
  const taxType = queryString(req.query.tax_type);

  if (!taxType) {
    // 税目一覧を表示
    const result = await listSaiketsuTaxTypes();
    return res.status(200).json({
      tax_types: result.taxTypes.map(t => ({
        name: t.name,
        case_count: t.caseCount,
      })),
      source: '国税不服審判所ホームページ',
      url: result.url,
    });
  }

  // カテゴリ階層を表示
  const result = await listSaiketsuCategories(taxType);

  return res.status(200).json({
    tax_type_name: result.taxTypeName,
    categories: result.categories.map(cat => ({
      name: cat.name,
      items: cat.items.map(item => ({
        name: item.name,
        count: item.count,
      })),
    })),
    source: '国税不服審判所ホームページ',
    url: result.url,
  });
}

export default withMiddleware(handler);
