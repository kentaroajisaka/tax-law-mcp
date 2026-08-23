/**
 * 通達HTMLの解析
 * - TOCページからリンク構造を抽出（基本通達・措置法通達の複数形式に対応）
 * - 個別ページから特定の通達エントリを抽出
 */

import type { TsutatsuTocLink, TsutatsuEntry } from './types.js';
import { stripTags } from './html-utils.js';

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
 * NTAの目次では「法第XX条《...》関係」が見出しになっており、2形式が混在する:
 *   1. 見出しにリンクが張られている（例: 法第48条）→ articlePrefix で到達可能
 *   2. 見出しは素の <p> のままで、配下の「令第◯条関係」サブリンクに
 *      実体がぶら下がる（例: 法第47条・第49条）→ サブリンクの articlePrefix は
 *      「令第99条」等の令番号になり、法条番号(47/49)からは辿れない
 *
 * そこでドキュメント順に走査し、直前に現れた「法第XX条…関係」見出しの条番号を
 * parentArticlePrefix として各サブリンクへ付与する。これにより見出しにリンクが
 * 無い条でも配下ページに到達できる。
 *
 * 例:
 *   <p>法第47条《棚卸資産...》関係</p>                       （リンク無し見出し → parent=47）
 *   <ul><li><a href=".../08/01.htm">〔...令第99条関係〕</a></li></ul>  （parent=47 が付く）
 *   <p><a href=".../08/04.htm">法第48条《...》関係</a></p>   （リンク有り見出し）
 */
function parseTocLinks_Kihon(html: string): TsutatsuTocLink[] {
  const links: TsutatsuTocLink[] = [];

  // 「法第XX条…関係」見出し（素のテキスト）と <a> リンクを出現順に走査。
  // 見出しがリンク化されている場合は <a> 側（alt2）にマッチするため、
  // alt1 にマッチするのはリンクの張られていない見出しのみとなる。
  const tokenRegex =
    /法第(\d+)条(?:の\d+)?《[^》]*》関係|<a\s+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;

  let currentParentPrefix: string | undefined;
  let match;

  while ((match = tokenRegex.exec(html)) !== null) {
    // alt1: リンクの張られていない「法第XX条…関係」見出し
    if (match[1] !== undefined) {
      currentParentPrefix = match[1];
      continue;
    }

    // alt2: <a> リンク
    const href = match[2];
    const text = stripTags(match[3]).trim();

    // 通達ページへのリンクのみ（/law/tsutatsu/ を含む）
    if (!href.includes('/law/tsutatsu/')) continue;
    if (!text) continue;

    // リンクテキスト自体が「法第XX条…関係」見出しなら親条番号を更新
    const headingNum = extractArticleHeadingNumber(text);
    if (headingNum) currentParentPrefix = headingNum;

    const articlePrefix = extractArticlePrefix(text);

    links.push({
      text,
      href: href.split('#')[0],
      articlePrefix,
      parentArticlePrefix: currentParentPrefix,
    });
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
    const text = stripTags(match[3]).trim();

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
    const text = stripTags(match[3]).trim();

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
    const text = stripTags(match[3]).trim();

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

  // 3. articlePrefix完全一致（基本通達形式・見出しにリンクがある条）
  for (const link of tocLinks) {
    if (link.articlePrefix === prefix) {
      return link.href;
    }
  }

  // 3.5 parentArticlePrefix完全一致（見出しにリンクが無い条の配下サブリンク）
  //     例: "47-1" → 法第47条見出し配下の /08/01.htm（令第99条関係）
  for (const link of tocLinks) {
    if (link.parentArticlePrefix === prefix) {
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

  // 0. parentArticlePrefix 完全一致（見出しにリンクが無い条の配下サブリンク群）
  //    例: "47-8" が /08/01.htm に無くても、法第47条配下の /08/02・/08/03 を候補にする
  for (const link of tocLinks) {
    if (link.parentArticlePrefix === prefix && !seen.has(link.href)) {
      candidates.push(link.href);
      seen.add(link.href);
    }
  }

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

  // 番号のプレフィックスとサフィックスに分割（タグ分割記述用）
  const dashParts = number.split(/[-−–ー－]/);
  const hasSplit = dashParts.length >= 2;
  const splitPrefix = hasSplit ? dashParts[0].trim() : '';
  const splitSuffix = hasSplit ? dashParts.slice(1).join('[\\-−–ー－]') : '';

  // 通達番号は「1タグ完結」または「タグ分割（<strong>49</strong><strong>－1</strong>）」の
  // いずれかで記述される。両形式のパターンを、末尾の枝番指定 branch を差し替えて生成する。
  const buildPatterns = (branch: string): RegExp[] => {
    const pats: RegExp[] = [
      // パターン1: 1つのstrongタグ内に完結
      new RegExp(`<strong>\\s*${normalizedNumber}${branch}\\s*</strong>`, 'i'),
    ];
    if (hasSplit) {
      // パターン2: strongタグをまたぐ（<strong>36</strong><strong>－15</strong>）
      pats.push(
        new RegExp(
          `<strong>\\s*${splitPrefix}\\s*</strong>\\s*<strong>\\s*[\\-−–ー－]\\s*${splitSuffix}${branch}\\s*</strong>`,
          'i'
        )
      );
    }
    return pats;
  };

  // 枝番「の◯」を含まない完全一致を最優先し、無ければ枝番許容にフォールバックする。
  // 例: "49-1" 検索時に "49-1の2" を誤って拾わず、実在する "49-1" を返すため。
  const patternTiers = [
    buildPatterns(''),              // 1) 完全一致（枝番なし）
    buildPatterns('(?:の\\d+)+'),   // 2) 枝番あり（49-1の2, 49-1の3の2 等）にフォールバック
  ];

  let match: RegExpExecArray | null = null;
  for (const tier of patternTiers) {
    for (const pat of tier) {
      match = pat.exec(html);
      if (match) break;
    }
    if (match) break;
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
    const numericFilter = sectionFilter.replace(/[^0-9]/g, '');
    links = tocLinks.filter(
      link => link.text.toLowerCase().includes(filter) ||
              (link.articlePrefix && link.articlePrefix === numericFilter) ||
              (link.parentArticlePrefix && link.parentArticlePrefix === numericFilter) ||
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


/**
 * リンクテキストが「法第XX条…関係」見出しの場合、その条番号を返す。
 * 見出しでなければ undefined。
 * 例: "法第48条《有価証券...》関係" → "48"、"法第48条の2《...》関係" → "48"
 */
function extractArticleHeadingNumber(text: string): string | undefined {
  const m = text.match(/^法第(\d+)条/);
  return m ? m[1] : undefined;
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
  return stripTags(lastH2[1]).trim();
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
  text = stripTags(text);
  // 連続空行を整理
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
}
