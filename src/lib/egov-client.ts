/**
 * e-Gov 法令API v2 クライアント
 * https://laws.e-gov.go.jp/api/2/swagger-ui
 *
 * takurot版を参考にレート制限を実装
 */

import { lawDataCache, lawSearchCache } from './cache.js';
import type { EgovLawSearchResult, EgovLawData } from './types.js';
import { resolveLawName } from './law-registry.js';
import { extractLawTitle } from './egov-parser.js';

const EGOV_API_BASE = 'https://laws.e-gov.go.jp/api/2';
const MIN_REQUEST_INTERVAL_MS = 200; // 5 req/sec (takurot版参考)

let lastRequestTime = 0;

/** レート制限: 前回リクエストから最低200ms空ける */
async function rateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_REQUEST_INTERVAL_MS) {
    await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

/**
 * 法令名を比較用に正規化する
 * 全角/半角、句読点、括弧、空白を取り除き、緩い包含比較に使う
 * 入力が undefined/null/空文字の場合は空文字を返す(防御的)。
 */
function normalizeLawTitle(s: string | undefined | null): string {
  if (!s) return '';
  return s
    // 全角英数→半角
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    // 句読点・括弧・中黒・空白の除去
    .replace(/[\s、，,。．・「」『』（）()【】［］\[\]]/g, '')
    .toLowerCase();
}

/**
 * 検索結果が要求された法令名と意味的に一致するか確認する
 * e-Gov v2 の keyword 検索は税務分野で関連度の低い結果を返すことがある(明治時代の太政官布告など)。
 * その silent fallback を防ぐため、title の包含一致を要求する。
 */
function matchesRequestedLaw(
  requestedName: string | undefined,
  result: EgovLawSearchResult
): boolean {
  const title =
    result.current_revision_info?.law_title ??
    result.revision_info?.law_title;
  if (!title || !requestedName) return false;
  const a = normalizeLawTitle(requestedName);
  const b = normalizeLawTitle(title);
  if (!a || !b) return false;
  return a.includes(b) || b.includes(a);
}

/**
 * 法令名またはlaw_idから法令全文を取得
 */
export async function fetchLawData(lawNameOrId: string): Promise<{
  data: EgovLawData;
  lawId: string;
  lawTitle: string;
}> {
  // law_idを解決
  let lawId: string;
  const { name, lawId: resolvedId } = resolveLawName(lawNameOrId);

  if (resolvedId) {
    lawId = resolvedId;
  } else if (/^\d{15}$/.test(lawNameOrId)) {
    // 15桁の数字ならlaw_idそのもの
    lawId = lawNameOrId;
  } else {
    // 名前で検索してlaw_idを取得
    // 注意: e-Gov v2 の keyword 検索は完全一致ベースの順位付けを保証しないため、
    // 上位5件を取得して title の包含一致でフィルタする。一致しなければエラーを返す
    // (旧コードは results[0] を盲目的に返していたため、関連のない明治時代の法令にフォールバックする silent bug があった)。
    const results = await searchLaws(name, 5);
    if (results.length === 0) {
      throw new Error(`法令が見つかりません: "${name}"`);
    }
    const matched = results.find(r => matchesRequestedLaw(name, r));
    if (!matched) {
      const previews = results
        .slice(0, 3)
        .map(r =>
          r.current_revision_info?.law_title ??
          r.revision_info?.law_title ??
          r.law_info.law_id
        )
        .join('; ');
      throw new Error(
        `法令名 "${name}" に一致する法令が見つかりませんでした。` +
        `e-Gov 検索結果上位: ${previews}. ` +
        `略称を追加するか、正式名称または15桁のlaw_idを直接指定してください。`
      );
    }
    lawId = matched.law_info.law_id;
  }

  // キャッシュチェック
  const cached = lawDataCache.get(lawId);
  if (cached) {
    const data = JSON.parse(cached) as EgovLawData;
    return { data, lawId, lawTitle: extractLawTitle(data) };
  }

  // e-Gov API v2 から取得
  await rateLimit();
  const url = `${EGOV_API_BASE}/law_data/${lawId}`;
  const res = await fetch(url, {
    headers: { 'Accept': 'application/json' },
  });

  if (!res.ok) {
    if (res.status === 404) {
      throw new Error(`法令が見つかりません (law_id: ${lawId})`);
    }
    throw new Error(`e-Gov API エラー: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  const data = json as EgovLawData;

  // キャッシュに保存
  lawDataCache.set(lawId, JSON.stringify(data));

  return { data, lawId, lawTitle: extractLawTitle(data) };
}

/**
 * 法令をキーワードで検索
 */
export async function searchLaws(
  keyword: string,
  limit: number = 10,
  lawType?: string
): Promise<EgovLawSearchResult[]> {
  const cacheKey = `${keyword}|${limit}|${lawType ?? ''}`;
  const cached = lawSearchCache.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }

  const params = new URLSearchParams({
    keyword,
    limit: String(limit),
    response_format: 'json',
  });
  if (lawType) {
    params.set('law_type', lawType);
  }

  await rateLimit();
  const url = `${EGOV_API_BASE}/laws?${params}`;
  const res = await fetch(url, {
    headers: { 'Accept': 'application/json' },
  });

  if (!res.ok) {
    throw new Error(`e-Gov API 検索エラー: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  const results = (json.laws ?? []) as EgovLawSearchResult[];

  lawSearchCache.set(cacheKey, JSON.stringify(results));

  return results;
}

/**
 * e-Gov の法令ページURLを生成
 */
export function getEgovUrl(lawId: string): string {
  return `https://laws.e-gov.go.jp/law/${lawId}`;
}
