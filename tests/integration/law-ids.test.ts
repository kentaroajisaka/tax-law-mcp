import { describe, it, expect } from 'vitest';
import { LAW_ID_MAP } from '../../src/lib/law-registry.js';

/**
 * LAW_ID_MAP に登録した law_id が e-Gov に実在するかを全件確認する。
 * 元号コードの取り違え（平成=4xx を昭和=3xx と書く等）を機械的に検出するためのもの。
 */
describe('LAW_ID_MAP の law_id 実在確認', () => {
  const entries = Object.entries(LAW_ID_MAP);

  it.each(entries)('%s (%s) が e-Gov に存在する', async (lawName, lawId) => {
    const res = await fetch(`https://laws.e-gov.go.jp/api/2/law_data/${lawId}`, {
      headers: { Accept: 'application/json' },
    });
    expect(res.status, `${lawName} の law_id "${lawId}" が e-Gov で見つかりません`).toBe(200);

    const json = await res.json();
    const title: string = json?.revision_info?.law_title ?? '';
    expect(title, `${lawName} の law_id "${lawId}" が空のタイトルを返しました`).toBeTruthy();
  }, 20000);
});
