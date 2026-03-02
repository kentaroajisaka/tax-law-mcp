import { describe, it, expect } from 'vitest';
import {
  parseKfsTopicIndex,
  parseKfsTopicCategories,
  parseCollectionIndex,
  parseCollectionList,
  parseCaseFullText,
} from '../../src/lib/kfs-parser.js';

// ========================================
// stripHtml 動作確認（パーサー経由）
// ========================================

describe('stripHtml behavior (via parsers)', () => {
  it('HTML entities in link text are decoded', () => {
    const html = `<a href="01/index.html">所得税法&amp;消費税法</a>`;
    const result = parseKfsTopicIndex(html);
    expect(result[0].name).toBe('所得税法&消費税法');
  });

  it('strips <script> and <style> tags', () => {
    const html = `
      <a href="01/index.html">
        <style>.hidden{display:none}</style>
        <script>alert("xss")</script>
        国税通則法関係
      </a>`;
    const result = parseKfsTopicIndex(html);
    expect(result[0].name).toBe('国税通則法関係');
    expect(result[0].name).not.toContain('script');
    expect(result[0].name).not.toContain('style');
  });

  it('numeric character references are decoded', () => {
    const html = `<a href="01/index.html">&#22269;&#31246;</a>`;
    const result = parseKfsTopicIndex(html);
    expect(result[0].name).toBe('国税');
  });

  it('hex character references are decoded', () => {
    const html = `<a href="01/index.html">&#x56FD;&#x7A0E;</a>`;
    const result = parseKfsTopicIndex(html);
    expect(result[0].name).toBe('国税');
  });
});

// ========================================
// href属性順序非依存（attribute order independence）
// ========================================

describe('attribute order independence', () => {
  it('parseKfsTopicIndex: href is NOT the first attribute', () => {
    const html = `<a class="link" title="test" href="01/index.html">国税通則法関係</a>`;
    const result = parseKfsTopicIndex(html);
    expect(result.length).toBe(1);
    expect(result[0].name).toBe('国税通則法関係');
    expect(result[0].topicPath).toBe('/service/MP/01/index.html');
  });

  it('parseCollectionList: href with data attributes before', () => {
    const html = `<a data-id="1" href="idx/139.html">第139集</a>`;
    const result = parseCollectionList(html);
    expect(result.length).toBe(1);
    expect(result[0].no).toBe(139);
  });

  it('parseCollectionIndex: links with class before href', () => {
    const html = `
    <h2><span>所得税法関係</span></h2>
    <h3>（譲渡所得）</h3>
    <div class="article">
      <p class="article_point">▼ <a class="youshi" href="../MP/youshi1.html">裁決事例要旨</a> ▼<a class="case" href="../139/01/index.html">裁決事例</a></p>
      <p>　請求人が取得した不動産の取得費について判断した事例テスト。</p>
      <p class="article_date">令和7年4月11日裁決</p>
    </div>`;
    const result = parseCollectionIndex(html, 139, 'https://www.kfs.go.jp/service/JP/idx/139.html');
    expect(result.length).toBe(1);
    expect(result[0].caseUrl).toContain('/service/JP/139/01/index.html');
  });
});

// ========================================
// parseKfsTopicCategories エッジケース
// ========================================

describe('parseKfsTopicCategories - edge cases', () => {
  it('handles full-width digit counts （１５件）', () => {
    const html = `
    <h2><span>必要経費</span></h2>
    <ol><li><a href="0401000000.html">必要経費の意義</a>（１５件）</li></ol>
    <h2><img src="side.gif" alt="サイドバー" /></h2>`;
    const result = parseKfsTopicCategories(html);
    expect(result.length).toBe(1);
    expect(result[0].items[0].count).toBe(15);
  });

  it('returns count 0 when no count in parentheses', () => {
    const html = `
    <h2><span>その他</span></h2>
    <ol><li><a href="9901000000.html">未分類項目</a></li></ol>
    <h2><img src="side.gif" alt="サイドバー" /></h2>`;
    const result = parseKfsTopicCategories(html);
    expect(result.length).toBe(1);
    expect(result[0].items[0].count).toBe(0);
  });

  it('drops categories with zero link items', () => {
    const html = `
    <h2><span>空カテゴリ</span></h2>
    <ol><li>リンクなしテキスト</li></ol>
    <h2><span>有効カテゴリ</span></h2>
    <ol><li><a href="0101000000.html">項目A</a>（3件）</li></ol>
    <h2><img src="side.gif" alt="サイドバー" /></h2>`;
    const result = parseKfsTopicCategories(html);
    expect(result.length).toBe(1);
    expect(result[0].name).toBe('有効カテゴリ');
  });
});

// ========================================
// parseCollectionIndex エッジケース
// ========================================

describe('parseCollectionIndex - edge cases', () => {
  const baseUrl = 'https://www.kfs.go.jp/service/JP/idx/139.html';

  it('skips articles with no caseUrl', () => {
    const html = `
    <h2><span>所得税法関係</span></h2>
    <h3>（カテゴリ）</h3>
    <div class="article">
      <p class="article_point">▼ <a href="../MP/youshi1.html">裁決事例要旨</a></p>
      <p>　要旨テキストです。これは20文字を超えるテキストです。</p>
      <p class="article_date">令和7年4月11日裁決</p>
    </div>`;
    const result = parseCollectionIndex(html, 139, baseUrl);
    expect(result.length).toBe(0);
  });

  it('handles article with no date paragraph', () => {
    const html = `
    <h2><span>法人税法関係</span></h2>
    <h3>（交際費等）</h3>
    <div class="article">
      <p class="article_point">▼ <a href="../139/01/index.html">裁決事例</a></p>
      <p>　交際費等の損金不算入について判断した事例テスト用テキスト。</p>
    </div>`;
    const result = parseCollectionIndex(html, 139, baseUrl);
    expect(result.length).toBe(1);
    expect(result[0].date).toBe('');
  });

  it('truncates summary at 500 characters', () => {
    const longText = '裁決事例の要旨テキスト'.repeat(100);
    const html = `
    <h2><span>所得税法関係</span></h2>
    <h3>（カテゴリ）</h3>
    <div class="article">
      <p class="article_point">▼ <a href="../139/01/index.html">裁決事例</a></p>
      <p>　${longText}</p>
      <p class="article_date">令和7年4月11日裁決</p>
    </div>`;
    const result = parseCollectionIndex(html, 139, baseUrl);
    expect(result[0].summary.length).toBeLessThanOrEqual(500);
  });

  it('strips leading full-width spaces from summary', () => {
    const html = `
    <h2><span>所得税法関係</span></h2>
    <h3>（カテゴリ）</h3>
    <div class="article">
      <p class="article_point">▼ <a href="../139/01/index.html">裁決事例</a></p>
      <p>\u3000\u3000請求人が取得した不動産の取得費について判断した事例。</p>
      <p class="article_date">令和7年4月11日裁決</p>
    </div>`;
    const result = parseCollectionIndex(html, 139, baseUrl);
    expect(result[0].summary).toMatch(/^請求人/);
  });

  it('handles <h2> without <span> for tax type', () => {
    const html = `
    <h2>所得税法関係</h2>
    <h3>（カテゴリ）</h3>
    <div class="article">
      <p class="article_point">▼ <a href="../139/01/index.html">裁決事例</a></p>
      <p>　テスト用の長いテキストです。20文字を超えるようにしています。</p>
      <p class="article_date">令和7年4月11日裁決</p>
    </div>`;
    const result = parseCollectionIndex(html, 139, baseUrl);
    expect(result[0].taxType).toBe('所得税法関係');
  });

  it('handles div with multiple classes including article', () => {
    const html = `
    <h2><span>所得税法関係</span></h2>
    <h3>（譲渡所得）</h3>
    <div class="article clearfix highlighted">
      <p class="article_point">▼ <a href="../139/01/index.html">裁決事例</a></p>
      <p>　請求人が取得した不動産の取得費について判断した長い事例テキスト。</p>
      <p class="article_date">令和7年4月11日裁決</p>
    </div>`;
    const result = parseCollectionIndex(html, 139, baseUrl);
    expect(result.length).toBe(1);
  });

  it('youshiUrl is undefined when no youshi link', () => {
    const html = `
    <h2><span>所得税法関係</span></h2>
    <h3>（カテゴリ）</h3>
    <div class="article">
      <p class="article_point">▼<a href="../139/01/index.html">裁決事例</a></p>
      <p>　テスト用の長いテキストです。20文字を超えるようにしています。</p>
      <p class="article_date">令和7年1月1日裁決</p>
    </div>`;
    const result = parseCollectionIndex(html, 139, baseUrl);
    expect(result[0].youshiUrl).toBeUndefined();
  });
});

// ========================================
// parseCaseFullText エッジケース
// ========================================

describe('parseCaseFullText - edge cases', () => {
  it('uses footer fallback when no pagetop exists', () => {
    const html = `
    <div id="saiketsu">
    <h1>（令和７年４月11日裁決）</h1>
    <p>裁決本文テキスト。審判所の判断として原処分を取消す。</p>
    </div>
    <div id="footer"><p>フッター</p></div>`;
    const result = parseCaseFullText(html);
    expect(result).not.toBeNull();
    expect(result!.body).toContain('裁決本文テキスト');
    expect(result!.body).not.toContain('フッター');
  });

  it('handles 平成 era date', () => {
    const html = `
    <div id="saiketsu">
    <h1>（平成３０年１２月２５日裁決）</h1>
    <p>テスト。</p>
    </div>
    <p class="pagetop"><a href="#header">トップ</a></p>`;
    const result = parseCaseFullText(html);
    expect(result!.date).toBe('平成30年12月25日');
  });

  it('handles 昭和 era date', () => {
    const html = `
    <div id="saiketsu">
    <h1>（昭和６３年３月１日裁決）</h1>
    <p>テスト。</p>
    </div>
    <p class="pagetop"><a href="#header">トップ</a></p>`;
    const result = parseCaseFullText(html);
    expect(result!.date).toBe('昭和63年3月1日');
  });

  it('returns empty date when no date pattern found', () => {
    const html = `
    <div id="saiketsu">
    <h1>タイトル</h1>
    <p>日付なし。</p>
    </div>
    <p class="pagetop"><a href="#header">トップ</a></p>`;
    const result = parseCaseFullText(html);
    expect(result!.date).toBe('');
  });

  it('returns null for empty string', () => {
    expect(parseCaseFullText('')).toBeNull();
  });

  it('falls back to div#main + h1 when no div#saiketsu (old template)', () => {
    const html = `
    <div id="main">
    <div id="pankuzu"><p>パンくず</p></div>
    <h1>(平成23年6月28日裁決)</h1>
    <p>《裁決書(抄)》</p>
    <h2><span>1　事実</span></h2>
    <p>本件は、医療法人の出資持分の評価に関する事例である。</p>
    </div>
    <p class="pagetop"><a href="#header">トップに戻る</a></p>
    <div id="side"></div>`;
    const result = parseCaseFullText(html);
    expect(result).not.toBeNull();
    expect(result!.date).toBe('平成23年6月28日');
    expect(result!.body).toContain('医療法人の出資持分');
    expect(result!.body).not.toContain('パンくず');
  });

  it('returns null when neither div#saiketsu nor div#main exists', () => {
    const html = `<html><body><p>関係ないページ</p></body></html>`;
    expect(parseCaseFullText(html)).toBeNull();
  });
});

// ========================================
// parseCollectionList エッジケース
// ========================================

describe('parseCollectionList - edge cases', () => {
  it('returns empty array for empty HTML', () => {
    expect(parseCollectionList('')).toEqual([]);
  });

  it('returns empty array for HTML with no matching links', () => {
    expect(parseCollectionList('<div>テキストのみ</div>')).toEqual([]);
  });
});

// ========================================
// resolveUrl 動作確認（parseCollectionIndex経由）
// ========================================

describe('resolveUrl behavior (via parseCollectionIndex)', () => {
  it('resolves relative paths with ../', () => {
    const html = `
    <h2><span>所得税法関係</span></h2>
    <h3>（カテゴリ）</h3>
    <div class="article">
      <p class="article_point">▼<a href="../139/01/index.html">裁決事例</a></p>
      <p>　テスト用の長いテキストです。20文字を超えるようにしています。</p>
    </div>`;
    const result = parseCollectionIndex(html, 139, 'https://www.kfs.go.jp/service/JP/idx/139.html');
    expect(result[0].caseUrl).toBe('https://www.kfs.go.jp/service/JP/139/01/index.html');
  });

  it('handles absolute URLs in href', () => {
    const html = `
    <h2><span>所得税法関係</span></h2>
    <h3>（カテゴリ）</h3>
    <div class="article">
      <p class="article_point">▼<a href="https://www.kfs.go.jp/service/JP/139/01/index.html">裁決事例</a></p>
      <p>　テスト用の長いテキストです。20文字を超えるようにしています。</p>
    </div>`;
    const result = parseCollectionIndex(html, 139, 'https://www.kfs.go.jp/service/JP/idx/139.html');
    expect(result[0].caseUrl).toBe('https://www.kfs.go.jp/service/JP/139/01/index.html');
  });
});
