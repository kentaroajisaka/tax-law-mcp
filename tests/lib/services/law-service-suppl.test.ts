import { describe, it, expect } from 'vitest';
import { listSuppl, getSupplProvision, getLawArticle } from '../../../src/lib/services/law-service.js';
import { NotFoundError } from '../../../src/lib/errors.js';

describe('附則', () => {
  it('附則の一覧を取得できる', async () => {
    const result = await listSuppl({ lawName: '保険法' });
    expect(result.items.length).toBeGreaterThanOrEqual(2);
    // 制定時附則は改正法番号を持たない
    const seitei = result.items.find((i) => !i.amendLawNum);
    expect(seitei).toBeDefined();
    expect(seitei!.articleNums).toEqual(['1', '2', '3', '4', '5', '6']);
  }, 20000);

  it('制定時附則の条を取得できる（本則と取り違えない）', async () => {
    const suppl = await getSupplProvision({ lawName: '保険法', supplementary: true, article: '1' });
    const main = await getLawArticle({ lawName: '保険法', article: '1' });
    expect(suppl.text).toContain('公布の日から起算して');
    expect(main.text).toContain('趣旨');
    expect(suppl.text).not.toBe(main.text);
  }, 20000);

  it('改正法の附則を法令番号で特定できる（漢数字と算用数字を吸収）', async () => {
    const result = await getSupplProvision({
      lawName: '保険法', supplementary: '平成29年法律第45号',
    });
    expect(result.amendLawNum).toBe('平成二九年六月二日法律第四五号');
    expect(result.text).toContain('民法改正法の施行の日');
  }, 20000);

  it('条を持たない附則は article を省くと全体が返る', async () => {
    const result = await getSupplProvision({
      lawName: '保険法', supplementary: '平成29年法律第45号',
    });
    expect(result.text.length).toBeGreaterThan(0);
  }, 20000);

  it('該当する附則がなければ NotFoundError（件数と調べ方を示す）', async () => {
    await expect(
      getSupplProvision({ lawName: '所得税法', supplementary: '令和99年法律第1号' })
    ).rejects.toThrow(/附則が\d+件あります/);
  }, 20000);

  it('複数の附則に該当したら候補を示して NotFoundError', async () => {
    await expect(
      getSupplProvision({ lawName: '所得税法', supplementary: '45号' })
    ).rejects.toThrow(/一意に定まりませんでした/);
  }, 20000);

  it('附則に存在しない条は、持っている条番号を示して NotFoundError', async () => {
    await expect(
      getSupplProvision({ lawName: '保険法', supplementary: true, article: '99' })
    ).rejects.toThrow(/この附則が持つ条: 1, 2, 3, 4, 5, 6/);
  }, 20000);

  it('附則を多数持つ法令でも列挙できる', async () => {
    const result = await listSuppl({ lawName: '民法' });
    expect(result.items.length).toBeGreaterThan(50);
    const total = result.items.reduce((a, i) => a + i.articleNums.length, 0);
    expect(total).toBeGreaterThan(100);
  }, 20000);
});

describe('supplementary の型ゆらぎ', () => {
  it('真偽値 true と文字列 "true" が同じ結果になる', async () => {
    const bool = await getSupplProvision({ lawName: '保険法', supplementary: true, article: '1' });
    const str = await getSupplProvision({ lawName: '保険法', supplementary: 'true', article: '1' });
    expect(str.text).toBe(bool.text);
    expect(str.text).toContain('公布の日から起算して');
  }, 20000);

  it('"制定" "制定時" "本則" も制定時附則として扱う', async () => {
    const base = await getSupplProvision({ lawName: '保険法', supplementary: true, article: '1' });
    for (const q of ['制定', '制定時', '本則']) {
      const r = await getSupplProvision({ lawName: '保険法', supplementary: q, article: '1' });
      expect(r.text, `supplementary="${q}"`).toBe(base.text);
    }
  }, 30000);
});
