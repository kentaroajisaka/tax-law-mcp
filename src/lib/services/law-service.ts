/**
 * 法令サービス
 * e-Gov法令API v2 を使った条文取得・検索のビジネスロジック
 */

import {
  fetchLawData,
  searchLaws,
  getEgovUrl,
  fetchLawRevisions,
  fetchArticleSnapshot,
  ARTICLE_MISSING,
} from '../egov-client.js';
import {
  normalizeArticleNum,
  extractArticle,
  extractToc,
  listSupplProvisions,
  findSupplProvision,
  extractSupplArticle,
  type SupplProvisionInfo,
} from '../egov-parser.js';
import { NotFoundError } from '../errors.js';
import type { EgovLawSearchResult, EgovRevisionInfo } from '../types.js';

export interface GetLawArticleResult {
  lawTitle: string;
  article: string;
  articleCaption: string;
  text: string;
  egovUrl: string;
  /** paragraph を省略して item を指定したとき、実際に一致した項番号 */
  matchedParagraph?: number;
  /** 取得した版 */
  version?: LawVersionInfo;
  /** 取得した版より後の改正でこの条が変わるか */
  amendments?: AmendmentCheck;
}

/** 取得した版の情報 */
export interface LawVersionInfo {
  revisionId: string;
  /** 施行日（予定日を含む）。不明なら undefined */
  enforcementDate?: string;
  /** 施行日が「予定」（政令で定める日など）か */
  scheduled: boolean;
  amendmentLawTitle?: string;
  amendmentLawNum?: string;
  status?: string;
  /** 指定された asof */
  asof?: string;
}

export interface LaterRevision {
  revisionId: string;
  enforcementDate?: string;
  scheduled: boolean;
  amendmentLawTitle?: string;
  amendmentLawNum?: string;
  status?: string;
  /** この条が直前の版から変わるか。確かめられなかったら null */
  changed: boolean | null;
  /** この版で条が無い（削除） */
  missing?: boolean;
}

export interface AmendmentCheck {
  /** 取得した版より後の改正（確かめた分。古い順） */
  later: LaterRevision[];
  /** 件数が多く確かめなかった改正の件数 */
  unchecked: number;
  /** 確かめられなかった理由（取得失敗など） */
  error?: string;
}

/** この件数を超える後の改正は条ごとの比較をしない（e-Gov への問い合わせを抑える） */
const MAX_AMENDMENT_CHECKS = 12;

const ASOF_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function validateAsof(asof: string | undefined): void {
  if (asof === undefined) return;
  if (!ASOF_PATTERN.test(asof) || Number.isNaN(Date.parse(asof))) {
    throw new NotFoundError(
      `asof は YYYY-MM-DD 形式で指定してください（例: "2027-01-01"）。指定値: "${asof}"`
    );
  }
}

function revisionDate(r: EgovRevisionInfo): { date?: string; scheduled: boolean } {
  if (r.amendment_enforcement_date) return { date: r.amendment_enforcement_date, scheduled: false };
  if (r.amendment_scheduled_enforcement_date) {
    return { date: r.amendment_scheduled_enforcement_date, scheduled: true };
  }
  return { date: undefined, scheduled: true };
}

function toVersionInfo(r: EgovRevisionInfo | undefined, asof?: string): LawVersionInfo | undefined {
  if (!r?.law_revision_id) return undefined;
  const { date, scheduled } = revisionDate(r);
  return {
    revisionId: r.law_revision_id,
    enforcementDate: date,
    scheduled,
    amendmentLawTitle: r.amendment_law_title ?? undefined,
    amendmentLawNum: r.amendment_law_num ?? undefined,
    status: r.current_revision_status ?? undefined,
    asof,
  };
}

/**
 * 取得した版より後に施行される（された）改正で、この条が変わるかを確かめる。
 * 版ごとに1条だけ（elm 指定、数KB）を取得して直前の版と比べる。
 */
export async function checkLaterAmendments(
  lawId: string,
  baseRevisionId: string,
  article: string,
): Promise<AmendmentCheck> {
  const revisions = await fetchLawRevisions(lawId);
  const baseIndex = revisions.findIndex((r) => r.law_revision_id === baseRevisionId);
  if (baseIndex < 0) {
    return { later: [], unchecked: 0, error: '取得した版が改正履歴に見つかりませんでした' };
  }
  // law_revisions は新しい版が先頭。base より新しいものを古い順に並べる
  const newer = revisions.slice(0, baseIndex).reverse();
  const targets = newer.slice(0, MAX_AMENDMENT_CHECKS);
  const unchecked = newer.length - targets.length;
  if (targets.length === 0) return { later: [], unchecked: 0 };

  const num = normalizeArticleNum(article);
  const ids = [baseRevisionId, ...targets.map((r) => r.law_revision_id)];
  const snapshots = await Promise.all(
    ids.map((id) => fetchArticleSnapshot(id, num).catch(() => null)),
  );

  const later: LaterRevision[] = [];
  let prev = snapshots[0];
  targets.forEach((r, i) => {
    const cur = snapshots[i + 1];
    const { date, scheduled } = revisionDate(r);
    const changed = prev === null || cur === null ? null : prev !== cur;
    later.push({
      revisionId: r.law_revision_id,
      enforcementDate: date,
      scheduled,
      amendmentLawTitle: r.amendment_law_title ?? undefined,
      amendmentLawNum: r.amendment_law_num ?? undefined,
      status: r.current_revision_status ?? undefined,
      changed,
      missing: cur === ARTICLE_MISSING ? true : undefined,
    });
    if (cur !== null) prev = cur;
  });

  const failed = snapshots.some((x) => x === null);
  return {
    later,
    unchecked,
    error: failed ? '一部の版を取得できず、変わるかどうかを確かめられませんでした' : undefined,
  };
}

const STATUS_LABEL: Record<string, string> = {
  CurrentEnforced: '現行',
  PreviousEnforced: '旧版（その後に改正済み）',
  UnEnforced: '未施行（将来の版）',
};

function dateLabel(date: string | undefined, scheduled: boolean): string {
  if (!date) return '施行日未定';
  return scheduled ? `${date} 施行（予定）` : `${date} 施行`;
}

function lawLabel(title?: string, num?: string): string {
  if (!title && !num) return '';
  return `${title ?? ''}${num ? `（${num}）` : ''}`;
}

/**
 * 版の情報と後の改正の注記を、条文の後ろに付ける文章にする（MCP と REST で共用）
 */
export function formatVersionNote(
  version: LawVersionInfo | undefined,
  amendments: AmendmentCheck | undefined,
): string {
  if (!version) return '';
  const lines: string[] = [];
  const status = version.status ? STATUS_LABEL[version.status] ?? version.status : '';
  const by = lawLabel(version.amendmentLawTitle, version.amendmentLawNum);
  const asofText = version.asof ? `asof=${version.asof} で取得。` : '';
  lines.push(
    `【版】${asofText}${dateLabel(version.enforcementDate, version.scheduled)}の版` +
      `${by ? `（${by}による改正まで）` : ''}${status ? `／${status}` : ''}`,
  );

  if (amendments) {
    const changed = amendments.later.filter((r) => r.changed === true);
    const unknown = amendments.later.filter((r) => r.changed === null);
    const total = amendments.later.length + amendments.unchecked;
    if (total === 0) {
      lines.push('【この版より後の改正】ありません（e-Gov に収録されている範囲）。');
    } else if (changed.length === 0 && unknown.length === 0 && amendments.unchecked === 0) {
      lines.push(`【この版より後の改正】${total}件ありますが、いずれもこの条を変えません。`);
    } else {
      if (changed.length > 0) {
        lines.push(`【⚠ この版より後の改正でこの条が変わります】（後の改正 ${total}件のうち）`);
      } else {
        lines.push(`【この版より後の改正】${total}件。この条が変わるかを確かめきれていません。`);
      }
      for (const r of changed) {
        const note = r.missing ? '（この版で条が無くなる）' : '';
        lines.push(
          `- ${dateLabel(r.enforcementDate, r.scheduled)}　${lawLabel(r.amendmentLawTitle, r.amendmentLawNum)}${note}`,
        );
      }
      for (const r of unknown) {
        lines.push(
          `- ${dateLabel(r.enforcementDate, r.scheduled)}　${lawLabel(r.amendmentLawTitle, r.amendmentLawNum)}（変わるか確かめられず）`,
        );
      }
      if (amendments.unchecked > 0) {
        lines.push(`- ほかに ${amendments.unchecked}件の後の改正は確かめていません`);
      }
      const firstDate = changed.find((r) => r.enforcementDate)?.enforcementDate;
      lines.push(
        `→ 改正後の条文は asof="${firstDate ?? 'YYYY-MM-DD'}" のように施行日を指定して取得してください。` +
          '施行日と適用年分（事業年度）は一致しないことがあるので、適用関係は改正法の附則で確かめてください。',
      );
    }
    if (amendments.error) lines.push(`（注）${amendments.error}`);
  }
  return lines.join('\n');
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
  /** 版の指定日（YYYY-MM-DD）。省略時は今日の時点で施行中の版 */
  asof?: string;
  /** 後の改正でこの条が変わるかを確かめる（既定 true） */
  checkAmendments?: boolean;
}): Promise<GetLawArticleResult> {
  validateAsof(params.asof);
  if (params.subitem !== undefined && params.item === undefined) {
    throw new NotFoundError(
      'subitem（イ・(1)・(i)）を指定するときは item（号番号）も指定してください。'
    );
  }

  const { data, lawId, lawTitle } = await fetchLawData(params.lawName, params.asof);
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
    throw new NotFoundError(
      `${lawTitle} ${articleDesc}${paraDesc}${itemDesc}${subDesc} が見つかりませんでした。条文番号を確認してください。`
    );
  }

  const version = toVersionInfo(data.revision_info, params.asof);
  let amendments: AmendmentCheck | undefined;
  if (version && params.checkAmendments !== false) {
    try {
      amendments = await checkLaterAmendments(lawId, version.revisionId, params.article);
    } catch (e) {
      amendments = {
        later: [],
        unchecked: 0,
        error: `後の改正を確かめられませんでした（${e instanceof Error ? e.message : String(e)}）`,
      };
    }
  }

  return {
    lawTitle,
    article: params.article,
    articleCaption: result.articleCaption ?? '',
    text: result.text,
    egovUrl,
    matchedParagraph: result.matchedParagraph,
    version,
    amendments,
  };
}

/**
 * 法令の目次を取得
 */
export async function getLawToc(params: {
  lawName: string;
  asof?: string;
}): Promise<GetLawTocResult> {
  validateAsof(params.asof);
  const { data, lawId, lawTitle } = await fetchLawData(params.lawName, params.asof);
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
export async function listSuppl(params: { lawName: string; asof?: string }): Promise<{
  lawTitle: string;
  egovUrl: string;
  items: SupplProvisionInfo[];
}> {
  validateAsof(params.asof);
  const { data, lawId, lawTitle } = await fetchLawData(params.lawName, params.asof);
  return { lawTitle, egovUrl: getEgovUrl(lawId), items: listSupplProvisions(data) };
}

/** 附則の条文（または附則ブロック全体）を取得する */
export async function getSupplProvision(params: {
  lawName: string;
  supplementary?: string | boolean;
  article?: string;
  paragraph?: number;
  item?: string | number;
  subitem?: string;
  asof?: string;
}): Promise<GetSupplResult> {
  validateAsof(params.asof);
  const { data, lawId, lawTitle } = await fetchLawData(params.lawName, params.asof);
  const egovUrl = getEgovUrl(lawId);

  const found = findSupplProvision(data, params.supplementary);
  if (!found) {
    const all = listSupplProvisions(data);
    const hint = all.length
      ? `この法令には附則が${all.length}件あります。format="suppl" で一覧を確認してください。`
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
