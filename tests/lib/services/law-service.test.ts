import { describe, it, expect } from 'vitest';
import { getLawArticle, getLawToc, searchLaw } from '../../../src/lib/services/law-service.js';
import { NotFoundError } from '../../../src/lib/errors.js';

describe('law-service', () => {
  describe('getLawArticle', () => {
    it('所得税法第33条（譲渡所得）を取得できる', async () => {
      const result = await getLawArticle({ lawName: '所得税法', article: '33' });
      expect(result.lawTitle).toBe('所得税法');
      expect(result.article).toBe('33');
      expect(result.text).toContain('譲渡所得');
      expect(result.egovUrl).toContain('laws.e-gov.go.jp');
    }, 15000);

    it('略称（所法）でも取得できる', async () => {
      const result = await getLawArticle({ lawName: '所法', article: '33' });
      expect(result.lawTitle).toBe('所得税法');
    }, 15000);

    it('存在しない条文でNotFoundError', async () => {
      await expect(
        getLawArticle({ lawName: '所得税法', article: '9999' })
      ).rejects.toThrow(NotFoundError);
    }, 15000);
  });

  describe('getLawToc', () => {
    it('所得税法の目次を取得できる', async () => {
      const result = await getLawToc({ lawName: '所得税法' });
      expect(result.lawTitle).toBe('所得税法');
      expect(result.toc).toBeTruthy();
      expect(result.egovUrl).toContain('laws.e-gov.go.jp');
    }, 15000);
  });

  describe('searchLaw', () => {
    it('キーワード検索で結果が返る', async () => {
      const result = await searchLaw({ keyword: '所得税' });
      expect(result.results.length).toBeGreaterThan(0);
      expect(result.results[0].lawTitle).toBeTruthy();
      expect(result.results[0].egovUrl).toContain('laws.e-gov.go.jp');
    }, 15000);

    it('limit制限が効く', async () => {
      const result = await searchLaw({ keyword: '税', limit: 3 });
      expect(result.results.length).toBeLessThanOrEqual(3);
    }, 15000);
  });
});
