/**
 * KFS（国税不服審判所）HTMLの解析
 * - トピック一覧（MP/index.html）
 * - トピックカテゴリ（MP/XX/index.html）
 * - 事例集目次（JP/idx/XX.html）
 * - 事例全文（JP/XXX/YY/index.html）
 */

import type { KfsTaxType, KfsTopicCategory, KfsCaseEntry, KfsCaseFullText } from './types.js';

/**
 * HTML タグを除去してテキスト化
 */
function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&emsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * MP/index.html から税目一覧を抽出
 *
 * HTML構造:
 *   <a href="01/index.html">国税通則法関係</a>
 *   <a href="02/index.html">所得税法関係</a>
 *   ...
 */
export function parseKfsTopicIndex(html: string): KfsTaxType[] {
  const results: KfsTaxType[] = [];
  // XX/index.html パターンのリンクを抽出（href属性の位置に依存しない）
  const re = /<a\s[^>]*href="(\d{2}\/index\.html)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const topicPath = `/service/MP/${m[1]}`;
    const name = stripHtml(m[2]).trim();
    if (name) {
      results.push({ name, caseCount: 0, topicPath });
    }
  }
  return results;
}

/**
 * MP/XX/index.html からカテゴリ階層を抽出
 *
 * HTML構造:
 *   <h2><span>総則</span></h2>
 *   <ol>
 *     <li><a href="0101000000.html">納税義務者</a>（7件）
 *       <ol><li>...</li></ol>
 *     </li>
 *   </ol>
 */
export function parseKfsTopicCategories(html: string): KfsTopicCategory[] {
  const results: KfsTopicCategory[] = [];

  // h2 セクションを抽出（サイドバーのimg付きh2は除外）
  // h2は <h2><span>総則</span></h2> 形式
  const h2Re = /<h2[^>]*>([\s\S]*?)<\/h2>([\s\S]*?)(?=<h2[^>]*>|<div\s+id="side"|$)/gi;
  let h2Match: RegExpExecArray | null;

  while ((h2Match = h2Re.exec(html)) !== null) {
    const h2Content = h2Match[1];
    // img を含むh2はサイドバー→スキップ
    if (/<img/i.test(h2Content)) continue;
    const categoryName = stripHtml(h2Content).trim();
    const section = h2Match[2];

    // セクション内の<a>リンク + 件数を抽出（href属性の位置に依存しない）
    const items: { name: string; count: number; href: string }[] = [];
    const linkRe = /<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let linkMatch: RegExpExecArray | null;

    while ((linkMatch = linkRe.exec(section)) !== null) {
      const href = linkMatch[1];
      const name = stripHtml(linkMatch[2]).trim();
      // href がHTML拡張子でカテゴリリンクのもの
      if (href.endsWith('.html') && !href.includes('/')) {
        // 直後の（X件）を探す（空白・改行に対応するため50文字先読み）
        const afterLink = section.slice((linkMatch.index ?? 0) + linkMatch[0].length, (linkMatch.index ?? 0) + linkMatch[0].length + 50);
        const countMatch = afterLink.match(/[（(]([０-９\d]+)件[）)]/);
        const count = countMatch ? parseInt(toHankaku(countMatch[1]), 10) : 0;
        items.push({ name, count, href });
      }
    }

    if (items.length > 0) {
      results.push({ name: categoryName, items });
    }
  }

  return results;
}

/**
 * JP/idx/XX.html から事例エントリ一覧を抽出
 *
 * ★ kfs_scraper.py の get_cases_from_collection() ロジックを移植
 *
 * HTML構造:
 *   <h2><span>所得税法関係</span></h2>
 *   <h3>（カテゴリ名）</h3>
 *   <div class="article">
 *     <p class="article_point">▼ <a href="要旨URL">裁決事例要旨</a> ▼<a href="../139/01/index.html">裁決事例</a></p>
 *     <p>要旨テキスト...</p>
 *     <p class="article_date">令和7年4月11日裁決</p>
 *   </div>
 */
export function parseCollectionIndex(
  html: string,
  collectionNo: number,
  baseUrl: string
): KfsCaseEntry[] {
  const results: KfsCaseEntry[] = [];
  let currentTaxType = '';
  let currentCategory = '';

  // h2, h3, div.article をパース
  // トークンとして h2, h3, div.article を順に処理
  // div.article はネストなし前提（KFS実HTMLで確認済み）
  const tokenRe = /<h2[^>]*>([\s\S]*?)<\/h2>|<h3[^>]*>([\s\S]*?)<\/h3>|<div\s[^>]*class="[^"]*\barticle\b[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
  let match: RegExpExecArray | null;

  while ((match = tokenRe.exec(html)) !== null) {
    if (match[1] !== undefined) {
      // h2: 税目
      const h2Content = match[1];
      // img を含むh2はサイドバー→スキップ
      if (/<img/i.test(h2Content)) continue;
      // <span>から取得、なければテキスト全体
      const spanMatch = h2Content.match(/<span[^>]*>([\s\S]*?)<\/span>/i);
      const text = spanMatch ? stripHtml(spanMatch[1]) : stripHtml(h2Content);
      if (text && text.includes('関係')) {
        currentTaxType = text;
      }
    } else if (match[2] !== undefined) {
      // h3: カテゴリ
      currentCategory = stripHtml(match[2]);
    } else if (match[3] !== undefined) {
      // div.article: 事例エントリ
      const articleHtml = match[3];

      // 裁決事例リンク（href属性の位置に依存しない）
      let caseUrl = '';
      let youshiUrl = '';
      const linkRe = /<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
      let linkMatch: RegExpExecArray | null;
      while ((linkMatch = linkRe.exec(articleHtml)) !== null) {
        const href = linkMatch[1];
        const text = stripHtml(linkMatch[2]).trim();
        if (text === '裁決事例' && href.includes('index.html')) {
          caseUrl = resolveUrl(baseUrl, href);
        } else if (text === '裁決事例要旨') {
          youshiUrl = resolveUrl(baseUrl, href);
        }
      }

      if (!caseUrl) continue;

      // 要旨テキスト: article_point でも article_date でもない <p>
      let summary = '';
      const pRe = /<p(?:\s[^>]*class="([^"]*)")?[^>]*>([\s\S]*?)<\/p>/gi;
      let pMatch: RegExpExecArray | null;
      while ((pMatch = pRe.exec(articleHtml)) !== null) {
        const cls = pMatch[1] || '';
        if (cls.includes('article_point') || cls.includes('article_date')) continue;
        const text = stripHtml(pMatch[2]);
        if (text.length > 20) {
          summary = text.replace(/^\u3000+/, ''); // 全角スペース除去
          break;
        }
      }

      // 裁決日（class属性の位置に依存しない）
      let date = '';
      const dateMatch = articleHtml.match(/<p\s[^>]*class="article_date"[^>]*>([\s\S]*?)<\/p>/i);
      if (dateMatch) {
        date = stripHtml(dateMatch[1]).replace(/裁決/g, '').trim();
      }

      results.push({
        collectionNo,
        taxType: currentTaxType,
        category: currentCategory,
        summary: summary.slice(0, 500),
        date,
        caseUrl,
        youshiUrl: youshiUrl || undefined,
      });
    }
  }

  return results;
}

/**
 * JP/XXX/YY/index.html から裁決全文を抽出
 *
 * HTML構造:
 *   <div id="saiketsu">
 *     <h3>（裁決日）《裁決書（抄）》</h3>
 *     <ul class="level1">...</ul>
 *     ...
 *   </div>
 */
export function parseCaseFullText(html: string): KfsCaseFullText | null {
  // コンテンツ開始位置を決定
  // 新テンプレート: div#saiketsu、旧テンプレート: div#main 内の <h1>
  let contentStart: number;

  const saiketsuMatch = html.match(/<div\s+id="saiketsu"[^>]*>/i);
  if (saiketsuMatch && saiketsuMatch.index !== undefined) {
    contentStart = saiketsuMatch.index + saiketsuMatch[0].length;
  } else {
    // 旧テンプレート: div#main 内の <h1> から本文開始
    const mainMatch = html.match(/<div\s+id="main"[^>]*>/i);
    if (!mainMatch || mainMatch.index === undefined) return null;
    const h1Idx = html.indexOf('<h1', mainMatch.index);
    if (h1Idx === -1) return null;
    contentStart = h1Idx;
  }

  // pagetop で終了位置を決定
  const pagetopIdx = html.indexOf('class="pagetop"', contentStart);
  let contentEnd: number;
  if (pagetopIdx !== -1) {
    // pagetop の直前の要素まで
    contentEnd = html.lastIndexOf('<', pagetopIdx);
  } else {
    // フォールバック: ページ末尾のfooter等を探す
    const footerIdx = html.indexOf('id="footer"', contentStart);
    contentEnd = footerIdx > 0 ? html.lastIndexOf('<', footerIdx) : html.length;
  }

  const bodyHtml = html.substring(contentStart, contentEnd);
  return extractFullText(bodyHtml, html);
}

function extractFullText(saiketsuHtml: string, fullHtml: string): KfsCaseFullText {
  const body = stripHtml(saiketsuHtml);

  // 裁決日を抽出（全角・半角数字混在に対応）
  let date = '';
  const dateMatch = fullHtml.match(/((?:令和|平成|昭和)[０-９\d]+年[０-９\d]+月[０-９\d]+日)裁決/);
  if (dateMatch) {
    date = toHankaku(dateMatch[1]);
  }

  return { body, date, url: '' };
}

/**
 * 全角数字を半角に変換
 */
function toHankaku(s: string): string {
  return s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
}

/**
 * JP/index.html から事例集一覧を抽出
 *
 * HTML構造:
 *   <a href="idx/XX.html">ラベル</a>
 */
export function parseCollectionList(html: string): { no: number; idxUrl: string; label: string }[] {
  const results: { no: number; idxUrl: string; label: string }[] = [];
  const seen = new Set<number>();

  // href属性の位置に依存しない
  const re = /<a\s[^>]*href="(idx\/(\d+)\.html)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const no = parseInt(m[2], 10);
    if (seen.has(no)) continue;
    seen.add(no);
    results.push({
      no,
      idxUrl: `/service/JP/${m[1]}`,
      label: stripHtml(m[3]).trim(),
    });
  }

  results.sort((a, b) => a.no - b.no);
  return results;
}

/**
 * 相対URLを解決
 */
function resolveUrl(baseUrl: string, href: string): string {
  if (href.startsWith('http')) return href;
  if (href.startsWith('/')) return `https://www.kfs.go.jp${href}`;

  // ../139/01/index.html → baseUrl の親ディレクトリから解決
  try {
    return new URL(href, baseUrl).href;
  } catch {
    // フォールバック: 単純に ../ を除去
    const clean = href.replace(/^(\.\.\/)+/, '');
    return `https://www.kfs.go.jp/service/JP/${clean}`;
  }
}
