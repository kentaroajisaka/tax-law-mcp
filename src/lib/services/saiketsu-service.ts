/**
 * 裁決事例サービス
 * 国税不服審判所（KFS）サイトから裁決事例を取得するビジネスロジック
 */

import { resolveKfsTaxType, listKfsTaxTypes } from '../kfs-registry.js';
import { fetchKfsTopicPage, fetchKfsPage, getKfsUrl } from '../kfs-client.js';
import { parseKfsTopicIndex, parseKfsTopicCategories, parseCollectionList, parseCollectionIndex, parseCaseFullText } from '../kfs-parser.js';
import { NotFoundError, UnsupportedError, ValidationError } from '../errors.js';
import type { KfsTaxType, KfsTopicCategory, KfsCaseEntry, KfsCaseFullText } from '../types.js';

// --- list_saiketsu ---

export interface ListSaiketsuTaxTypesResult {
  taxTypes: KfsTaxType[];
  url: string;
}

export interface ListSaiketsuCategoriesResult {
  taxTypeName: string;
  categories: KfsTopicCategory[];
  url: string;
}

/**
 * 裁決事例の税目一覧を取得
 */
export async function listSaiketsuTaxTypes(): Promise<ListSaiketsuTaxTypesResult> {
  const html = await fetchKfsTopicPage('/service/MP/index.html');
  const taxTypes = parseKfsTopicIndex(html);
  const url = getKfsUrl('/service/MP/index.html');
  return { taxTypes, url };
}

/**
 * 特定税目のカテゴリ階層を取得
 */
export async function listSaiketsuCategories(taxType: string): Promise<ListSaiketsuCategoriesResult> {
  const { name, entry } = resolveKfsTaxType(taxType);
  if (!entry) {
    const supported = listKfsTaxTypes();
    throw new UnsupportedError(
      `税目 "${taxType}" は対応していません。\n\n対応税目:\n${supported.map(s => `- ${s}`).join('\n')}`
    );
  }

  const html = await fetchKfsTopicPage(entry.topicPath);
  const categories = parseKfsTopicCategories(html);
  const url = getKfsUrl(entry.topicPath);

  return { taxTypeName: name, categories, url };
}

// --- search_saiketsu ---

export interface SearchSaiketsuResult {
  keyword: string;
  results: KfsCaseEntry[];
  totalHits: number;
  collectionsSearched: number;
  fetchErrors: string[];
  scope: string;
}

/**
 * 裁決事例をキーワード検索
 */
export async function searchSaiketsu(params: {
  keyword: string;
  taxType?: string;
  latest?: number;
  limit?: number;
}): Promise<SearchSaiketsuResult> {
  const limit = Math.min(params.limit ?? 10, 30);

  // 1. 事例集一覧を取得
  const indexHtml = await fetchKfsPage('/service/JP/index.html');
  let collections = parseCollectionList(indexHtml);

  if (params.latest) {
    collections = collections.slice(-params.latest);
  }

  // 2. 各事例集の目次をパースしてエントリを収集
  const allCases: KfsCaseEntry[] = [];
  const fetchErrors: string[] = [];

  // 並行取得（concurrency 5）
  const CONCURRENCY = 5;
  for (let i = 0; i < collections.length; i += CONCURRENCY) {
    const batch = collections.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (col) => {
        try {
          const html = await fetchKfsPage(col.idxUrl);
          const baseUrl = getKfsUrl(col.idxUrl);
          return parseCollectionIndex(html, col.no, baseUrl);
        } catch {
          fetchErrors.push(`第${col.no}集`);
          return [];
        }
      })
    );
    for (const cases of results) {
      for (const c of cases) {
        allCases.push(c);
      }
    }
  }

  // 3. キーワードでフィルタ（スペース区切りでAND検索）
  const keywords = params.keyword.split(/\s+/).filter(Boolean);
  let filtered = allCases.filter(c => {
    const searchTarget = `${c.summary} ${c.category} ${c.taxType}`;
    return keywords.every(kw => searchTarget.includes(kw));
  });

  // 税目フィルタ
  if (params.taxType) {
    const resolved = resolveKfsTaxType(params.taxType);
    if (resolved.entry) {
      const canonicalName = resolved.name;
      filtered = filtered.filter(c => c.taxType === canonicalName);
    } else {
      const tt = params.taxType;
      filtered = filtered.filter(c => {
        if (!c.taxType) return false;
        return c.taxType.includes(tt) || tt.includes(c.taxType.replace('関係', ''));
      });
    }
  }

  // 新しい順（collectionNoの降順）
  filtered.sort((a, b) => b.collectionNo - a.collectionNo);
  const totalHits = filtered.length;
  const results = filtered.slice(0, limit);
  const scope = params.latest ? `最新${params.latest}冊` : `全${collections.length}冊`;

  return { keyword: params.keyword, results, totalHits, collectionsSearched: collections.length, fetchErrors, scope };
}

// --- get_saiketsu ---

export interface GetSaiketsuResult {
  fullText: KfsCaseFullText;
}

/**
 * 裁決事例の全文を取得
 */
export async function getSaiketsu(params: {
  url?: string;
  collectionNo?: number;
  caseNo?: number;
}): Promise<GetSaiketsuResult> {
  let path: string;

  if (params.url) {
    path = params.url.trim();
    // SSRF防止: KFSサイト以外のURLを拒否
    const resolvedUrl = path.startsWith('http') ? path : `https://www.kfs.go.jp${path}`;
    if (!resolvedUrl.startsWith('https://www.kfs.go.jp/')) {
      throw new ValidationError('KFSサイト（kfs.go.jp）以外のURLは指定できません。');
    }
  } else if (params.collectionNo != null && params.caseNo != null) {
    const caseStr = String(params.caseNo).padStart(2, '0');
    path = `/service/JP/${params.collectionNo}/${caseStr}/index.html`;
  } else {
    throw new ValidationError(
      'url または collection_no + case_no を指定してください。'
    );
  }

  const html = await fetchKfsPage(path);
  const fullText = parseCaseFullText(html);
  const url = getKfsUrl(path);

  if (!fullText) {
    throw new NotFoundError(`裁決全文が見つかりませんでした。\nURL: ${url}`);
  }

  fullText.url = url;
  return { fullText };
}
