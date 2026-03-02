import { describe, it, expect } from 'vitest';
import type { KfsCaseEntry } from '../../src/lib/types.js';

/**
 * search_saiketsu 内のフィルタリングロジックを再現してテスト
 * （ツール本体はMcpServer依存なので、ロジック部分だけ抽出）
 */

// --- ツール内のフィルタリングロジックを関数化 ---

function filterByKeyword(cases: KfsCaseEntry[], keyword: string): KfsCaseEntry[] {
  const keywords = keyword.split(/\s+/).filter(Boolean);
  return cases.filter(c => {
    const searchTarget = `${c.summary} ${c.category} ${c.taxType}`;
    return keywords.every(kw => searchTarget.includes(kw));
  });
}

function filterByTaxType(cases: KfsCaseEntry[], taxType: string): KfsCaseEntry[] {
  if (!taxType) return cases;
  return cases.filter(c => {
    if (!c.taxType) return false;
    return c.taxType.includes(taxType) || taxType.includes(c.taxType.replace('関係', ''));
  });
}

// --- テストデータ ---

const SAMPLE_CASES: KfsCaseEntry[] = [
  {
    collectionNo: 139,
    taxType: '所得税法関係',
    category: '（譲渡所得）',
    summary: '請求人が取得した土地の取得費について、立退料の支払いを考慮して判断した事例',
    date: '令和7年4月11日',
    caseUrl: 'https://www.kfs.go.jp/service/JP/139/01/index.html',
  },
  {
    collectionNo: 138,
    taxType: '法人税法関係',
    category: '（交際費等）',
    summary: '法人が支出した飲食費について交際費等に該当するか判断した事例',
    date: '令和6年10月1日',
    caseUrl: 'https://www.kfs.go.jp/service/JP/138/05/index.html',
  },
  {
    collectionNo: 137,
    taxType: '消費税法関係',
    category: '（仕入税額控除）',
    summary: '仕入税額控除の適用について帳簿の記載要件を検討した事例',
    date: '令和6年7月15日',
    caseUrl: 'https://www.kfs.go.jp/service/JP/137/03/index.html',
  },
  {
    collectionNo: 136,
    taxType: '国税通則法関係',
    category: '（重加算税）',
    summary: '重加算税の賦課決定について隠蔽又は仮装の行為の有無を判断した事例',
    date: '令和6年4月1日',
    caseUrl: 'https://www.kfs.go.jp/service/JP/136/10/index.html',
  },
  {
    collectionNo: 135,
    taxType: '所得税法関係',
    category: '（必要経費）',
    summary: '不動産所得の必要経費について争われた事例',
    date: '令和5年12月1日',
    caseUrl: 'https://www.kfs.go.jp/service/JP/135/02/index.html',
  },
  {
    collectionNo: 134,
    taxType: '',  // 税目なし（エッジケース）
    category: '（その他）',
    summary: 'テスト用の税目なし事例',
    date: '',
    caseUrl: 'https://www.kfs.go.jp/service/JP/134/99/index.html',
  },
];

// ========================================
// キーワード検索テスト
// ========================================

describe('keyword filter (AND search)', () => {
  it('single keyword matches summary', () => {
    const result = filterByKeyword(SAMPLE_CASES, '立退料');
    expect(result.length).toBe(1);
    expect(result[0].collectionNo).toBe(139);
  });

  it('single keyword matches category', () => {
    const result = filterByKeyword(SAMPLE_CASES, '仕入税額控除');
    expect(result.length).toBe(1);
    expect(result[0].collectionNo).toBe(137);
  });

  it('single keyword matches taxType', () => {
    const result = filterByKeyword(SAMPLE_CASES, '法人税法関係');
    expect(result.length).toBe(1);
    expect(result[0].collectionNo).toBe(138);
  });

  it('AND search: two keywords both in summary', () => {
    const result = filterByKeyword(SAMPLE_CASES, '重加算税 隠蔽');
    expect(result.length).toBe(1);
    expect(result[0].collectionNo).toBe(136);
  });

  it('AND search: one keyword in summary, one in category', () => {
    const result = filterByKeyword(SAMPLE_CASES, '土地 譲渡所得');
    expect(result.length).toBe(1);
    expect(result[0].collectionNo).toBe(139);
  });

  it('AND search: one keyword in summary, one in taxType', () => {
    const result = filterByKeyword(SAMPLE_CASES, '飲食費 法人税');
    expect(result.length).toBe(1);
    expect(result[0].collectionNo).toBe(138);
  });

  it('AND search: keywords that do not co-occur returns empty', () => {
    const result = filterByKeyword(SAMPLE_CASES, '立退料 法人税');
    expect(result.length).toBe(0);
  });

  it('keyword with no matches returns empty', () => {
    const result = filterByKeyword(SAMPLE_CASES, '存在しないキーワード');
    expect(result.length).toBe(0);
  });

  it('multiple spaces between keywords are handled', () => {
    const result = filterByKeyword(SAMPLE_CASES, '重加算税   隠蔽');
    expect(result.length).toBe(1);
  });

  it('leading/trailing spaces are trimmed', () => {
    const result = filterByKeyword(SAMPLE_CASES, '  立退料  ');
    expect(result.length).toBe(1);
  });

  it('broad keyword matches multiple cases', () => {
    const result = filterByKeyword(SAMPLE_CASES, '所得税法関係');
    expect(result.length).toBe(2);  // collectionNo 139 and 135
  });

  it('empty keyword matches all cases', () => {
    // split('').filter(Boolean) = [] → every() on empty = true
    const result = filterByKeyword(SAMPLE_CASES, '');
    expect(result.length).toBe(SAMPLE_CASES.length);
  });

  it('whitespace-only keyword matches all cases', () => {
    const result = filterByKeyword(SAMPLE_CASES, '   ');
    expect(result.length).toBe(SAMPLE_CASES.length);
  });
});

// ========================================
// 税目フィルタテスト
// ========================================

describe('tax_type filter', () => {
  it('exact match on taxType', () => {
    const result = filterByTaxType(SAMPLE_CASES, '所得税法関係');
    expect(result.length).toBe(2);
  });

  it('partial match: "所得税" matches "所得税法関係"', () => {
    const result = filterByTaxType(SAMPLE_CASES, '所得税');
    expect(result.length).toBe(2);
  });

  it('reverse partial: taxType.replace("関係","") included in input', () => {
    // c.taxType = "消費税法関係" → replace → "消費税法"
    // "消費税法" included in "消費税法" → true
    const result = filterByTaxType(SAMPLE_CASES, '消費税法');
    expect(result.length).toBe(1);
    expect(result[0].collectionNo).toBe(137);
  });

  it('excludes entries with empty taxType', () => {
    const result = filterByTaxType(SAMPLE_CASES, '所得税');
    // The entry with empty taxType (collectionNo 134) should NOT be included
    expect(result.every(c => c.taxType !== '')).toBe(true);
  });

  it('no match returns empty', () => {
    const result = filterByTaxType(SAMPLE_CASES, '酒税法関係');
    expect(result.length).toBe(0);
  });

  it('empty string tax_type returns all cases (no filter applied)', () => {
    const result = filterByTaxType(SAMPLE_CASES, '');
    expect(result.length).toBe(SAMPLE_CASES.length);
  });

  it('"通則法" matches "国税通則法関係"', () => {
    const result = filterByTaxType(SAMPLE_CASES, '通則法');
    expect(result.length).toBe(1);
    expect(result[0].collectionNo).toBe(136);
  });
});

// ========================================
// ソート＆上限テスト
// ========================================

describe('sort and limit', () => {
  it('results are sorted by collectionNo descending', () => {
    const filtered = filterByKeyword(SAMPLE_CASES, '所得税法関係');
    filtered.sort((a, b) => b.collectionNo - a.collectionNo);
    expect(filtered[0].collectionNo).toBe(139);
    expect(filtered[1].collectionNo).toBe(135);
  });

  it('limit truncates results', () => {
    const filtered = filterByKeyword(SAMPLE_CASES, '事例');
    filtered.sort((a, b) => b.collectionNo - a.collectionNo);
    const limited = filtered.slice(0, 2);
    expect(limited.length).toBe(2);
    expect(limited[0].collectionNo).toBe(139);
  });
});
