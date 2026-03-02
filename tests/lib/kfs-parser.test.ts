import { describe, it, expect } from 'vitest';
import {
  parseKfsTopicIndex,
  parseKfsTopicCategories,
  parseCollectionIndex,
  parseCollectionList,
  parseCaseFullText,
} from '../../src/lib/kfs-parser.js';

// === テストフィクスチャ ===

const TOPIC_INDEX_HTML = `
<div id="contents">
<h1>公表裁決事例要旨</h1>
<ol>
  <li><a href="01/index.html">国税通則法関係</a></li>
  <li><a href="02/index.html">所得税法関係</a></li>
  <li><a href="03/index.html">法人税法関係</a></li>
</ol>
</div>
<div id="side">
<h2><img src="side_1mi_1.gif" alt="サイドバー" /></h2>
</div>
`;

const TOPIC_CATEGORIES_HTML = `
<div id="contents">
<h2><span>総則</span></h2>
<ol>
  <li><a href="0101000000.html">納税義務者</a>（7件）</li>
  <li>課税所得の範囲
    <ol class="alphaBig">
      <li><a href="0102000000.html">居住者の所得</a>（2件）</li>
    </ol>
  </li>
</ol>
<h2><span>必要経費</span></h2>
<ol>
  <li><a href="0401000000.html">必要経費の意義、範囲</a>（15件）</li>
  <li><a href="0402000000.html">売上原価</a>（3件）</li>
</ol>
<h2><img src="side_1mi_1.gif" alt="サイドバー" /></h2>
</div>
`;

const COLLECTION_LIST_HTML = `
<div id="contents">
<h1>裁決事例集</h1>
<table>
<tr><td><a href="idx/43.html">第43集</a></td></tr>
<tr><td><a href="idx/100.html">第100集</a></td></tr>
<tr><td><a href="idx/139.html">第139集</a></td></tr>
</table>
</div>
`;

const COLLECTION_INDEX_HTML = `
<div id="contents">
<h2><span>所得税法関係</span></h2>
<h3>（譲渡所得　取得費の意義、範囲）</h3>
<div class="article">
  <p class="article_point">▼ <a href="../MP/youshi1.html">裁決事例要旨</a> ▼<a href="../139/01/index.html">裁決事例</a></p>
  <p>　請求人が取得した不動産の取得費について、実際の取得価額を認定した事例。</p>
  <p class="article_date">令和7年4月11日裁決</p>
</div>
<h3>（重加算税　隠蔽又は仮装の認定）</h3>
<div class="article">
  <p class="article_point">▼ <a href="../MP/youshi2.html">裁決事例要旨</a> ▼<a href="../139/02/index.html">裁決事例</a></p>
  <p>　重加算税の賦課決定処分が取り消された事例。</p>
  <p class="article_date">令和7年3月15日裁決</p>
</div>
<h2><span>法人税法関係</span></h2>
<h3>（交際費等）</h3>
<div class="article">
  <p class="article_point">▼ <a href="../MP/youshi3.html">裁決事例要旨</a> ▼<a href="../139/03/index.html">裁決事例</a></p>
  <p>　交際費等の損金不算入の事例。</p>
  <p class="article_date">令和7年2月20日裁決</p>
</div>
</div>
`;

const CASE_FULL_TEXT_HTML = `
<html><body>
<div id="saiketsu">
<h1>（令和７年４月11日裁決）</h1>
<p>《裁決書（抄）》</p>
<h2><span>1　事実</span></h2>
<h3>(1)　事案の概要</h3>
<p class="indent">本件は、審査請求人が修正申告をしたところ、原処分庁が重加算税の賦課決定処分をしたのに対し、請求人が取消しを求めた事案である。</p>
<h3>(2)　関係法令</h3>
<div class="indent-item level1">イ　国税通則法第68条は、重加算税について規定している。</div>
<div class="indent-item level1">ロ　消費税法第5条は、納税義務者について規定している。</div>
<h2><span>2　審判所の判断</span></h2>
<p class="indent">以上のことから、原処分の一部を取り消すこととする。</p>
</div>
<p class="pagetop"><a href="#header">トップに戻る</a></p>
</body></html>
`;

// === テスト ===

describe('parseKfsTopicIndex', () => {
  it('税目一覧を正しく抽出する', () => {
    const result = parseKfsTopicIndex(TOPIC_INDEX_HTML);
    expect(result.length).toBe(3);
    expect(result[0].name).toBe('国税通則法関係');
    expect(result[0].topicPath).toBe('/service/MP/01/index.html');
    expect(result[1].name).toBe('所得税法関係');
    expect(result[2].name).toBe('法人税法関係');
  });

  it('空HTMLでは空配列を返す', () => {
    expect(parseKfsTopicIndex('')).toEqual([]);
  });
});

describe('parseKfsTopicCategories', () => {
  it('カテゴリ階層を正しく抽出する', () => {
    const result = parseKfsTopicCategories(TOPIC_CATEGORIES_HTML);
    expect(result.length).toBe(2);

    // 総則カテゴリ
    expect(result[0].name).toBe('総則');
    expect(result[0].items.length).toBe(2);
    expect(result[0].items[0].name).toBe('納税義務者');
    expect(result[0].items[0].count).toBe(7);
    expect(result[0].items[1].name).toBe('居住者の所得');
    expect(result[0].items[1].count).toBe(2);

    // 必要経費カテゴリ
    expect(result[1].name).toBe('必要経費');
    expect(result[1].items.length).toBe(2);
    expect(result[1].items[0].count).toBe(15);
  });

  it('img付きh2（サイドバー）はスキップする', () => {
    const result = parseKfsTopicCategories(TOPIC_CATEGORIES_HTML);
    const names = result.map(r => r.name);
    expect(names).not.toContain('サイドバー');
  });

  it('空HTMLでは空配列を返す', () => {
    expect(parseKfsTopicCategories('')).toEqual([]);
  });
});

describe('parseCollectionList', () => {
  it('事例集一覧を正しく抽出する', () => {
    const result = parseCollectionList(COLLECTION_LIST_HTML);
    expect(result.length).toBe(3);
    expect(result[0].no).toBe(43);
    expect(result[0].idxUrl).toBe('/service/JP/idx/43.html');
    expect(result[1].no).toBe(100);
    expect(result[2].no).toBe(139);
  });

  it('番号順にソートされる', () => {
    const reversed = COLLECTION_LIST_HTML.replace(
      /<tr><td><a href="idx\/43\.html">第43集<\/a><\/td><\/tr>/,
      ''
    ) + '<a href="idx/43.html">第43集</a>';
    const result = parseCollectionList(reversed);
    expect(result[0].no).toBeLessThan(result[result.length - 1].no);
  });

  it('重複番号は除外する', () => {
    const duped = COLLECTION_LIST_HTML + '<a href="idx/139.html">第139集（重複）</a>';
    const result = parseCollectionList(duped);
    const count139 = result.filter(r => r.no === 139).length;
    expect(count139).toBe(1);
  });
});

describe('parseCollectionIndex', () => {
  const baseUrl = 'https://www.kfs.go.jp/service/JP/idx/139.html';

  it('事例エントリを正しく抽出する', () => {
    const result = parseCollectionIndex(COLLECTION_INDEX_HTML, 139, baseUrl);
    expect(result.length).toBe(3);
  });

  it('税目が正しくセットされる', () => {
    const result = parseCollectionIndex(COLLECTION_INDEX_HTML, 139, baseUrl);
    expect(result[0].taxType).toBe('所得税法関係');
    expect(result[1].taxType).toBe('所得税法関係');
    expect(result[2].taxType).toBe('法人税法関係');
  });

  it('カテゴリが正しくセットされる', () => {
    const result = parseCollectionIndex(COLLECTION_INDEX_HTML, 139, baseUrl);
    expect(result[0].category).toContain('譲渡所得');
    expect(result[1].category).toContain('重加算税');
    expect(result[2].category).toContain('交際費');
  });

  it('裁決日が正しく抽出される', () => {
    const result = parseCollectionIndex(COLLECTION_INDEX_HTML, 139, baseUrl);
    expect(result[0].date).toContain('令和7年4月11日');
    expect(result[1].date).toContain('令和7年3月15日');
  });

  it('要旨テキストが正しく抽出される', () => {
    const result = parseCollectionIndex(COLLECTION_INDEX_HTML, 139, baseUrl);
    expect(result[0].summary).toContain('不動産の取得費');
    expect(result[1].summary).toContain('重加算税の賦課決定処分');
  });

  it('caseUrlが正しく解決される', () => {
    const result = parseCollectionIndex(COLLECTION_INDEX_HTML, 139, baseUrl);
    expect(result[0].caseUrl).toContain('/service/JP/139/01/index.html');
    expect(result[1].caseUrl).toContain('/service/JP/139/02/index.html');
  });

  it('collectionNoが正しくセットされる', () => {
    const result = parseCollectionIndex(COLLECTION_INDEX_HTML, 139, baseUrl);
    result.forEach(r => expect(r.collectionNo).toBe(139));
  });

  it('空HTMLでは空配列を返す', () => {
    expect(parseCollectionIndex('', 139, baseUrl)).toEqual([]);
  });
});

describe('parseCaseFullText', () => {
  it('裁決全文を正しく抽出する', () => {
    const result = parseCaseFullText(CASE_FULL_TEXT_HTML);
    expect(result).not.toBeNull();
    expect(result!.body).toContain('事案の概要');
    expect(result!.body).toContain('審判所の判断');
    expect(result!.body).toContain('原処分の一部を取り消す');
  });

  it('裁決日が正しく抽出される（全角数字→半角変換）', () => {
    const result = parseCaseFullText(CASE_FULL_TEXT_HTML);
    expect(result).not.toBeNull();
    expect(result!.date).toBe('令和7年4月11日');
  });

  it('div#saiketsuがない場合はnullを返す', () => {
    const result = parseCaseFullText('<html><body><p>テスト</p></body></html>');
    expect(result).toBeNull();
  });

  it('URLは空文字で初期化される', () => {
    const result = parseCaseFullText(CASE_FULL_TEXT_HTML);
    expect(result).not.toBeNull();
    expect(result!.url).toBe('');
  });
});
