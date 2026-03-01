import { describe, it, expect } from 'vitest';
import { resolveTsutatsuName, listSupportedTsutatsu, TSUTATSU_REGISTRY } from '../../src/lib/tsutatsu-registry.js';

describe('TSUTATSU_REGISTRY', () => {
  it('全17通達がレジストリに存在する', () => {
    const list = listSupportedTsutatsu();
    expect(list.length).toBe(17);
  });

  it('全エントリに必須フィールドがある', () => {
    for (const [name, entry] of Object.entries(TSUTATSU_REGISTRY)) {
      expect(entry.tocPath, `${name}: tocPath`).toBeTruthy();
      expect(entry.encoding, `${name}: encoding`).toBeTruthy();
      expect(entry.baseUrl, `${name}: baseUrl`).toBeTruthy();
    }
  });

  it('措置法通達にはtocFormatが設定されている', () => {
    expect(TSUTATSU_REGISTRY['措置法通達（山林所得・譲渡所得関係）'].tocFormat).toBe('sochiho-li');
    expect(TSUTATSU_REGISTRY['措置法通達（申告所得税関係）'].tocFormat).toBe('sochiho-p');
    expect(TSUTATSU_REGISTRY['措置法通達（法人税編）'].tocFormat).toBe('sochiho-article');
    expect(TSUTATSU_REGISTRY['措置法通達（相続税関係）'].tocFormat).toBe('sochiho-p');
  });
});

describe('resolveTsutatsuName', () => {
  // 既存の基本通達
  it.each([
    ['所基通', '所得税基本通達'],
    ['法基通', '法人税基本通達'],
    ['消基通', '消費税法基本通達'],
    ['相基通', '相続税法基本通達'],
    ['評基通', '財産評価基本通達'],
  ])('既存エイリアス: "%s" → "%s"', (alias, expected) => {
    const { name, entry } = resolveTsutatsuName(alias);
    expect(name).toBe(expected);
    expect(entry).not.toBeNull();
  });

  // 措置法通達エイリアス
  it.each([
    ['措通（譲渡）', '措置法通達（山林所得・譲渡所得関係）'],
    ['措通（申告）', '措置法通達（申告所得税関係）'],
    ['措通（法人税）', '措置法通達（法人税編）'],
    ['措通（相続税）', '措置法通達（相続税関係）'],
    ['措通（源泉）', '措置法通達（源泉所得税関係）'],
    ['措通（株式）', '措置法通達（株式等譲渡所得等関係）'],
  ])('措置法エイリアス: "%s" → "%s"', (alias, expected) => {
    const { name, entry } = resolveTsutatsuName(alias);
    expect(name).toBe(expected);
    expect(entry).not.toBeNull();
  });

  // Priority 2 基本通達エイリアス
  it.each([
    ['通法基通', '国税通則法基本通達'],
    ['印基通', '印紙税法基本通達'],
    ['税理士通達', '税理士法基本通達'],
    ['徴基通', '国税徴収法基本通達'],
    ['酒基通', '酒税法基本通達'],
  ])('基本通達エイリアス: "%s" → "%s"', (alias, expected) => {
    const { name, entry } = resolveTsutatsuName(alias);
    expect(name).toBe(expected);
    expect(entry).not.toBeNull();
  });

  it('正式名称でも解決できる', () => {
    const { name, entry } = resolveTsutatsuName('措置法通達（山林所得・譲渡所得関係）');
    expect(name).toBe('措置法通達（山林所得・譲渡所得関係）');
    expect(entry).not.toBeNull();
  });

  it('不明な名前はnull', () => {
    const { entry } = resolveTsutatsuName('存在しない通達');
    expect(entry).toBeNull();
  });
});
