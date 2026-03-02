import { describe, it, expect } from 'vitest';
import { listSaiketsuTaxTypes, listSaiketsuCategories, searchSaiketsu, getSaiketsu } from '../../../src/lib/services/saiketsu-service.js';
import { ValidationError, UnsupportedError } from '../../../src/lib/errors.js';

describe('saiketsu-service', () => {
  describe('listSaiketsuTaxTypes', () => {
    it('13税目が返る', async () => {
      const result = await listSaiketsuTaxTypes();
      expect(result.taxTypes.length).toBe(13);
      expect(result.url).toContain('kfs.go.jp');
    }, 15000);
  });

  describe('listSaiketsuCategories', () => {
    it('所得税法関係のカテゴリが返る', async () => {
      const result = await listSaiketsuCategories('所得税');
      expect(result.taxTypeName).toContain('所得税');
      expect(result.categories.length).toBeGreaterThan(0);
    }, 15000);

    it('対応していない税目でUnsupportedError', async () => {
      await expect(
        listSaiketsuCategories('存在しない税目')
      ).rejects.toThrow(UnsupportedError);
    });
  });

  describe('searchSaiketsu', () => {
    it('最新5冊から検索できる', async () => {
      const result = await searchSaiketsu({ keyword: '所得', latest: 5, limit: 3 });
      expect(result.scope).toContain('5冊');
      // 結果が0件の可能性もあるのでresultsの型チェックだけ
      expect(Array.isArray(result.results)).toBe(true);
      expect(Array.isArray(result.fetchErrors)).toBe(true);
    }, 60000);
  });

  describe('getSaiketsu', () => {
    it('パラメータなしでValidationError', async () => {
      await expect(
        getSaiketsu({})
      ).rejects.toThrow(ValidationError);
    });

    it('KFS以外のURLでValidationError', async () => {
      await expect(
        getSaiketsu({ url: 'https://evil.com/test' })
      ).rejects.toThrow(ValidationError);
    });
  });
});
