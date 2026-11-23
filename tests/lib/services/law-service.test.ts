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

    // 略称表にない法令は e-Gov の法令名検索で解決する（以前は明治の改暦ノ布告に化けていた）
    it('税理士法第41条の2を取得できる', async () => {
      const result = await getLawArticle({ lawName: '税理士法', article: '41の2' });
      expect(result.lawTitle).toBe('税理士法');
      expect(result.egovUrl).toContain('326AC1000000237');
    }, 15000);

    it('社会保険労務士法第27条を取得できる（略称表にない法令）', async () => {
      const result = await getLawArticle({ lawName: '社会保険労務士法', article: '27' });
      expect(result.lawTitle).toBe('社会保険労務士法');
      expect(result.egovUrl).toContain('343AC1000000089');
    }, 15000);

    it('社会保険労務士法施行令第2条を取得できる（法律でなく政令に解決する）', async () => {
      const result = await getLawArticle({ lawName: '社会保険労務士法施行令', article: '2' });
      expect(result.lawTitle).toBe('社会保険労務士法施行令');
      expect(result.egovUrl).toContain('343CO0000000327');
    }, 15000);

    it('行政書士法第1条の2を取得できる', async () => {
      const result = await getLawArticle({ lawName: '行政書士法', article: '1の2' });
      expect(result.lawTitle).toBe('行政書士法');
      expect(result.egovUrl).toContain('326AC1000000004');
    }, 15000);

    it('e-Gov 登録の略称（社労士法）でも取得できる', async () => {
      const result = await getLawArticle({ lawName: '社労士法', article: '2' });
      expect(result.lawTitle).toBe('社会保険労務士法');
    }, 15000);

    it('law_id を直接指定しても取得できる', async () => {
      const result = await getLawArticle({ lawName: '343CO0000000327', article: '2' });
      expect(result.lawTitle).toBe('社会保険労務士法施行令');
    }, 15000);

    it('完全一致しない法令名は別法令に化けず NotFoundError（候補つき）', async () => {
      const error = await getLawArticle({ lawName: '社会保険労務', article: '1' }).catch(e => e);
      expect(error).toBeInstanceOf(NotFoundError);
      expect(error.message).toContain('完全一致なし');
      expect(error.message).toContain('社会保険労務士法');
      expect(error.message).not.toContain('改暦');
    }, 15000);

    it('存在しない法令名は NotFoundError', async () => {
      await expect(
        getLawArticle({ lawName: '存在しない架空法令', article: '1' })
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

    it('法令名で絞り込まれ、完全一致が先頭に来る（所得税→所得税法）', async () => {
      const result = await searchLaw({ keyword: '所得税法' });
      expect(result.mode).toBe('title');
      expect(result.results[0].lawTitle).toBe('所得税法');
      expect(result.results.every(r => r.lawTitle.includes('所得税'))).toBe(true);
    }, 15000);

    it('社会保険労務士法施行令を政令で検索すると1件目が正解', async () => {
      const result = await searchLaw({ keyword: '社会保険労務士法施行令', lawType: 'CabinetOrder' });
      expect(result.results[0].lawId).toBe('343CO0000000327');
      expect(result.results.some(r => r.lawTitle.includes('太政官布告'))).toBe(false);
    }, 15000);

    it('税理士法で検索すると法律・施行令・施行規則が返る', async () => {
      const result = await searchLaw({ keyword: '税理士法' });
      const ids = result.results.map(r => r.lawId);
      expect(ids[0]).toBe('326AC1000000237');
      expect(ids).toContain('326CO0000000216');
      expect(ids).toContain('326M50000040055');
    }, 15000);

    it('法令名に一致がなければ本文検索に切り替える', async () => {
      const result = await searchLaw({ keyword: '適格請求書発行事業者', limit: 5 });
      expect(result.mode).toBe('fulltext');
      // 頻出語でも1法令で枠を使い切らず、limit どおり複数の法令が返る
      expect(result.results.length).toBe(5);
      expect(new Set(result.results.map(r => r.lawId)).size).toBe(5);
      expect(result.results[0].snippet).toBeTruthy();
    }, 15000);
  });
});
