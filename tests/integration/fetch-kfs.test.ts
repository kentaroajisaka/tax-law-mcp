/**
 * 統合テスト: KFS裁決事例の実サイト取得検証
 *
 * KFSサイトへの負荷軽減のため、sequential実行 + 各テスト30秒タイムアウト
 */
import { describe, it, expect } from 'vitest';
import { fetchKfsPage, fetchKfsTopicPage } from '../../src/lib/kfs-client.js';
import {
  parseKfsTopicIndex,
  parseKfsTopicCategories,
  parseCollectionList,
  parseCollectionIndex,
  parseCaseFullText,
} from '../../src/lib/kfs-parser.js';

describe.sequential('KFS裁決事例の実サイト取得テスト', () => {

  it('税目一覧の取得（13税目）', async () => {
    const html = await fetchKfsTopicPage('/service/MP/index.html');
    const taxTypes = parseKfsTopicIndex(html);

    expect(taxTypes.length).toBe(13);
    expect(taxTypes[0].name).toBe('国税通則法関係');
    expect(taxTypes[1].name).toBe('所得税法関係');
    expect(taxTypes[2].name).toBe('法人税法関係');
  }, 30000);

  it('所得税法関係のカテゴリ取得', async () => {
    const html = await fetchKfsTopicPage('/service/MP/02/index.html');
    const categories = parseKfsTopicCategories(html);

    expect(categories.length).toBeGreaterThan(5);
    // 所得税には「総則」「所得の種類」「収入金額」等のカテゴリがある
    const names = categories.map(c => c.name);
    expect(names).toContain('総則');
    expect(names).toContain('必要経費');
  }, 30000);

  it('事例集一覧の取得（97冊）', async () => {
    const html = await fetchKfsPage('/service/JP/index.html');
    const collections = parseCollectionList(html);

    expect(collections.length).toBeGreaterThan(90);
    expect(collections[0].no).toBe(43);
    expect(collections[collections.length - 1].no).toBeGreaterThanOrEqual(139);
  }, 30000);

  it('最新事例集(No.139)の目次パース', async () => {
    const html = await fetchKfsPage('/service/JP/idx/139.html');
    const cases = parseCollectionIndex(html, 139, 'https://www.kfs.go.jp/service/JP/idx/139.html');

    expect(cases.length).toBeGreaterThan(0);
    // 最初の事例が正しくパースされている
    const first = cases[0];
    expect(first.collectionNo).toBe(139);
    expect(first.taxType).toBeTruthy();
    expect(first.caseUrl).toContain('/service/JP/139/');
    expect(first.date).toBeTruthy();
    expect(first.summary.length).toBeGreaterThan(20);
  }, 30000);

  it('古い事例集(No.43)のパース', async () => {
    const html = await fetchKfsPage('/service/JP/idx/43.html');
    const cases = parseCollectionIndex(html, 43, 'https://www.kfs.go.jp/service/JP/idx/43.html');

    expect(cases.length).toBeGreaterThan(30);
    const first = cases[0];
    expect(first.collectionNo).toBe(43);
    expect(first.taxType).toBeTruthy();
    expect(first.summary.length).toBeGreaterThan(10);
  }, 30000);

  it('裁決全文の取得（No.139-01）', async () => {
    const html = await fetchKfsPage('/service/JP/139/01/index.html');
    const fullText = parseCaseFullText(html);

    expect(fullText).not.toBeNull();
    expect(fullText!.body.length).toBeGreaterThan(1000);
    expect(fullText!.date).toMatch(/令和/);
  }, 30000);

  it('キーワード検索（"重加算税" で最新5冊を検索）', async () => {
    // 事例集一覧取得
    const indexHtml = await fetchKfsPage('/service/JP/index.html');
    const collections = parseCollectionList(indexHtml);
    const latest5 = collections.slice(-5);

    // 各事例集をパースしてキーワード検索
    const allCases = [];
    for (const col of latest5) {
      const html = await fetchKfsPage(col.idxUrl);
      const cases = parseCollectionIndex(html, col.no, `https://www.kfs.go.jp${col.idxUrl}`);
      allCases.push(...cases);
    }

    const keyword = '重加算税';
    const filtered = allCases.filter(c =>
      c.summary.includes(keyword) || c.category.includes(keyword)
    );

    expect(filtered.length).toBeGreaterThan(0);
    // 重加算税の事例は国税通則法関係に分類されることが多い
    const hasTsusokuHou = filtered.some(c => c.taxType === '国税通則法関係');
    expect(hasTsusokuHou).toBe(true);
  }, 60000);

});
