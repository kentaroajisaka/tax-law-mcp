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

  // --- 見出しにリンクが無い条の配下サブリンク（法第47条・第49条のケース） ---

  it('リンク無し見出し配下のサブリンクに親条番号(parentArticlePrefix)を付与する', () => {
    // 法第47条は素の<p>（リンク無し）、配下の「令第◯条関係」がリンク
    const html = `
      <p>法第47条《棚卸資産の売上原価等の計算及びその評価の方法》関係</p>
      <ul>
        <li><a href="/law/tsutatsu/kihon/shotoku/08/01.htm">〔棚卸資産の評価の方法（令第99条関係）〕</a></li>
        <li><a href="/law/tsutatsu/kihon/shotoku/08/02.htm">〔棚卸資産の評価の方法の選定（令第100条関係）〕</a></li>
      </ul>
    `;
    const links = parseTocLinks(html);
    expect(links.length).toBe(2);
    // articlePrefix は令番号（99/100）だが、parentArticlePrefix は法条番号(47)
    expect(links[0].articlePrefix).toBe('99');
    expect(links[0].parentArticlePrefix).toBe('47');
    expect(links[1].articlePrefix).toBe('100');
    expect(links[1].parentArticlePrefix).toBe('47');
  });

  it('リンク有り見出しは自身の条番号をparentArticlePrefixにし、以降のサブリンクへ引き継ぐ', () => {
    const html = `
      <p>法第47条《棚卸資産...》関係</p>
      <ul><li><a href="/law/tsutatsu/kihon/shotoku/08/01.htm">〔令第99条関係〕</a></li></ul>
      <p><a href="/law/tsutatsu/kihon/shotoku/08/04.htm">法第48条《有価証券...》関係</a></p>
      <p>法第49条《減価償却資産...》関係</p>
      <ul><li><a href="/law/tsutatsu/kihon/shotoku/08/05.htm">〔令第120条関係〕</a></li></ul>
    `;
    const links = parseTocLinks(html);
    const byHref = (h: string) => links.find(l => l.href === h)!;
    expect(byHref('/law/tsutatsu/kihon/shotoku/08/01.htm').parentArticlePrefix).toBe('47');
    // 法第48条自身のリンク: articlePrefix も parentArticlePrefix も 48
    expect(byHref('/law/tsutatsu/kihon/shotoku/08/04.htm').articlePrefix).toBe('48');
    expect(byHref('/law/tsutatsu/kihon/shotoku/08/04.htm').parentArticlePrefix).toBe('48');
    // 49条配下は親49へ切り替わる
    expect(byHref('/law/tsutatsu/kihon/shotoku/08/05.htm').parentArticlePrefix).toBe('49');
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

  it('parentArticlePrefix一致で配下サブリンクのページを返す（リンク無し見出し）', () => {
    // 法第47条見出しはリンク無し → articlePrefixに47は存在せず、parentArticlePrefixで辿る
    const links = [
      { text: '〔令第99条関係〕', href: '/path/08/01.htm', articlePrefix: '99', parentArticlePrefix: '47' },
      { text: '法第48条関係', href: '/path/08/04.htm', articlePrefix: '48', parentArticlePrefix: '48' },
    ];
    expect(findPageForNumber(links, '47-1')).toBe('/path/08/01.htm');
    // 48-1 は articlePrefix で先に一致し、回帰しない
    expect(findPageForNumber(links, '48-1')).toBe('/path/08/04.htm');
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

  it('parentArticlePrefix一致の配下サブリンクを全て候補に含める', () => {
    // 法第47条配下の3ページ（令99/100/104）はいずれも候補に入る
    const links = [
      { text: '〔令第99条関係〕', href: '/path/08/01.htm', articlePrefix: '99', parentArticlePrefix: '47' },
      { text: '〔令第100条関係〕', href: '/path/08/02.htm', articlePrefix: '100', parentArticlePrefix: '47' },
      { text: '〔令第104条関係〕', href: '/path/08/03.htm', articlePrefix: '104', parentArticlePrefix: '47' },
      { text: '法第48条関係', href: '/path/08/04.htm', articlePrefix: '48', parentArticlePrefix: '48' },
    ];
    const candidates = getCandidatePages(links, '47-8');
    expect(candidates).toContain('/path/08/01.htm');
    expect(candidates).toContain('/path/08/02.htm');
    expect(candidates).toContain('/path/08/03.htm');
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

  it('「の」付き番号に対応する（枝番のみ存在する場合のフォールバック）', () => {
    const html = `
      <h2>見出し</h2>
      <strong>33-6の2</strong>　テスト内容
      <strong>33-7</strong>　次
    `;
    const entry = extractTsutatsuEntry(html, '33-6', 'https://example.com');
    // 33-6（枝番なし）が存在しない場合は、33-6の2 にフォールバックする
    expect(entry).not.toBeNull();
    expect(entry!.body).toContain('テスト内容');
  });

  it('枝番なしの番号を、枝番付き（の2等）より優先して抽出する', () => {
    // NTA実ページの構造: 49-1（タグ分割）と 49-1の2（1タグ）が併存する
    const html = `
      <h2>（取得の意義）</h2>
      <strong>49</strong><strong>－1</strong>　これが本来の49-1です
      <h2>（別見出し）</h2>
      <strong>49－1の2</strong>　これは49-1の2で別物です
    `;
    const entry = extractTsutatsuEntry(html, '49-1', 'https://example.com');
    expect(entry).not.toBeNull();
    // 「49-1の2」ではなく「49-1」本体を返す
    expect(entry!.body).toContain('本来の49-1');
    expect(entry!.body).not.toContain('別物');
    expect(entry!.caption).toBe('（取得の意義）');
  });

  it('隣接番号（49-2検索が49-2の2を誤取得しない）', () => {
    const html = `
      <h2>見出しA</h2>
      <strong>49</strong><strong>－2</strong>　49-2の本文
      <h2>見出しB</h2>
      <strong>49</strong><strong>－2の2</strong>　49-2の2の本文
    `;
    const entry = extractTsutatsuEntry(html, '49-2', 'https://example.com');
    expect(entry).not.toBeNull();
    expect(entry!.body).toContain('49-2の本文');
    expect(entry!.caption).toBe('見出しA');
  });

  it('複数の枝番（の3の2）にもフォールバックで対応する', () => {
    const html = `
      <h2>見出し</h2>
      <strong>49－1の3の2</strong>　土石採取業の内容
      <strong>49－1の4</strong>　次
    `;
    const entry = extractTsutatsuEntry(html, '49-1の3の2', 'https://example.com');
    expect(entry).not.toBeNull();
    expect(entry!.body).toContain('土石採取業');
  });

  it('下位レイヤーの本体を優先する（49-1の3検索が49-1の3の2を誤取得しない）', () => {
    // 通達番号ルール: 「…の2」があれば同レイヤーに本体（実質「…の1」）が存在する。
    // これは階層が深くても同じ。49-1の3（＝実質 49-1の3の1）は 49-1の3の2 の一つ上の本体。
    const html = `
      <h2>見出しA</h2>
      <strong>49</strong><strong>－1の3</strong>　これが本体の49-1の3
      <h2>見出しB</h2>
      <strong>49－1の3の2</strong>　これは49-1の3の2で別物
    `;
    const entry = extractTsutatsuEntry(html, '49-1の3', 'https://example.com');
    expect(entry).not.toBeNull();
    expect(entry!.body).toContain('本体の49-1の3');
    expect(entry!.body).not.toContain('別物');
    expect(entry!.caption).toBe('見出しA');
  });

  it('未発見時はnullを返す', () => {
    const html = `<strong>33-6</strong>テスト`;
    const entry = extractTsutatsuEntry(html, '99-99', 'https://example.com');
    expect(entry).toBeNull();
  });
});
