/**
 * 通達サービス
 * 国税庁サイトから基本通達・措置法通達を取得するビジネスロジック
 */

import { resolveTsutatsuName, listSupportedTsutatsu } from '../tsutatsu-registry.js';
import { fetchTsutatsuToc, fetchNtaPage, getNtaUrl } from '../tsutatsu-client.js';
import { parseTocLinks, findPageForNumber, extractTsutatsuEntry, getCandidatePages, formatTocAsText } from '../tsutatsu-parser.js';
import { NotFoundError, UnsupportedError } from '../errors.js';
import type { TsutatsuEntry, TsutatsuTocLink } from '../types.js';

export interface GetTsutatsuResult {
  tsutatsuName: string;
  entry: TsutatsuEntry;
}

export interface ListTsutatsuResult {
  tsutatsuName: string;
  tocText: string;
  tocUrl: string;
}

/**
 * 特定の通達エントリを取得
 *
 * 検索フロー:
 * 1. TOCから該当ページを特定
 * 2. ページ内で通達番号を検索
 * 3. 見つからなければ前後ページをフォールバック検索
 * 4. それでもなければ候補ページをフォールバック検索
 */
export async function getTsutatsu(params: {
  tsutatsuName: string;
  number: string;
}): Promise<GetTsutatsuResult> {
  const { name, entry } = resolveTsutatsuName(params.tsutatsuName);

  if (!entry) {
    const supported = listSupportedTsutatsu();
    throw new UnsupportedError(
      `通達 "${params.tsutatsuName}" は対応していません。\n\n対応通達:\n${supported.map(s => `- ${s}`).join('\n')}`
    );
  }

  // 1. TOCページを取得
  const tocHtml = await fetchTsutatsuToc(entry.tocPath, entry.encoding);

  // 2. TOCリンクを解析
  const tocLinks = parseTocLinks(tocHtml, entry.tocFormat, entry.tocPath);

  // 3. 通達番号から該当ページを特定
  const pageHref = findPageForNumber(tocLinks, params.number);

  // 4. ページを取得してエントリを抽出（フォールバック付き）
  let tsutatsuEntry: TsutatsuEntry | null = null;

  if (pageHref) {
    const pageHtml = await fetchNtaPage(pageHref, entry.encoding);
    const pageUrl = getNtaUrl(pageHref);
    tsutatsuEntry = extractTsutatsuEntry(pageHtml, params.number, pageUrl);

    if (!tsutatsuEntry) {
      // フォールバック: 同セクションの前後ページも検索
      tsutatsuEntry = await searchNearbyPages(tocLinks, pageHref, params.number, entry.encoding);
    }
  }

  // TOCからページが見つからなかった or ページ内に見つからなかった場合
  if (!tsutatsuEntry) {
    const candidates = getCandidatePages(tocLinks, params.number);
    for (const candidateHref of candidates) {
      if (candidateHref === pageHref) continue;
      try {
        const html = await fetchNtaPage(candidateHref, entry.encoding);
        const url = getNtaUrl(candidateHref);
        tsutatsuEntry = extractTsutatsuEntry(html, params.number, url);
        if (tsutatsuEntry) break;
      } catch {
        // skip
      }
    }
  }

  if (!tsutatsuEntry) {
    throw new NotFoundError(
      `${name} ${params.number} が見つかりませんでした。\n\n通達番号の表記を確認してください（例: "33-6", "2-1-1"）。`
    );
  }

  return { tsutatsuName: name, entry: tsutatsuEntry };
}

/**
 * 通達の目次を取得
 */
export async function listTsutatsuToc(params: {
  tsutatsuName: string;
  section?: string;
}): Promise<ListTsutatsuResult> {
  const { name, entry } = resolveTsutatsuName(params.tsutatsuName);

  if (!entry) {
    const supported = listSupportedTsutatsu();
    throw new UnsupportedError(
      `通達 "${params.tsutatsuName}" は対応していません。\n\n対応通達:\n${supported.map(s => `- ${s}`).join('\n')}`
    );
  }

  const tocHtml = await fetchTsutatsuToc(entry.tocPath, entry.encoding);
  const tocLinks = parseTocLinks(tocHtml, entry.tocFormat, entry.tocPath);
  const tocText = formatTocAsText(tocLinks, params.section);
  const tocUrl = getNtaUrl(entry.tocPath);

  return { tsutatsuName: name, tocText, tocUrl };
}

/**
 * フォールバック: 該当ページの前後のページも検索
 */
async function searchNearbyPages(
  tocLinks: TsutatsuTocLink[],
  currentHref: string,
  number: string,
  encoding: 'shift_jis' | 'utf-8'
): Promise<TsutatsuEntry | null> {
  const currentIdx = tocLinks.findIndex(l => l.href === currentHref);
  if (currentIdx === -1) return null;

  const start = Math.max(0, currentIdx - 2);
  const end = Math.min(tocLinks.length, currentIdx + 3);

  for (let i = start; i < end; i++) {
    if (tocLinks[i].href === currentHref) continue;

    try {
      const html = await fetchNtaPage(tocLinks[i].href, encoding);
      const pageUrl = getNtaUrl(tocLinks[i].href);
      const entry = extractTsutatsuEntry(html, number, pageUrl);
      if (entry) return entry;
    } catch {
      // ページ取得エラーは無視して次へ
    }
  }

  return null;
}
