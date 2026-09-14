import { describe, it, expect } from 'vitest';
import { getLawArticle } from '../../../src/lib/services/law-service.js';
import { NotFoundError } from '../../../src/lib/errors.js';

describe('号・サブアイテムの指定', () => {
  it('項を省いても号を特定できる', async () => {
    const withPara = await getLawArticle({
      lawName: '相続税法', article: '12', paragraph: 1, item: 6,
    });
    const withoutPara = await getLawArticle({
      lawName: '相続税法', article: '12', item: 6,
    });
    expect(withoutPara.text).toBe(withPara.text);
    expect(withoutPara.text).toContain('相続人の取得した');
    // 条文全体が返ってきていないこと（回帰防止）
    expect(withoutPara.text).not.toContain('皇室経済法');
  }, 20000);

  it('枝番号の号を文字列で指定できる', async () => {
    const result = await getLawArticle({
      lawName: '法人税法', article: '2', item: '12の5の2',
    });
    expect(result.text).toContain('十二の五の二');
  }, 20000);

  it('漢数字の見出しでも号を指定できる', async () => {
    const result = await getLawArticle({
      lawName: '相続税法', article: '12', item: '六',
    });
    expect(result.text).toContain('相続人の取得した');
  }, 20000);

  it('サブアイテム（イ・ロ）を指定できる', async () => {
    const i = await getLawArticle({
      lawName: '相続税法', article: '12', item: 6, subitem: 'イ',
    });
    const ro = await getLawArticle({
      lawName: '相続税法', article: '12', item: 6, subitem: 'ロ',
    });
    expect(i.text).toContain('以下である場合');
    expect(ro.text).toContain('超える場合');
    expect(i.text).not.toBe(ro.text);
  }, 20000);

  it('サブアイテムを Num（1/2）でも指定できる', async () => {
    const byLabel = await getLawArticle({
      lawName: '相続税法', article: '12', item: 6, subitem: 'イ',
    });
    const byNum = await getLawArticle({
      lawName: '相続税法', article: '12', item: 6, subitem: '1',
    });
    expect(byNum.text).toBe(byLabel.text);
  }, 20000);

  it('item なしで subitem を指定するとエラー', async () => {
    await expect(
      getLawArticle({ lawName: '相続税法', article: '12', subitem: 'イ' })
    ).rejects.toThrow(NotFoundError);
  }, 20000);

  it('存在しない号・サブアイテムは NotFoundError', async () => {
    await expect(
      getLawArticle({ lawName: '相続税法', article: '12', item: 99 })
    ).rejects.toThrow(NotFoundError);
    await expect(
      getLawArticle({ lawName: '相続税法', article: '12', item: 6, subitem: 'ヲ' })
    ).rejects.toThrow(NotFoundError);
  }, 20000);
});

describe('項をまたぐ号番号の重複', () => {
  it('subitem が解決できる項を優先して選ぶ', async () => {
    // 措置法37の14の2条は1項にも5項にも「二号」があり、
    // 目的の「ロ」は5項2号の下にしかない
    const result = await getLawArticle({
      lawName: '租税特別措置法', article: '37の14の2', item: '2', subitem: 'ロ',
    });
    expect(result.matchedParagraph).toBe(5);
    expect(result.text).toContain('非課税管理勘定');
  }, 20000);

  it('項を省いたとき、実際に一致した項番号を返す', async () => {
    const result = await getLawArticle({
      lawName: '相続税法', article: '12', item: 6,
    });
    expect(result.matchedParagraph).toBe(1);
  }, 20000);

  it('3段のサブアイテム（イ→(1)→(i)）に到達できる', async () => {
    const result = await getLawArticle({
      lawName: '租税特別措置法', article: '37の14の2', paragraph: 5,
      item: '2', subitem: 'ロ （１） （ｉ）',
    });
    expect(result.text).toContain('（ｉ）');
    expect(result.text).toContain('買付けの委託');
  }, 20000);
});
