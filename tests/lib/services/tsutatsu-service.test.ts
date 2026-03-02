import { describe, it, expect } from 'vitest';
import { getTsutatsu, listTsutatsuToc } from '../../../src/lib/services/tsutatsu-service.js';
import { NotFoundError, UnsupportedError } from '../../../src/lib/errors.js';

describe('tsutatsu-service', () => {
  describe('getTsutatsu', () => {
    it('所得税基本通達33-1を取得できる', async () => {
      const result = await getTsutatsu({ tsutatsuName: '所基通', number: '33-1' });
      expect(result.tsutatsuName).toContain('所得税基本通達');
      expect(result.entry.number).toBe('33-1');
      expect(result.entry.body).toBeTruthy();
      expect(result.entry.url).toContain('nta.go.jp');
    }, 30000);

    it('対応していない通達名でUnsupportedError', async () => {
      await expect(
        getTsutatsu({ tsutatsuName: '存在しない通達', number: '1-1' })
      ).rejects.toThrow(UnsupportedError);
    });
  });

  describe('listTsutatsuToc', () => {
    it('所得税基本通達の目次を取得できる', async () => {
      const result = await listTsutatsuToc({ tsutatsuName: '所基通' });
      expect(result.tsutatsuName).toContain('所得税基本通達');
      expect(result.tocText).toBeTruthy();
      expect(result.tocUrl).toContain('nta.go.jp');
    }, 15000);

    it('セクション絞り込みが動作する', async () => {
      const result = await listTsutatsuToc({ tsutatsuName: '所基通', section: '第33条' });
      expect(result.tocText).toContain('33');
    }, 15000);

    it('対応していない通達名でUnsupportedError', async () => {
      await expect(
        listTsutatsuToc({ tsutatsuName: '存在しない通達' })
      ).rejects.toThrow(UnsupportedError);
    });
  });
});
