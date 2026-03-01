/**
 * 通達HTMLの解析
 * - TOCページからリンク構造を抽出（基本通達・措置法通達の複数形式に対応）
 * - 個別ページから特定の通達エントリを抽出
 */

import type { TsutatsuTocLink, TsutatsuEntry } from './types.js';

/**
 * TOCページのHTMLからリンク一覧を抽出
 *
 * @param html - TOC HTMLコンテンツ
 * @param tocFormat - TOCのHTML形式ヒント（省略時は 'kihon'）
 * @param tocPath - TOCページのパス（相対href解決用）
 */
export function parseTocLinks(
  html: string,
  tocFormat?: string,
  tocPath?: string
): TsutatsuTocLink[] {
  let links: TsutatsuTocLink[];

  switch (tocFormat) {
    case 'sochiho-li':
      links = parseTocLinks_SochihoLi(html, tocPath);
      break;
    case 'sochiho-p':
      links = parseTocLinks_SochihoP(html, tocPath);
      break;
    case 'sochiho-article':
      // 法人税措置法通達: 第X条 がリンクテキストに含まれるため kihon と同じパーサーで動く
      links = parseTocLinks_Kihon(html);
      break;
    default:
      links = parseTocLinks_Kihon(html);
      break;
  }

  // 重複除去（同じhrefのものは最初だけ）
  const seen = new Set<string>();
  return links.filter(link => {
    if (seen.has(link.href)) return false;
    seen.add(link.href);
    return true;
  });
}

/**
 * 基本通達形式のTOCパーサー
 *
 * 例: <a href="/law/tsutatsu/kihon/shotoku/04/07.htm">法第33条《譲渡所得》関係</a>
 */
function parseTocLinks_Kihon(html: string): TsutatsuTocLink[] {
  const links: TsutatsuTocLink[] = [];
  const linkRegex = /<a\s+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = linkRegex.exec(html)) !== null) {
    const href = match[1];
    const text = stripHtml(match[2]).trim();

    // 通達ページへのリンクのみ（/law/tsutatsu/ を含む）
    if (!href.includes('/law/tsutatsu/')) continue;
    if (!text) continue;

    const articlePrefix = extractArticlePrefix(text);

    links.push({ text, href: href.split('#')[0], articlePrefix });
  }

  return links;
}

/**
 * 措置法通達 <li> 形式のTOCパーサー
 *
 * 例: <li>33-1&emsp;<a href="/law/tsutatsu/.../soti33/01.htm#a-33-1">収用又は使用の範囲</a></li>
 * 例: <li>37の10・37の11共-1&emsp;<a href="...#s1011k-01">株式等に係る...</a></li>
 */
function parseTocLinks_SochihoLi(html: string, tocPath?: string): TsutatsuTocLink[] {
  const links: TsutatsuTocLink[] = [];

  // <li> タグ内の通達番号 + <a> リンクを抽出
  const pattern = /<li[^>]*>\s*([\dの・共]+[\-−–ー－][\dの・共\-−–ー－]+)\s*(?:&emsp;|[\s　]+)\s*<a\s+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = pattern.exec(html)) !== null) {
    const tsutatsuNumber = normalizeDashes(match[1].trim());
    const rawHref = match[2];
    const text = stripHtml(match[3]).trim();

    const fullHref = resolveHref(rawHref, tocPath);
    const href = fullHref.split('#')[0];

    if (!text) continue;

    const prefix = extractPrefixFromNumber(tsutatsuNumber);

    links.push({
      text: `${tsutatsuNumber} ${text}`,
      href,
      fullHref,
      articlePrefix: prefix,
      tsutatsuNumber,
    });
  }

  // フォールバック: <li> パターンで取れなかった場合、kihonパーサーも試す（混在TOC対応）
  if (links.length === 0) {
    return parseTocLinks_Kihon(html);
  }

  return links;
}

/**
 * 措置法通達 <p> 形式のTOCパーサー
 *
 * 例: <p class="indent1"><strong>10-1</strong>&emsp;<a href="...#a-01">試験研究の意義</a></p>
 * 例: <p class="indent2">69の4-1　<a href="...#a-4-1">加算対象贈与財産</a></p>
 * 例: <p class="indent1">3-1　<a href="...">源泉分離課税の効果</a></p>
 */
function parseTocLinks_SochihoP(html: string, tocPath?: string): TsutatsuTocLink[] {
  const links: TsutatsuTocLink[] = [];

  // パターン1: <strong> 内に番号がある場合
  // <p...><strong>10-1</strong>&emsp;<a href="...">text</a>
  const pattern1 = /<p[^>]*>\s*<strong>\s*([\dの・共]+[\-−–ー－][\dの・共\-−–ー－]*)\s*<\/strong>\s*(?:&emsp;|[\s　]+)\s*<a\s+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;

  // パターン2: 番号が直書きの場合
  // <p...>69の4-1　<a href="...">text</a>
  const pattern2 = /<p[^>]*>\s*([\dの・共]+[\-−–ー－][\dの・共\-−–ー－]*)\s*(?:&emsp;|[\s　]+)\s*<a\s+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;

  let match;

  while ((match = pattern1.exec(html)) !== null) {
    const tsutatsuNumber = normalizeDashes(match[1].trim());
    const rawHref = match[2];
    const text = stripHtml(match[3]).trim();

    const fullHref = resolveHref(rawHref, tocPath);
    const href = fullHref.split('#')[0];

    if (!text) continue;

    const prefix = extractPrefixFromNumber(tsutatsuNumber);

    links.push({
      text: `${tsutatsuNumber} ${text}`,
      href,
      fullHref,
      articlePrefix: prefix,
      tsutatsuNumber,
    });
  }

  // パターン1で取れなかった分をパターン2で補完
  while ((match = pattern2.exec(html)) !== null) {
    const tsutatsuNumber = normalizeDashes(match[1].trim());
    const rawHref = match[2];
    const text = stripHtml(match[3]).trim();

    const fullHref = resolveHref(rawHref, tocPath);
    const href = fullHref.split('#')[0];

    if (!text) continue;

    // パターン1で既に取得済みかチェック
    if (links.some(l => l.tsutatsuNumber === tsutatsuNumber)) continue;

    const prefix = extractPrefixFromNumber(tsutatsuNumber);

    links.push({
      text: `${tsutatsuNumber} ${text}`,
      href,
      fullHref,
      articlePrefix: prefix,
      tsutatsuNumber,
    });
  }

  // フォールバック: パターンで取れなかった場合、kihonパーサーも試す
  if (links.length === 0) {
    return parseTocLinks_Kihon(html);
  }

  return links;
}

/**
 * 通達番号から該当ページURLを特定する
 *
 * 検索優先順位:
 * 1. tsutatsuNumber完全一致（措置法通達形式）
 * 2. tsutatsuNumberプレフィックス一致
 * 3. articlePrefix完全一致（基本通達形式）
 * 4. テキスト内「第{prefix}条」検索
 * 5. 数値フォールバック
 */
export function findPageForNumber(
  tocLinks: TsutatsuTocLink[],
  tsutatsuNumber: string
): string | null {
  const normalizedInput = normalizeDashes(tsutatsuNumber);

  // 1. tsutatsuNumber完全一致（ダッシュ正規化後）
  for (const link of tocLinks) {
    if (link.tsutatsuNumber && normalizeDashes(link.tsutatsuNumber) === normalizedInput) {
      return link.href;
    }
  }

  // 通達番号のプレフィックスを取得
  // "33-6" → "33", "2-1-1" → "2", "33-6の2" → "33"
  const prefix = tsutatsuNumber.split(/[-−–ー－]/)[0].replace(/の.*$/, '').trim();

  // 2. tsutatsuNumberのプレフィックス一致（同じ条のページを見つける）
  for (const link of tocLinks) {
    if (link.tsutatsuNumber) {
      const linkPrefix = link.tsutatsuNumber.split(/[-−–ー－]/)[0].replace(/の.*$/, '').trim();
      if (linkPrefix === prefix) {
        return link.href;
      }
    }
  }

  // 3. articlePrefix完全一致（基本通達形式）
  for (const link of tocLinks) {
    if (link.articlePrefix === prefix) {
      return link.href;
    }
  }

  // 4. テキスト内で "第{prefix}条" を含むリンクを検索
  const articlePattern = new RegExp(`第${escapeRegex(prefix)}条`);
  for (const link of tocLinks) {
    if (articlePattern.test(link.text)) {
      return link.href;
    }
  }

  // 5. フォールバック: プレフィックスの数値でリンクテキスト内の数字を検索
  const prefixNum = parseInt(prefix, 10);
  if (!isNaN(prefixNum)) {
    for (const link of tocLinks) {
      const nums = link.text.match(/第(\d+)条/);
      if (nums && parseInt(nums[1], 10) === prefixNum) {
        return link.href;
      }
    }
  }

  return null;
}

/**
 * 通達番号のページがTOCから見つからない場合に候補ページを返す
 *
 * NTAサイトのTOCは複数のリンク形式がある:
 * 1. 条文ベース: "法第33条《...》関係" → prefix=33
 * 2. テーマベース: "〔収入金額〕" → prefix=undefined
 * 3. 通達番号ベース: "33-1 収用又は使用の範囲" → tsutatsuNumber="33-1"
 *
 * 近い番号のページを優先し、次にテーマベースのリンクを返す。
 */
export function getCandidatePages(
  tocLinks: TsutatsuTocLink[],
  tsutatsuNumber: string
): string[] {
  const prefix = tsutatsuNumber.split(/[-−–ー－]/)[0].replace(/の.*$/, '').trim();
  const prefixNum = parseInt(prefix, 10);

  const candidates: string[] = [];
  const seen = new Set<string>();

  // 1. tsutatsuNumber ベースの近いページ（措置法通達用）
  if (!isNaN(prefixNum)) {
    for (const link of tocLinks) {
      if (link.tsutatsuNumber) {
        const linkPrefix = link.tsutatsuNumber.split(/[-−–ー－]/)[0].replace(/の.*$/, '').trim();
        const linkNum = parseInt(linkPrefix, 10);
        if (!isNaN(linkNum) && Math.abs(linkNum - prefixNum) <= 5) {
          if (!seen.has(link.href)) {
            candidates.push(link.href);
            seen.add(link.href);
          }
        }
      }
    }
  }

  // 2. 条文番号ベースの近いページ
  if (!isNaN(prefixNum)) {
    for (const link of tocLinks) {
      if (link.articlePrefix) {
        const linkNum = parseInt(link.articlePrefix, 10);
        if (!isNaN(linkNum) && Math.abs(linkNum - prefixNum) <= 5) {
          if (!seen.has(link.href)) {
            candidates.push(link.href);
            seen.add(link.href);
          }
        }
      }
    }
  }

  // 3. テーマベースのリンク（prefixなし）も候補に追加
  for (const link of tocLinks) {
    if (!link.articlePrefix && !link.tsutatsuNumber && link.href.includes('/law/tsutatsu/') && !link.href.endsWith('menu.htm')) {
      if (!seen.has(link.href)) {
        candidates.push(link.href);
        seen.add(link.href);
      }
    }
  }

  return candidates;
}

/**
 * 通達ページのHTMLから特定の通達エントリを抽出する
 *
 * NTAサイトでは通達番号が2パターンのHTMLで記述される:
 * 1. <strong>36－1</strong>（1タグ）
 * 2. <strong>36</strong><strong>－15</strong>（分割タグ）
 * 両方に対応するため、strongタグをまたいだマッチングを行う
 */
export function extractTsutatsuEntry(
  html: string,
  number: string,
  pageUrl: string
): TsutatsuEntry | null {
  // ダッシュの表記揺れに対応: -, −(U+2212), –(U+2013), ー(長音), -(U+FF0D), -(U+FF0D全角)
  const normalizedNumber = number
    .replace(/[-−–ー－]/g, '[\\-−–ー－]');

  // パターン1: 1つのstrongタグ内に完結
  const pattern1 = new RegExp(
    `<strong>\\s*${normalizedNumber}(の\\d+)?\\s*</strong>`,
    'i'
  );

  // パターン2: strongタグをまたぐ（<strong>36</strong><strong>－15</strong>）
  // 番号のプレフィックスとサフィックスに分割
  const dashParts = number.split(/[-−–ー－]/);
  let pattern2: RegExp | null = null;
  if (dashParts.length >= 2) {
    const prefix = dashParts[0].trim();
    const suffix = dashParts.slice(1).join('[\\-−–ー－]');
    pattern2 = new RegExp(
      `<strong>\\s*${prefix}\\s*</strong>\\s*<strong>\\s*[\\-−–ー－]\\s*${suffix}(の\\d+)?\\s*</strong>`,
      'i'
    );
  }

  let match = pattern1.exec(html);
  if (!match && pattern2) {
    match = pattern2.exec(html);
  }

  if (!match) return null;

  const startIdx = match.index;

  // このエントリの見出し（直前の<h2>を探す）
  const caption = findPrecedingCaption(html, startIdx);

  // エントリの範囲を特定
  const entryText = extractEntryText(html, startIdx);

  return {
    number,
    caption,
    body: entryText,
    url: pageUrl,
  };
}

/**
 * TOC構造を人間が読みやすいテキストに変換
 */
export function formatTocAsText(
  tocLinks: TsutatsuTocLink[],
  sectionFilter?: string
): string {
  let links = tocLinks;

  if (sectionFilter) {
    const filter = sectionFilter.toLowerCase();
    links = tocLinks.filter(
      link => link.text.toLowerCase().includes(filter) ||
              (link.articlePrefix && link.articlePrefix === sectionFilter.replace(/[^0-9]/g, '')) ||
              (link.tsutatsuNumber && normalizeDashes(link.tsutatsuNumber).startsWith(sectionFilter.split(/[-−–ー－]/)[0]))
    );
  }

  if (links.length === 0) {
    return sectionFilter
      ? `"${sectionFilter}" に一致するセクションが見つかりませんでした。`
      : '目次が取得できませんでした。';
  }

  return links.map(link => `- ${link.text}`).join('\n');
}

// --- 内部ヘルパー ---

/** HTMLタグを除去 */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&emsp;/g, '　')
    .replace(/&ensp;/g, ' ')
    .replace(/&thinsp;/g, '')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&quot;/g, '"');
}

/** テキストから条文番号プレフィックスを抽出 */
function extractArticlePrefix(text: string): string | undefined {
  // "法第33条《...》関係" → "33"
  const match = text.match(/第(\d+)条/);
  if (match) return match[1];

  // "第3号から" → "3"
  const numMatch = text.match(/第(\d+)号/);
  if (numMatch) return numMatch[1];

  return undefined;
}

/** 通達番号からプレフィックスを抽出 */
function extractPrefixFromNumber(num: string): string | undefined {
  const normalized = normalizeDashes(num);
  const prefix = normalized.split('-')[0].replace(/の.*$/, '').trim();
  return prefix || undefined;
}

/** 全てのダッシュ系文字をASCIIハイフンに正規化 */
function normalizeDashes(s: string): string {
  return s.replace(/[−–ー－]/g, '-');
}

/** 相対hrefをTOCページのディレクトリを基準に解決 */
function resolveHref(href: string, tocPath?: string): string {
  // 既に絶対パスの場合はそのまま
  if (href.startsWith('/law/tsutatsu/') || href.startsWith('http')) return href;

  if (!tocPath) return href;

  // TOCページのディレクトリを取得
  const tocDir = tocPath.substring(0, tocPath.lastIndexOf('/') + 1);
  return tocDir + href;
}

/** 正規表現のエスケープ */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 直前の<h2>見出しを探す */
function findPrecedingCaption(html: string, startIdx: number): string {
  // startIdxより前の最後の<h2>...</h2>を探す
  const before = html.substring(0, startIdx);
  const h2Matches = [...before.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)];
  if (h2Matches.length === 0) return '';
  const lastH2 = h2Matches[h2Matches.length - 1];
  return stripHtml(lastH2[1]).trim();
}

/** エントリのテキスト本文を抽出 */
function extractEntryText(html: string, startIdx: number): string {
  // 開始位置から先のHTMLを取得
  const remaining = html.substring(startIdx);

  // 次の通達エントリの開始 or <h2> を見つける
  // 通達エントリは <strong>数字</strong> パターン
  const nextEntryPattern = /(?:<strong>\s*\d+[-−–]\d+|<h2[\s>])/i;
  // 最初のマッチをスキップ（自身）して、2番目以降を探す
  const afterSelf = remaining.substring(remaining.indexOf('</strong>') + '</strong>'.length);
  const nextMatch = nextEntryPattern.exec(afterSelf);

  let endIdx: number;
  if (nextMatch) {
    endIdx = remaining.indexOf('</strong>') + '</strong>'.length + nextMatch.index;
  } else {
    // ページ末尾まで（ただしフッター等は除外）
    const footerIdx = remaining.indexOf('id="footer"');
    endIdx = footerIdx > 0 ? footerIdx : remaining.length;
  }

  const entryHtml = remaining.substring(0, endIdx);

  // HTMLをテキストに変換
  let text = entryHtml;
  // <br> → 改行
  text = text.replace(/<br\s*\/?>/gi, '\n');
  // <p> → 改行
  text = text.replace(/<\/p>/gi, '\n');
  text = text.replace(/<p[^>]*>/gi, '');
  // HTMLタグ除去
  text = stripHtml(text);
  // 連続空行を整理
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
}
