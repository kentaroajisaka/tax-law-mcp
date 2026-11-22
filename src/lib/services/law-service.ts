/**
 * 法令サービス
 * e-Gov法令API v2 を使った条文取得・検索のビジネスロジック
 */

import { fetchLawData, searchLaws, getEgovUrl } from '../egov-client.js';
import {
  extractArticle,
  extractToc,
  listSupplProvisions,
  filterSupplProvisions,
  findSupplProvision,
  extractSupplArticle,
  type SupplProvisionInfo,
} from '../egov-parser.js';
import { NotFoundError } from '../errors.js';
import type { EgovLawSearchResult } from '../types.js';

export interface GetLawArticleResult {
  lawTitle: string;
  article: string;
  articleCaption: string;
  text: string;
  egovUrl: string;
  /** paragraph を省略して item を指定したとき、実際に一致した項番号 */
  matchedParagraph?: number;
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
  item?: string | number;
  subitem?: string;
}): Promise<GetLawArticleResult> {
  if (params.subitem !== undefined && params.item === undefined) {
    throw new NotFoundError(
      'subitem（イ・(1)・(i)）を指定するときは item（号番号）も指定してください。'
    );
  }

  const { data, lawId, lawTitle } = await fetchLawData(params.lawName);
  const egovUrl = getEgovUrl(lawId);

  const result = extractArticle(
    data,
    params.article,
    params.paragraph,
    params.item,
    params.subitem,
  );

  if (!result) {
    const articleDesc = `第${params.article}条`;
    const paraDesc = params.paragraph !== undefined ? `第${params.paragraph}項` : '';
    const itemDesc = params.item !== undefined ? `第${params.item}号` : '';
    const subDesc = params.subitem !== undefined ? ` ${params.subitem}` : '';
    const supplHint = /附則/.test(params.article)
      ? ' 附則の条は article に「附則」を含めず、supplementary で附則を指定してください（制定時附則は true、改正法の附則は "平成28年法律第15号" のような法令番号）。'
      : ' 経過措置や特例が本則に無い場合は、改正法の附則にあることが多いです（supplementary に改正法の法令番号を指定。附則の一覧は format="suppl"、supplementary で年や番号を渡すと絞り込めます）。';
    throw new NotFoundError(
      `${lawTitle} ${articleDesc}${paraDesc}${itemDesc}${subDesc} が見つかりませんでした。条文番号を確認してください。${supplHint}`
    );
  }

  return {
    lawTitle,
    article: params.article,
    articleCaption: result.articleCaption ?? '',
    text: result.text,
    egovUrl,
    matchedParagraph: result.matchedParagraph,
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

export interface GetSupplResult {
  lawTitle: string;
  /** 制定時附則なら undefined */
  amendLawNum?: string;
  extract: boolean;
  text: string;
  egovUrl: string;
}

/** 附則の一覧を取得する */
export async function listSuppl(params: { lawName: string; filter?: string }): Promise<{
  lawTitle: string;
  egovUrl: string;
  items: SupplProvisionInfo[];
  total: number;
}> {
  const { data, lawId, lawTitle } = await fetchLawData(params.lawName);
  const all = listSupplProvisions(data);
  const items = params.filter ? filterSupplProvisions(all, params.filter) : all;
  return { lawTitle, egovUrl: getEgovUrl(lawId), items, total: all.length };
}

/** 附則の条文（または附則ブロック全体）を取得する */
export async function getSupplProvision(params: {
  lawName: string;
  supplementary?: string | boolean;
  article?: string;
  paragraph?: number;
  item?: string | number;
  subitem?: string;
}): Promise<GetSupplResult> {
  const { data, lawId, lawTitle } = await fetchLawData(params.lawName);
  const egovUrl = getEgovUrl(lawId);

  const found = findSupplProvision(data, params.supplementary);
  if (!found) {
    const all = listSupplProvisions(data);
    const hint = all.length
      ? `この法令には附則が${all.length}件あります。format="suppl" で一覧を確認してください（supplementary に "平成28年" などを渡すと一覧を絞り込めます）。`
      : 'この法令に附則は収録されていません。';
    throw new NotFoundError(
      `${lawTitle} の附則「${String(params.supplementary ?? '制定')}」が見つかりませんでした。${hint}`
    );
  }
  if ('ambiguous' in found) {
    const list = found.ambiguous
      .map((i) => `  - ${i.amendLawNum ?? '（制定時附則）'}${i.extract ? '（抄）' : ''}`)
      .join('\n');
    throw new NotFoundError(
      `${lawTitle} の附則「${String(params.supplementary ?? '')}」が一意に定まりませんでした。候補:\n${list}`
    );
  }

  const result = extractSupplArticle(
    found.node,
    params.article,
    params.paragraph,
    params.item,
    params.subitem,
  );
  if (!result) {
    const label = found.info.amendLawNum ?? '制定時附則';
    const nums = found.info.articleNums.length
      ? `この附則が持つ条: ${found.info.articleNums.join(', ')}`
      : 'この附則は条を持たず、項のみで構成されています（article を省いて取得してください）。';
    throw new NotFoundError(
      `${lawTitle} 附則（${label}）${params.article ? ` 第${params.article}条` : ''} が見つかりませんでした。${nums}`
    );
  }

  return {
    lawTitle,
    amendLawNum: found.info.amendLawNum,
    extract: found.info.extract,
    text: result.text,
    egovUrl,
  };
}
