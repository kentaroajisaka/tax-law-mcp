import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchLawData, isLawId } from '../../src/lib/egov-client.js';
import { LAW_ID_MAP } from '../../src/lib/law-registry.js';
import { lawDataCache, lawSearchCache } from '../../src/lib/cache.js';
import type { EgovLawData } from '../../src/lib/types.js';

describe('isLawId', () => {
  // e-Gov API v2 が実際に返す law_id の形。
  // 旧実装の /^\d{15}$/ はこのいずれにもマッチせず、law_id 直接指定が機能していなかった。
  it.each([
    ['340AC0000000033', '法律（所得税法）'],
    ['405AC0000000088', '法律（行政手続法・プリセット未登録）'],
    ['340CO0000000096', '政令（所得税法施行令）'],
    ['105DF0000000337', '太政官布告'],
    ['340M50000040011', '府省令（所得税法施行規則）'],
    ['122M10000001012', '府省令'],
    ['348RJNJ10004000', '規則（英字4文字コード）'],
    ['348M50010D40002', '府省令（中間に英字）'],
    ['416M60001FCA002', '府省令（英字3文字混在）'],
    ['321CONSTITUTION', '日本国憲法'],
  ])('%s を law_id として認識する（%s）', (id) => {
    expect(isLawId(id)).toBe(true);
  });

  it.each([
    ['所得税法', '法令名'],
    ['行政手続法', '法令名'],
    ['所法', '略称'],
    ['340AC000000003', '14文字（短い）'],
    ['340AC00000000333', '16文字（長い）'],
    ['340ac0000000033', '小文字'],
    ['3400C0000000033', '4文字目が数字（種別コードなし）'],
    ['340AC00000000 3', '空白混入'],
    ['', '空文字'],
  ])('%s は law_id として扱わない（%s）', (input) => {
    expect(isLawId(input)).toBe(false);
  });

  // レジストリのプリセット値と判定ロジックが乖離すると
  // law_id 直接指定が黙って壊れるため、両者を突き合わせて固定する。
  it('LAW_ID_MAP のプリセット値はすべて law_id パターンに一致する', () => {
    for (const [name, id] of Object.entries(LAW_ID_MAP)) {
      expect(isLawId(id), `${name}: ${id}`).toBe(true);
    }
  });
});

/** extractLawTitle が読める最小限の EgovLawData を組み立てる */
function makeLawData(lawId: string, title: string): EgovLawData {
  return {
    law_info: {
      law_id: lawId,
      law_type: 'Act',
      law_num: '平成五年法律第八十八号',
      promulgation_date: '1993-11-12',
    },
    law_full_text: {
      tag: 'Law',
      children: [{ tag: 'LawTitle', children: [title] }],
    },
  };
}

describe('fetchLawData — law_id 直接指定', () => {
  beforeEach(() => {
    lawDataCache.clear();
    lawSearchCache.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** fetch をモックして、呼ばれた URL を記録する */
  function stubFetch(lawId: string, title: string): string[] {
    const urls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        urls.push(String(input));
        return new Response(JSON.stringify(makeLawData(lawId, title)), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      })
    );
    return urls;
  }

  it('プリセット未登録の law_id をキーワード検索にフォールバックせず直接取得する', async () => {
    const urls = stubFetch('405AC0000000088', '行政手続法');

    const result = await fetchLawData('405AC0000000088');

    expect(result.lawId).toBe('405AC0000000088');
    expect(result.lawTitle).toBe('行政手続法');
    // law_data を1回叩くだけ。/laws?keyword=... の検索は発生しない
    expect(urls).toEqual(['https://laws.e-gov.go.jp/api/2/law_data/405AC0000000088']);
  });

  it('日本国憲法 (321CONSTITUTION) も law_id として直接取得できる', async () => {
    const urls = stubFetch('321CONSTITUTION', '日本国憲法');

    const result = await fetchLawData('321CONSTITUTION');

    expect(result.lawId).toBe('321CONSTITUTION');
    expect(urls).toEqual(['https://laws.e-gov.go.jp/api/2/law_data/321CONSTITUTION']);
  });

  it('府省令の law_id (M形式) も直接取得できる', async () => {
    const urls = stubFetch('340M50000040011', '所得税法施行規則');

    const result = await fetchLawData('340M50000040011');

    expect(result.lawId).toBe('340M50000040011');
    expect(urls).toEqual(['https://laws.e-gov.go.jp/api/2/law_data/340M50000040011']);
  });

  it('プリセット登録済みの法令名は従来どおり law_id に解決される', async () => {
    const urls = stubFetch('340AC0000000033', '所得税法');

    const result = await fetchLawData('所得税法');

    expect(result.lawId).toBe('340AC0000000033');
    expect(urls).toEqual(['https://laws.e-gov.go.jp/api/2/law_data/340AC0000000033']);
  });

  it('law_id 形式でない未知の法令名は従来どおりキーワード検索に回る', async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        urls.push(String(input));
        return new Response(JSON.stringify({ laws: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      })
    );

    await expect(fetchLawData('存在しない架空の法律')).rejects.toThrow('法令が見つかりません');
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain('/api/2/laws?');
  });

  it('存在しない law_id は 404 をそのまま報告する（検索にフォールバックしない）', async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        urls.push(String(input));
        return new Response('Not Found', { status: 404, statusText: 'Not Found' });
      })
    );

    await expect(fetchLawData('999ZZ0000000000')).rejects.toThrow(
      '法令が見つかりません (law_id: 999ZZ0000000000)'
    );
    expect(urls).toEqual(['https://laws.e-gov.go.jp/api/2/law_data/999ZZ0000000000']);
  });

  it('e-Gov 実 API からも law_id 直接指定で取得できる', async () => {
    const result = await fetchLawData('405AC0000000088');
    expect(result.lawId).toBe('405AC0000000088');
    expect(result.lawTitle).toBe('行政手続法');
  }, 15000);
});

/** /laws の検索結果1件分 */
function searchHit(lawId: string, title: string, abbrev: string | null = null) {
  return {
    law_info: { law_id: lawId, law_type: 'Act', law_num: '', promulgation_date: '' },
    revision_info: { law_title: title, abbrev, repeal_status: 'None' },
  };
}

describe('fetchLawData — 法令名の解決', () => {
  beforeEach(() => {
    lawDataCache.clear();
    lawSearchCache.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** /laws は検索結果、/law_data は法令本文を返す fetch モック。呼ばれた URL を記録する */
  function stubSearchAndData(laws: unknown[], lawId: string, title: string): string[] {
    const urls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        urls.push(url);
        const body = url.includes('/laws?') ? { laws } : makeLawData(lawId, title);
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      })
    );
    return urls;
  }

  it('法令名検索は law_title で行う（/laws は keyword を黙って無視し、全法令を law_id 順に返すため）', async () => {
    const urls = stubSearchAndData(
      [searchHit('343AC1000000089', '社会保険労務士法', '社労士法')],
      '343AC1000000089',
      '社会保険労務士法'
    );

    const result = await fetchLawData('社会保険労務士法');

    expect(result.lawId).toBe('343AC1000000089');
    const searchUrl = new URL(urls[0]);
    expect(searchUrl.pathname).toBe('/api/2/laws');
    expect(searchUrl.searchParams.get('law_title')).toBe('社会保険労務士法');
    expect(searchUrl.searchParams.has('keyword')).toBe(false);
  });

  it('部分一致の候補が先に並んでいても、法令名が完全一致する法令を選ぶ', async () => {
    const urls = stubSearchAndData(
      [
        searchHit('343AC1000000089', '社会保険労務士法', '社労士法'),
        searchHit('343CO0000000327', '社会保険労務士法施行令', '社労士法施行令'),
      ],
      '343CO0000000327',
      '社会保険労務士法施行令'
    );

    const result = await fetchLawData('社会保険労務士法施行令');

    expect(result.lawId).toBe('343CO0000000327');
    expect(urls[1]).toBe('https://laws.e-gov.go.jp/api/2/law_data/343CO0000000327');
  });

  it('e-Gov に登録された略称の完全一致でも解決する', async () => {
    stubSearchAndData(
      [searchHit('343AC1000000089', '社会保険労務士法', '社労士法')],
      '343AC1000000089',
      '社会保険労務士法'
    );

    const result = await fetchLawData('社労士法');

    expect(result.lawId).toBe('343AC1000000089');
  });

  it('完全一致がなければ別の法令を返さず、候補つきで見つからないと報告する', async () => {
    const urls = stubSearchAndData(
      [searchHit('343AC1000000089', '社会保険労務士法', '社労士法')],
      '343AC1000000089',
      '社会保険労務士法'
    );

    await expect(fetchLawData('社会保険労務')).rejects.toThrow(/完全一致なし.*社会保険労務士法/);
    // 法令本文（/law_data）は取りに行かない
    expect(urls).toHaveLength(1);
  });
});
