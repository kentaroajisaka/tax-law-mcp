import { describe, it, expect } from 'vitest';
import {
  LAW_ID_MAP,
  LAW_ALIAS_MAP,
  resolveLawName,
} from '../../src/lib/law-registry.js';

describe('LAW_ID_MAP', () => {
  it('実特法 (Act on Special Measures for Implementation of Tax Treaties) is mapped', () => {
    expect(
      LAW_ID_MAP['租税条約等の実施に伴う所得税法、法人税法及び地方税法の特例等に関する法律'],
    ).toBe('344AC0000000046');
  });

  it('実特法施行令 (Cabinet Order) is mapped', () => {
    expect(
      LAW_ID_MAP[
        '租税条約等の実施に伴う所得税法、法人税法及び地方税法の特例等に関する法律施行令'
      ],
    ).toBe('362CO0000000335');
  });

  it('復興財源確保法 (Reconstruction Financial Resources Securing Act) is mapped', () => {
    expect(
      LAW_ID_MAP[
        '東日本大震災からの復興のための施策を実施するために必要な財源の確保に関する特別措置法'
      ],
    ).toBe('423AC0000000117');
  });

  it('existing tax-law mappings are unchanged', () => {
    expect(LAW_ID_MAP['所得税法']).toBe('340AC0000000033');
    expect(LAW_ID_MAP['法人税法']).toBe('340AC0000000034');
    expect(LAW_ID_MAP['租税特別措置法']).toBe('332AC0000000026');
    expect(LAW_ID_MAP['所得税法施行令']).toBe('340CO0000000096');
  });
});

describe('LAW_ALIAS_MAP', () => {
  it('実特法 alias resolves to the full name', () => {
    expect(LAW_ALIAS_MAP['実特法']).toBe(
      '租税条約等の実施に伴う所得税法、法人税法及び地方税法の特例等に関する法律',
    );
  });

  it('実施特例法 and 租税条約実施特例法 also resolve to the same full name', () => {
    const target =
      '租税条約等の実施に伴う所得税法、法人税法及び地方税法の特例等に関する法律';
    expect(LAW_ALIAS_MAP['実施特例法']).toBe(target);
    expect(LAW_ALIAS_MAP['租税条約実施特例法']).toBe(target);
  });

  it('実特令 / 実特法施行令 aliases resolve to the Cabinet Order full name', () => {
    const target =
      '租税条約等の実施に伴う所得税法、法人税法及び地方税法の特例等に関する法律施行令';
    expect(LAW_ALIAS_MAP['実特令']).toBe(target);
    expect(LAW_ALIAS_MAP['実特法施行令']).toBe(target);
  });

  it('復興財源確保法 alias resolves to the full name', () => {
    expect(LAW_ALIAS_MAP['復興財源確保法']).toBe(
      '東日本大震災からの復興のための施策を実施するために必要な財源の確保に関する特別措置法',
    );
  });
});

describe('resolveLawName', () => {
  it('resolves 実特法 to law_id 344AC0000000046', () => {
    const { name, lawId } = resolveLawName('実特法');
    expect(name).toBe(
      '租税条約等の実施に伴う所得税法、法人税法及び地方税法の特例等に関する法律',
    );
    expect(lawId).toBe('344AC0000000046');
  });

  it('resolves 実特法施行令 to law_id 362CO0000000335', () => {
    const { lawId } = resolveLawName('実特法施行令');
    expect(lawId).toBe('362CO0000000335');
  });

  it('resolves 復興財源確保法 to law_id 423AC0000000117', () => {
    const { lawId } = resolveLawName('復興財源確保法');
    expect(lawId).toBe('423AC0000000117');
  });

  it('returns lawId=null for unknown names (no silent fallback at registry level)', () => {
    const { lawId } = resolveLawName('存在しない架空の法律');
    expect(lawId).toBeNull();
  });

  it('still resolves existing entries (regression check)', () => {
    expect(resolveLawName('所法').lawId).toBe('340AC0000000033');
    expect(resolveLawName('措法').lawId).toBe('332AC0000000026');
  });
});
