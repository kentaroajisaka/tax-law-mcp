/**
 * 通達名 → TOCページURL のマッピング
 * NTAサイトの構造を手動マッピング
 */

import type { TsutatsuRegistryEntry } from './types.js';

export const TSUTATSU_REGISTRY: Record<string, TsutatsuRegistryEntry> = {
  '所得税基本通達': {
    tocPath: '/law/tsutatsu/kihon/shotoku/01.htm',
    encoding: 'shift_jis',
    baseUrl: 'https://www.nta.go.jp',
  },
  '法人税基本通達': {
    tocPath: '/law/tsutatsu/kihon/hojin/01.htm',
    encoding: 'shift_jis',
    baseUrl: 'https://www.nta.go.jp',
  },
  '消費税法基本通達': {
    tocPath: '/law/tsutatsu/kihon/shohi/01.htm',
    encoding: 'shift_jis',
    baseUrl: 'https://www.nta.go.jp',
  },
  '相続税法基本通達': {
    tocPath: '/law/tsutatsu/kihon/sisan/sozoku2/01.htm',
    encoding: 'shift_jis',
    baseUrl: 'https://www.nta.go.jp',
  },
  '財産評価基本通達': {
    tocPath: '/law/tsutatsu/kihon/sisan/hyoka_new/01.htm',
    encoding: 'shift_jis',
    baseUrl: 'https://www.nta.go.jp',
  },
  '連結納税基本通達': {
    tocPath: '/law/tsutatsu/kihon/renketsu/01.htm',
    encoding: 'shift_jis',
    baseUrl: 'https://www.nta.go.jp',
  },

  // --- 措置法通達（Priority 1） ---
  '措置法通達（山林所得・譲渡所得関係）': {
    tocPath: '/law/tsutatsu/kobetsu/shotoku/sochiho/710826/sanrin/sanjyou/01.htm',
    encoding: 'shift_jis',
    baseUrl: 'https://www.nta.go.jp',
    tocFormat: 'sochiho-li',
  },
  '措置法通達（申告所得税関係）': {
    tocPath: '/law/tsutatsu/kobetsu/shotoku/sochiho/801226/sinkoku/01.htm',
    encoding: 'shift_jis',
    baseUrl: 'https://www.nta.go.jp',
    tocFormat: 'sochiho-p',
  },
  '措置法通達（法人税編）': {
    tocPath: '/law/tsutatsu/kobetsu/hojin/sochiho/750214/01.htm',
    encoding: 'shift_jis',
    baseUrl: 'https://www.nta.go.jp',
    tocFormat: 'sochiho-article',
  },
  '措置法通達（相続税関係）': {
    tocPath: '/law/tsutatsu/kobetsu/sozoku/sochiho/080708/01.htm',
    encoding: 'shift_jis',
    baseUrl: 'https://www.nta.go.jp',
    tocFormat: 'sochiho-p',
  },

  // --- 基本通達（Priority 2） ---
  '国税通則法基本通達': {
    tocPath: '/law/tsutatsu/kihon/tsusoku/00.htm',
    encoding: 'shift_jis',
    baseUrl: 'https://www.nta.go.jp',
  },
  '印紙税法基本通達': {
    tocPath: '/law/tsutatsu/kihon/inshi/mokuji.htm',
    encoding: 'shift_jis',
    baseUrl: 'https://www.nta.go.jp',
  },
  '税理士法基本通達': {
    tocPath: '/law/tsutatsu/kihon/zeirishi/01.htm',
    encoding: 'shift_jis',
    baseUrl: 'https://www.nta.go.jp',
  },

  // --- 措置法通達・基本通達（Priority 3） ---
  '措置法通達（源泉所得税関係）': {
    tocPath: '/law/tsutatsu/kobetsu/shotoku/sochiho/880331/gensen/58/01.htm',
    encoding: 'shift_jis',
    baseUrl: 'https://www.nta.go.jp',
    tocFormat: 'sochiho-p',
  },
  '措置法通達（株式等譲渡所得等関係）': {
    tocPath: '/law/tsutatsu/kobetsu/shotoku/sochiho/020624/sanrin/01.htm',
    encoding: 'shift_jis',
    baseUrl: 'https://www.nta.go.jp',
    tocFormat: 'sochiho-li',
  },
  '国税徴収法基本通達': {
    tocPath: '/law/tsutatsu/kihon/chosyu/index.htm',
    encoding: 'shift_jis',
    baseUrl: 'https://www.nta.go.jp',
  },
  '酒税法基本通達': {
    tocPath: '/law/tsutatsu/kihon/sake/01.htm',
    encoding: 'shift_jis',
    baseUrl: 'https://www.nta.go.jp',
  },
};

/** 通達略称 → 正式名称 */
export const TSUTATSU_ALIAS: Record<string, string> = {
  '所基通': '所得税基本通達',
  '法基通': '法人税基本通達',
  '消基通': '消費税法基本通達',
  '相基通': '相続税法基本通達',
  '評基通': '財産評価基本通達',
  '所得税通達': '所得税基本通達',
  '法人税通達': '法人税基本通達',
  '消費税通達': '消費税法基本通達',
  '相続税通達': '相続税法基本通達',
  '財産評価通達': '財産評価基本通達',

  // 措置法通達エイリアス
  '措通（譲渡）': '措置法通達（山林所得・譲渡所得関係）',
  '措置法通達（譲渡）': '措置法通達（山林所得・譲渡所得関係）',
  '措置法通達（譲渡所得）': '措置法通達（山林所得・譲渡所得関係）',
  '措通（申告）': '措置法通達（申告所得税関係）',
  '措置法通達（申告）': '措置法通達（申告所得税関係）',
  '措置法通達（所得税）': '措置法通達（申告所得税関係）',
  '措通（法人税）': '措置法通達（法人税編）',
  '措置法通達（法人税）': '措置法通達（法人税編）',
  '措通（相続税）': '措置法通達（相続税関係）',
  '措置法通達（相続税）': '措置法通達（相続税関係）',
  '措通（源泉）': '措置法通達（源泉所得税関係）',
  '措置法通達（源泉）': '措置法通達（源泉所得税関係）',
  '措通（株式）': '措置法通達（株式等譲渡所得等関係）',
  '措置法通達（株式）': '措置法通達（株式等譲渡所得等関係）',

  // 基本通達エイリアス
  '通法基通': '国税通則法基本通達',
  '通則法通達': '国税通則法基本通達',
  '印基通': '印紙税法基本通達',
  '印紙通達': '印紙税法基本通達',
  '税理士通達': '税理士法基本通達',
  '徴基通': '国税徴収法基本通達',
  '徴収法通達': '国税徴収法基本通達',
  '酒基通': '酒税法基本通達',
};

/**
 * 通達名を正規化し、レジストリエントリを返す
 */
export function resolveTsutatsuName(input: string): {
  name: string;
  entry: TsutatsuRegistryEntry | null;
} {
  const alias = TSUTATSU_ALIAS[input];
  const name = alias ?? input;
  const entry = TSUTATSU_REGISTRY[name] ?? null;
  return { name, entry };
}

/**
 * 対応通達名の一覧
 */
export function listSupportedTsutatsu(): string[] {
  return Object.keys(TSUTATSU_REGISTRY);
}
