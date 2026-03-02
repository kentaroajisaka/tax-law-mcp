/**
 * 法令サービス
 * e-Gov法令API v2 を使った条文取得・検索のビジネスロジック
 */

import { fetchLawData, searchLaws, getEgovUrl } from '../egov-client.js';
import { extractArticle, extractToc } from '../egov-parser.js';
import { NotFoundError } from '../errors.js';
import type { EgovLawSearchResult } from '../types.js';

export interface GetLawArticleResult {
  lawTitle: string;
  article: string;
  articleCaption: string;
  text: string;
  egovUrl: string;
}

export interface GetLawTocResult {
  lawTitle: string;
  toc: string;
  egovUrl: string;
}

export interface SearchLawResultItem {
  lawTitle: string;
  lawId: string;
  lawNum: string;
  lawType: string;
  egovUrl: string;
}

export interface SearchLawResult {
  keyword: string;
  results: SearchLawResultItem[];
}

/**
 * 法令の特定条文を取得
 */
export async function getLawArticle(params: {
  lawName: string;
  article: string;
  paragraph?: number;
  item?: number;
}): Promise<GetLawArticleResult> {
  const { data, lawId, lawTitle } = await fetchLawData(params.lawName);
  const egovUrl = getEgovUrl(lawId);

  const result = extractArticle(data, params.article, params.paragraph, params.item);

  if (!result) {
    const articleDesc = `第${params.article}条`;
    const paraDesc = params.paragraph ? `第${params.paragraph}項` : '';
    const itemDesc = params.item ? `第${params.item}号` : '';
    throw new NotFoundError(
      `${lawTitle} ${articleDesc}${paraDesc}${itemDesc} が見つかりませんでした。条文番号を確認してください。`
    );
  }

  return {
    lawTitle,
    article: params.article,
    articleCaption: result.articleCaption ?? '',
    text: result.text,
    egovUrl,
  };
}

/**
 * 法令の目次を取得
 */
export async function getLawToc(params: {
  lawName: string;
}): Promise<GetLawTocResult> {
  const { data, lawId, lawTitle } = await fetchLawData(params.lawName);
  const egovUrl = getEgovUrl(lawId);
  const toc = extractToc(data);

  return { lawTitle, toc, egovUrl };
}

/**
 * 法令をキーワード検索
 */
export async function searchLaw(params: {
  keyword: string;
  lawType?: string;
  limit?: number;
}): Promise<SearchLawResult> {
  const limit = Math.min(params.limit ?? 10, 20);
  const results = await searchLaws(params.keyword, limit, params.lawType);

  return {
    keyword: params.keyword,
    results: results.map((r: EgovLawSearchResult) => ({
      lawTitle: r.revision_info?.law_title ?? r.current_revision_info?.law_title ?? '',
      lawId: r.law_info.law_id,
      lawNum: r.law_info.law_num,
      lawType: r.law_info.law_type,
      egovUrl: getEgovUrl(r.law_info.law_id),
    })),
  };
}
