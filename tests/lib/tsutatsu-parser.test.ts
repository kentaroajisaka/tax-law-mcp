import { describe, it, expect } from 'vitest';
import { parseTocLinks, findPageForNumber, extractTsutatsuEntry, getCandidatePages } from '../../src/lib/tsutatsu-parser.js';

// --- parseTocLinks ---

describe('parseTocLinks - kihon形式（デフォルト）', () => {
  it('<a>タグからリンクを抽出する', () => {
    const html = `
      <a href="/law/tsutatsu/kihon/shotoku/04/07.htm">法第33条《譲渡所得》関係</a>
      <a href="/law/tsutatsu/kihon/shotoku/04/08.htm">法第34条《一時所得》関係</a>
    `;
    const links = parseTocLinks(html);
    expect(links.length).toBe(2);
    expect(links[0].text).toContain('第33条');
    expect(links[0].articlePrefix).toBe('33');
    expect(links[1].articlePrefix).toBe('34');
  });

  it('/law/tsutatsu/ を含まないリンクは除外する', () => {
    const html = `
      <a href="/other/page.htm">テスト</a>
      <a href="/law/tsutatsu/kihon/test/01.htm">法第1条関係</a>
    `;
    const links = parseTocLinks(html);
    expect(links.length).toBe(1);
  });

  it('重複hrefを除去する', () => {
    const html = `
      <a href="/law/tsutatsu/kihon/test/01.htm">法第1条関係</a>
      <a href="/law/tsutatsu/kihon/test/01.htm">法第1条関係（重複）</a>
    `;
    const links = parseTocLinks(html);
    expect(links.length).toBe(1);
  });

  it('テーマベースリンク（第X条なし）はarticlePrefixがundefined', () => {
    const html = `<a href="/law/tsutatsu/kihon/test/01.htm">〔収入金額〕</a>`;
    const links = parseTocLinks(html);
    expect(links[0].articlePrefix).toBeUndefined();
  });

  it('tocFormat省略時もkihonとして動作する', () => {
    const html = `<a href="/law/tsutatsu/kihon/test/33.htm">法第33条《譲渡所得》関係</a>`;
    const links = parseTocLinks(html);
    expect(links[0].articlePrefix).toBe('33');
  });
});

describe('parseTocLinks - sochiho-li形式', () => {
  const tocPath = '/law/tsutatsu/kobetsu/shotoku/sochiho/710826/sanrin/sanjyou/01.htm';

  it('<li>内の番号+<a>を抽出する', () => {
    const html = `
      <li>33-1&emsp;<a href="/law/tsutatsu/kobetsu/shotoku/sochiho/710826/sanrin/sanjyou/soti33/01.htm#a-33-1">収用又は使用の範囲</a></li>
      <li>34-1&emsp;<a href="/law/tsutatsu/kobetsu/shotoku/sochiho/710826/sanrin/sanjyou/soti34/01.htm#a-34-1">関連事業に該当する場合</a></li>
    `;
    const links = parseTocLinks(html, 'sochiho-li', tocPath);
    expect(links.length).toBe(2);
    expect(links[0].tsutatsuNumber).toBe('33-1');
    expect(links[0].text).toContain('33-1');
    expect(links[0].text).toContain('収用又は使用の範囲');
    expect(links[0].articlePrefix).toBe('33');
    expect(links[1].tsutatsuNumber).toBe('34-1');
    expect(links[1].articlePrefix).toBe('34');
  });

  it('fullHrefにフラグメントを保持する', () => {
    const html = `<li>33-8&emsp;<a href="/law/tsutatsu/kobetsu/shotoku/sochiho/710826/sanrin/sanjyou/soti33/01.htm#a-33-8">対価補償金とその他の補償金との区分</a></li>`;
    const links = parseTocLinks(html, 'sochiho-li', tocPath);
    expect(links[0].fullHref).toContain('#a-33-8');
    expect(links[0].href).not.toContain('#');
  });

  it('hrefの重複除去（同一ページ内の複数エントリ）', () => {
    const html = `
      <li>33-1&emsp;<a href="/law/tsutatsu/kobetsu/shotoku/sochiho/710826/sanrin/sanjyou/soti33/01.htm#a-33-1">収用</a></li>
      <li>33-2&emsp;<a href="/law/tsutatsu/kobetsu/shotoku/sochiho/710826/sanrin/sanjyou/soti33/01.htm#a-33-2">関連</a></li>
    `;
    const links = parseTocLinks(html, 'sochiho-li', tocPath);
    // 同一ページ（フラグメント除去後）なので1つに重複除去される
    expect(links.length).toBe(1);
    expect(links[0].tsutatsuNumber).toBe('33-1');
  });

  it('マッチしない場合はkihonフォールバック', () => {
    const html = `<a href="/law/tsutatsu/kobetsu/test/01.htm">第42条の3の2《特例》関係</a>`;
    const links = parseTocLinks(html, 'sochiho-li', tocPath);
    expect(links.length).toBe(1);
    expect(links[0].articlePrefix).toBe('42');
  });
});

describe('parseTocLinks - sochiho-p形式', () => {
  const tocPath = '/law/tsutatsu/kobetsu/shotoku/sochiho/801226/sinkoku/01.htm';

  it('<strong>内の番号を抽出する', () => {
    const html = `<p class="indent1"><strong>10-1</strong>&emsp;<a href="/law/tsutatsu/kobetsu/shotoku/sochiho/801226/sinkoku/57/10/01.htm#a-01">試験研究の意義</a></p>`;
    const links = parseTocLinks(html, 'sochiho-p', tocPath);
    expect(links.length).toBe(1);
    expect(links[0].tsutatsuNumber).toBe('10-1');
    expect(links[0].articlePrefix).toBe('10');
  });

  it('<strong>なしの直書き番号を抽出する', () => {
    const html = `<p class="indent2">69の4-1　<a href="/law/tsutatsu/kobetsu/sozoku/sochiho/080708/69_4/01.htm#a-4-1">加算対象贈与財産</a></p>`;
    const links = parseTocLinks(html, 'sochiho-p', '/law/tsutatsu/kobetsu/sozoku/sochiho/080708/01.htm');
    expect(links.length).toBe(1);
    expect(links[0].tsutatsuNumber).toBe('69の4-1');
    expect(links[0].articlePrefix).toBe('69');
  });

  it('フラグメントなしのリンクも処理する', () => {
    const html = `<p class="indent1">3-1　<a href="/law/tsutatsu/kobetsu/shotoku/sochiho/880331/gensen/58/03/01.htm">源泉分離課税の効果</a></p>`;
    const links = parseTocLinks(html, 'sochiho-p', '/law/tsutatsu/kobetsu/shotoku/sochiho/880331/gensen/58/01.htm');
    expect(links.length).toBe(1);
    expect(links[0].tsutatsuNumber).toBe('3-1');
    expect(links[0].fullHref).not.toContain('#');
  });
});

describe('parseTocLinks - sochiho-article形式', () => {
  it('第X条を含むリンクテキストを処理する（kihonと同じ動作）', () => {
    const html = `<a href="/law/tsutatsu/kobetsu/hojin/sochiho/750214/01/01_42_03.htm">第42条の3の2《中小企業者等の法人税率の特例》関係</a>`;
    const links = parseTocLinks(html, 'sochiho-article');
    expect(links.length).toBe(1);
    expect(links[0].articlePrefix).toBe('42');
  });
});

// --- findPageForNumber ---

describe('findPageForNumber', () => {
  it('tsutatsuNumber完全一致で検索する', () => {
    const links = [
      { text: '33-1 収用', href: '/path/01.htm', tsutatsuNumber: '33-1' },
      { text: '33-2 換地', href: '/path/01.htm', tsutatsuNumber: '33-2' },
      { text: '34-1 別', href: '/path/02.htm', tsutatsuNumber: '34-1' },
    ];
    expect(findPageForNumber(links, '33-1')).toBe('/path/01.htm');
    expect(findPageForNumber(links, '34-1')).toBe('/path/02.htm');
  });

  it('tsutatsuNumberプレフィックス一致で検索する', () => {
    const links = [
      { text: '33-1 収用', href: '/path/33.htm', tsutatsuNumber: '33-1' },
      { text: '34-1 別', href: '/path/34.htm', tsutatsuNumber: '34-1' },
    ];
    // 33-8はないが、同じプレフィックス33のページを見つける
    expect(findPageForNumber(links, '33-8')).toBe('/path/33.htm');
  });

  it('articlePrefix一致で検索する（基本通達形式）', () => {
    const links = [
      { text: '法第33条関係', href: '/path/33.htm', articlePrefix: '33' },
      { text: '法第34条関係', href: '/path/34.htm', articlePrefix: '34' },
    ];
    expect(findPageForNumber(links, '33-6')).toBe('/path/33.htm');
  });

  it('テキスト内「第X条」で検索する', () => {
    const links = [
      { text: '法第33条《譲渡所得》関係', href: '/path/33.htm' },
    ];
    expect(findPageForNumber(links, '33-6')).toBe('/path/33.htm');
  });

  it('ダッシュ表記揺れを正規化して検索する', () => {
    const links = [
      { text: '33−1 収用', href: '/path/01.htm', tsutatsuNumber: '33−1' },
    ];
    expect(findPageForNumber(links, '33-1')).toBe('/path/01.htm');
  });

  it('未発見時はnullを返す', () => {
    const links = [
      { text: '法第33条関係', href: '/path/33.htm', articlePrefix: '33' },
    ];
    expect(findPageForNumber(links, '999-1')).toBeNull();
  });
});

// --- getCandidatePages ---

describe('getCandidatePages', () => {
  it('tsutatsuNumberベースで近いページを返す', () => {
    const links = [
      { text: '30-1', href: '/path/30.htm', tsutatsuNumber: '30-1' },
      { text: '33-1', href: '/path/33.htm', tsutatsuNumber: '33-1' },
      { text: '50-1', href: '/path/50.htm', tsutatsuNumber: '50-1' },
    ];
    const candidates = getCandidatePages(links, '32-1');
    expect(candidates).toContain('/path/30.htm');
    expect(candidates).toContain('/path/33.htm');
    expect(candidates).not.toContain('/path/50.htm');
  });

  it('articlePrefixベースで近いページを返す', () => {
    const links = [
      { text: '法第33条関係', href: '/path/33.htm', articlePrefix: '33' },
      { text: '法第50条関係', href: '/path/50.htm', articlePrefix: '50' },
    ];
    const candidates = getCandidatePages(links, '34-1');
    expect(candidates).toContain('/path/33.htm');
    expect(candidates).not.toContain('/path/50.htm');
  });
});

// --- extractTsutatsuEntry ---

describe('extractTsutatsuEntry', () => {
  it('単一strongタグからエントリを抽出する', () => {
    const html = `
      <h2>（借家人が受ける立退料）</h2>
      <strong>33-6</strong>　借家人が賃貸借の目的とされている家屋の立退きに際し受けるいわゆる立退料のうち...
      <strong>33-7</strong>　次のエントリ
    `;
    const entry = extractTsutatsuEntry(html, '33-6', 'https://example.com');
    expect(entry).not.toBeNull();
    expect(entry!.number).toBe('33-6');
    expect(entry!.caption).toBe('（借家人が受ける立退料）');
    expect(entry!.body).toContain('借家人');
  });

  it('全角ダッシュの通達番号に対応する', () => {
    const html = `
      <h2>（対価補償金とその他の補償金との区分）</h2>
      <strong>33−8　</strong>措置法第33条第1項に規定する補償金...
      <strong>33−9　</strong>次のエントリ
    `;
    const entry = extractTsutatsuEntry(html, '33-8', 'https://example.com');
    expect(entry).not.toBeNull();
    expect(entry!.body).toContain('措置法第33条');
  });

  it('分割strongタグに対応する', () => {
    const html = `
      <h2>テスト</h2>
      <strong>36</strong><strong>－15</strong> テスト内容です
      <strong>36</strong><strong>－16</strong> 次
    `;
    const entry = extractTsutatsuEntry(html, '36-15', 'https://example.com');
    expect(entry).not.toBeNull();
    expect(entry!.body).toContain('テスト内容');
  });

  it('「の」付き番号に対応する', () => {
    const html = `
      <h2>見出し</h2>
      <strong>33-6の2</strong>　テスト内容
      <strong>33-7</strong>　次
    `;
    const entry = extractTsutatsuEntry(html, '33-6', 'https://example.com');
    // 33-6 を検索した場合、33-6の2 もマッチする（の\d+ がオプション）
    expect(entry).not.toBeNull();
  });

  it('未発見時はnullを返す', () => {
    const html = `<strong>33-6</strong>テスト`;
    const entry = extractTsutatsuEntry(html, '99-99', 'https://example.com');
    expect(entry).toBeNull();
  });
});
