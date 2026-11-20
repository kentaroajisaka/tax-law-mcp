import { describe, it, expect } from 'vitest';
import {
  getLawArticle,
  formatVersionNote,
  validateAsof,
} from '../../../src/lib/services/law-service.js';

describe('版の指定（asof）と後の改正の注記', () => {
  it('asof の形式を確かめる', () => {
    expect(() => validateAsof('2027-01-01')).not.toThrow();
    expect(() => validateAsof(undefined)).not.toThrow();
    expect(() => validateAsof('令和9年1月1日')).toThrow(/YYYY-MM-DD/);
    expect(() => validateAsof('2027/01/01')).toThrow(/YYYY-MM-DD/);
  });

  it('条が変わる改正があれば施行日と改正法を示す', () => {
    const note = formatVersionNote(
      { revisionId: 'x', enforcementDate: '2026-10-01', scheduled: false, status: 'CurrentEnforced' },
      {
        later: [
          { revisionId: 'a', enforcementDate: '2026-12-01', scheduled: false, changed: true,
            amendmentLawTitle: '所得税法等の一部を改正する法律', amendmentLawNum: '令和八年法律第十二号' },
          { revisionId: 'b', enforcementDate: '2027-04-01', scheduled: true, changed: false },
        ],
        unchecked: 0,
      },
    );
    expect(note).toContain('現行');
    expect(note).toContain('⚠ この版より後の改正でこの条が変わります');
    expect(note).toContain('2026-12-01 施行　所得税法等の一部を改正する法律（令和八年法律第十二号）');
    expect(note).not.toContain('2027-04-01');
    expect(note).toContain('asof="2026-12-01"');
  });

  it('条が変わらなければ警告を出さない', () => {
    const note = formatVersionNote(
      { revisionId: 'x', enforcementDate: '2026-10-01', scheduled: false, status: 'CurrentEnforced' },
      { later: [{ revisionId: 'a', enforcementDate: '2027-01-01', scheduled: false, changed: false }], unchecked: 0 },
    );
    expect(note).toContain('いずれもこの条を変えません');
    expect(note).not.toContain('⚠');
  });

  // 実 API: 所得税法86条（基礎控除）は令和8年改正（未施行）で金額が変わる
  it('所得税法86条：asof を指定すると改正後の版を取得できる', async () => {
    const after = await getLawArticle({ lawName: '所得税法', article: '86', asof: '2027-01-01' });
    expect(after.text).toContain('六十二万円');
    expect(after.version?.asof).toBe('2027-01-01');

    const past = await getLawArticle({ lawName: '所得税法', article: '86', asof: '2020-12-31', checkAmendments: false });
    expect(past.text).toContain('四十八万円');
    expect(past.amendments).toBeUndefined();
  }, 60000);
});
