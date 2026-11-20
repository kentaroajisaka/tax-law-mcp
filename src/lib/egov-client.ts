/**
 * e-Gov 法令API v2 クライアント
 * https://laws.e-gov.go.jp/api/2/swagger-ui
 *
 * takurot版を参考にレート制限を実装
 */

import { lawDataCache, lawSearchCache, lawRevisionsCache, lawArticleCache } from './cache.js';
import type { EgovLawSearchResult, EgovLawData, EgovRevisionInfo } from './types.js';
import { resolveLawName } from './law-registry.js';
import { extractLawTitle } from './egov-parser.js';

const EGOV_API_BASE = 'https://laws.e-gov.go.jp/api/2';
const MIN_REQUEST_INTERVAL_MS = 200; // 5 req/sec (takurot版参考)

let lastRequestTime = 0;
let rateLimitChain: Promise<void> = Promise.resolve();

/**
 * レート制限: 前回リクエストから最低200ms空ける。
 * 並行に呼ばれても順番に間隔をあけるよう、待ちを1本の Promise の鎖につなぐ。
 */
function rateLimit(): Promise<void> {
  const next = rateLimitChain.then(async () => {
    const elapsed = Date.now() - lastRequestTime;
    if (elapsed < MIN_REQUEST_INTERVAL_MS) {
      await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL_MS - elapsed));
    }
    lastRequestTime = Date.now();
  });
  rateLimitChain = next;
  return next;
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
 * e-Gov の law_id 形式かどうかを判定する
 *
 * law_id は「元号年3桁 + 法令種別を表す12文字」の全15文字。種別部分の形は一様ではなく、
 * v2 API から実データ401件を抽出して確認できただけでも以下の形がある:
 *   340AC0000000033 (法律)   340CO0000000096 (政令)   105DF0000000337 (太政官布告)
 *   340M50000040011 (府省令) 348RJNJ10004000 (規則)   416M60001FCA002 (府省令・英字混在)
 *   321CONSTITUTION (日本国憲法)
 * 種別コードを列挙する方式だと新しい形式を取りこぼすため(旧実装の /^\d{15}$/ は英字を含む
 * 実データに一切マッチせず、law_id 直接指定が丸ごと死んでいた)、
 * 「3桁数字 + 英大文字始まりの英数字12文字」という構造だけで判定する。
 * 法令名は日本語なのでこのパターンには一致しない。
 */
const LAW_ID_PATTERN = /^\d{3}[A-Z][A-Z0-9]{11}$/;

export function isLawId(value: string): boolean {
  return LAW_ID_PATTERN.test(value);
}

/**
 * 法令名またはlaw_idから法令全文を取得
 */
export async function fetchLawData(lawNameOrId: string, asof?: string): Promise<{
  data: EgovLawData;
  lawId: string;
  lawTitle: string;
}> {
  // law_idを解決
  let lawId: string;
  const { name, lawId: resolvedId } = resolveLawName(lawNameOrId);

  if (resolvedId) {
    lawId = resolvedId;
  } else if (isLawId(lawNameOrId)) {
    // law_id 形式ならそのまま使う(プリセット未登録の法令はこの経路で取得できる)
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
        `略称を追加するか、正式名称または law_id (例: 340AC0000000033) を直接指定してください。`
      );
    }
    lawId = matched.law_info.law_id;
  }

  // キャッシュチェック（版の指定日ごとに分ける）
  const cacheKey = asof ? `${lawId}|${asof}` : lawId;
  const cached = lawDataCache.get(cacheKey);
  if (cached) {
    const data = JSON.parse(cached) as EgovLawData;
    return { data, lawId, lawTitle: extractLawTitle(data) };
  }

  // e-Gov API v2 から取得
  await rateLimit();
  // asof を付けないと e-Gov は「今日の時点で施行中の版」を返す（公布済み・未施行の改正は入らない）
  const url = asof
    ? `${EGOV_API_BASE}/law_data/${lawId}?asof=${encodeURIComponent(asof)}`
    : `${EGOV_API_BASE}/law_data/${lawId}`;
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
  lawDataCache.set(cacheKey, JSON.stringify(data));

  return { data, lawId, lawTitle: extractLawTitle(data) };
}

/**
 * 法令の改正履歴（版の一覧）を取得する。未施行（UnEnforced）の版も含む。
 */
export async function fetchLawRevisions(lawId: string): Promise<EgovRevisionInfo[]> {
  const cached = lawRevisionsCache.get(lawId);
  if (cached) return JSON.parse(cached);

  await rateLimit();
  const res = await fetch(`${EGOV_API_BASE}/law_revisions/${lawId}`, {
    headers: { 'Accept': 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`e-Gov API 改正履歴エラー: ${res.status} ${res.statusText}`);
  }
  const json = await res.json();
  const revisions = (json.revisions ?? []) as EgovRevisionInfo[];
  lawRevisionsCache.set(lawId, JSON.stringify(revisions));
  return revisions;
}

/** 条文番号を e-Gov の elm 指定（MainProvision-Article_69_4）に直す */
export function toArticleElm(normalizedArticleNum: string): string {
  return `MainProvision-Article_${normalizedArticleNum}`;
}

/** 条が存在しない版を表す印 */
export const ARTICLE_MISSING = '__ARTICLE_MISSING__';

/**
 * 特定の版（law_revision_id）から本則の1条だけを取得し、比較用の文字列で返す。
 * その版に条が無いときは ARTICLE_MISSING を返す。
 */
export async function fetchArticleSnapshot(
  revisionId: string,
  normalizedArticleNum: string,
): Promise<string> {
  const elm = toArticleElm(normalizedArticleNum);
  const cacheKey = `${revisionId}|${elm}`;
  const cached = lawArticleCache.get(cacheKey);
  if (cached !== undefined) return cached;

  await rateLimit();
  const res = await fetch(
    `${EGOV_API_BASE}/law_data/${revisionId}?elm=${encodeURIComponent(elm)}`,
    { headers: { 'Accept': 'application/json' } },
  );
  let snapshot: string;
  if (res.ok) {
    const json = await res.json();
    snapshot = JSON.stringify(json.law_full_text ?? null);
  } else if (res.status === 400 || res.status === 404) {
    // 「要素（elm）に合致する要素が法令本文に存在しません」= その版にはこの条が無い
    const body = await res.text().catch(() => '');
    if (res.status === 400 && !body.includes('存在しません')) {
      throw new Error(`e-Gov API エラー: ${res.status} ${body.slice(0, 100)}`);
    }
    snapshot = ARTICLE_MISSING;
  } else {
    throw new Error(`e-Gov API エラー: ${res.status} ${res.statusText}`);
  }
  lawArticleCache.set(cacheKey, snapshot);
  return snapshot;
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
