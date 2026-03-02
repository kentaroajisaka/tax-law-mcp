import { describe, it, expect } from 'vitest';
import {
  KFS_TAX_TYPE_REGISTRY,
  resolveKfsTaxType,
  listKfsTaxTypes,
} from '../../src/lib/kfs-registry.js';

describe('KFS_TAX_TYPE_REGISTRY', () => {
  it('全13税目がレジストリに存在する', () => {
    const list = listKfsTaxTypes();
    expect(list.length).toBe(13);
  });

  it('全エントリにtopicPathがある', () => {
    for (const [name, entry] of Object.entries(KFS_TAX_TYPE_REGISTRY)) {
      expect(entry.topicPath, `${name}: topicPath`).toBeTruthy();
      expect(entry.topicPath).toMatch(/^\/service\/MP\/\d{2}\/index\.html$/);
    }
  });

  it('topicPathの番号が01〜13で連続する', () => {
    const paths = Object.values(KFS_TAX_TYPE_REGISTRY).map(e => e.topicPath);
    for (let i = 1; i <= 13; i++) {
      const num = String(i).padStart(2, '0');
      expect(paths).toContain(`/service/MP/${num}/index.html`);
    }
  });
});

describe('resolveKfsTaxType', () => {
  it.each([
    ['所得税', '所得税法関係'],
    ['法人税', '法人税法関係'],
    ['消費税', '消費税法関係'],
    ['相続税', '相続税法関係'],
    ['贈与税', '相続税法関係'],
    ['通則法', '国税通則法関係'],
    ['措置法', '租税特別措置法関係'],
    ['徴収法', '国税徴収法関係'],
  ])('エイリアス: "%s" → "%s"', (alias, expected) => {
    const { name, entry } = resolveKfsTaxType(alias);
    expect(name).toBe(expected);
    expect(entry).not.toBeNull();
  });

  it('正式名称でも解決できる', () => {
    const { name, entry } = resolveKfsTaxType('所得税法関係');
    expect(name).toBe('所得税法関係');
    expect(entry).not.toBeNull();
    expect(entry!.topicPath).toBe('/service/MP/02/index.html');
  });

  it('不明な名前はnull', () => {
    const { entry } = resolveKfsTaxType('存在しない税目');
    expect(entry).toBeNull();
  });
});
