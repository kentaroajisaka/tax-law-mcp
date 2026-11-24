import { describe, it, expect } from 'vitest';
import {
  parseRevisionAnnotations,
  parseJapaneseDate,
  trimToOwnEntry,
  formatTsutatsuHistory,
} from '../../src/lib/tsutatsu-history.js';
import { getTsutatsu } from '../../src/lib/services/tsutatsu-service.js';

describe('通達の改正注記の読み取り', () => {
  it('所基通の形（「、」区切り・全角混じり）', () => {
    const g = parseRevisionAnnotations(
      '…ものとする。（昭49直所2－23、平11課所4－1、令2課個2－12、課法11－3、課審5－6、令８課個2-8、課法12-7、課審5-3改正）',
    );
    expect(g.map((x) => x.year)).toEqual([1974, 1999, 2020, 2026]);
    expect(g[3].numbers).toEqual(['課個2-8', '課法12-7', '課審5-3']);
    expect(g[2].numbers).toEqual(['課個2-12', '課法11-3', '課審5-6']);
  });

  it('途中の「追加」で新設が分かる', () => {
    const g = parseRevisionAnnotations('（昭63直法6-7、直所3-8追加、令７課個2-10、課法12-5、課審5-10改正）');
    expect(g[0].added).toBe(true);
    expect(g[0].numbers).toEqual(['直法6-7', '直所3-8']);
    expect(g[1].added).toBe(false);
  });

  it('法基通・措通（法人税編）の形（「年」「「十」」「により」）', () => {
    const g = parseRevisionAnnotations(
      '（平29年課法2-17「十」により追加、令元年課法2-10「十一」、令7年課法2-7「六」により改正）',
    );
    expect(g.map((x) => [x.year, x.numbers[0], x.added])).toEqual([
      [2017, '課法2-17', true],
      [2019, '課法2-10', false],
      [2025, '課法2-7', false],
    ]);
  });

  it('評基通の形（「・」区切り・「外」）。番号の形でないもの（昭57直評22）は除く', () => {
    const g = parseRevisionAnnotations('（昭41直資3－19・昭57直評22・平3課評2－4外・平30課評2－49外改正）');
    expect(g.map((x) => x.numbers[0])).toEqual(['直資3-19', '課評2-4', '課評2-49']);
  });

  it('発遣番号を含まないカッコ書きは注記として扱わない', () => {
    expect(parseRevisionAnnotations('（法第33条の規定を改正）')).toEqual([]);
  });

  it('後ろに続く別の通達の注記を切り落とす', () => {
    const body = '本文。（令８課個2-8改正）\n  2－23　削除（昭60直所3－21改正）';
    const g = parseRevisionAnnotations(trimToOwnEntry(body, '2-22'));
    expect(g.map((x) => x.year)).toEqual([2026]);
  });

  it('和暦の日付を読む（全角数字・元年）', () => {
    expect(parseJapaneseDate('（令和８年９月４日）')?.date).toBe('2026-09-04');
    expect(parseJapaneseDate('令和元年6月28日')?.date).toBe('2019-06-28');
  });

  it('注記がなければその旨を書く', () => {
    expect(formatTsutatsuHistory({ groups: [] })).toContain('注記が見当たりません');
  });
});

describe('通達の改正履歴（実サイト）', () => {
  it('所基通78-10：令和8年6月30日の改正で新設、新旧対照表のURLが付く', async () => {
    const r = await getTsutatsu({ tsutatsuName: '所基通', number: '78-10' });
    expect(r.history?.latest?.added).toBe(true);
    expect(r.history?.latestNotice?.date).toBe('2026-06-30');
    const text = formatTsutatsuHistory(r.history!, new Date('2026-11-20'));
    expect(text).toContain('新設：令和8年6月30日');
    expect(text).toMatch(/新旧対照表：https:\/\/www\.nta\.go\.jp\/.+\.pdf/);
  }, 60000);

  it('所基通36-9：最終改正は平成19年、直近の警告は出ない', async () => {
    const r = await getTsutatsu({ tsutatsuName: '所基通', number: '36-9' });
    expect(r.history?.latest?.year).toBe(2007);
    const text = formatTsutatsuHistory(r.history!, new Date('2026-11-20'));
    expect(text).not.toContain('⚠');
  }, 60000);

  it('history=false なら履歴を付けない', async () => {
    const r = await getTsutatsu({ tsutatsuName: '所基通', number: '36-9', history: false });
    expect(r.history).toBeUndefined();
  }, 60000);
});
