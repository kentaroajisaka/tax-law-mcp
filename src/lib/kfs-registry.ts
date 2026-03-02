/**
 * KFS（国税不服審判所）の税目レジストリ
 * 公表裁決事例要旨のトピックページマッピング
 */

export interface KfsTaxTypeEntry {
  /** トピックページパス（/service/MP/ からの相対） */
  topicPath: string;
}

/**
 * 13税目 → トピックページのマッピング
 * ソース: https://www.kfs.go.jp/service/MP/index.html
 */
export const KFS_TAX_TYPE_REGISTRY: Record<string, KfsTaxTypeEntry> = {
  '国税通則法関係': { topicPath: '/service/MP/01/index.html' },
  '所得税法関係': { topicPath: '/service/MP/02/index.html' },
  '法人税法関係': { topicPath: '/service/MP/03/index.html' },
  '相続税法関係': { topicPath: '/service/MP/04/index.html' },
  '消費税法関係': { topicPath: '/service/MP/05/index.html' },
  '地価税法関係': { topicPath: '/service/MP/06/index.html' },
  '登録免許税法関係': { topicPath: '/service/MP/07/index.html' },
  '印紙税法関係': { topicPath: '/service/MP/08/index.html' },
  '揮発油税法関係': { topicPath: '/service/MP/09/index.html' },
  '自動車重量税法関係': { topicPath: '/service/MP/10/index.html' },
  '国税徴収法関係': { topicPath: '/service/MP/11/index.html' },
  '租税特別措置法関係': { topicPath: '/service/MP/12/index.html' },
  'たばこ税法関係': { topicPath: '/service/MP/13/index.html' },
};

/**
 * エイリアス → 正式名
 */
export const KFS_TAX_TYPE_ALIAS: Record<string, string> = {
  '通則法': '国税通則法関係',
  '国税通則法': '国税通則法関係',
  '所得税': '所得税法関係',
  '所得税法': '所得税法関係',
  '法人税': '法人税法関係',
  '法人税法': '法人税法関係',
  '相続税': '相続税法関係',
  '相続税法': '相続税法関係',
  '贈与税': '相続税法関係',
  '消費税': '消費税法関係',
  '消費税法': '消費税法関係',
  '地価税': '地価税法関係',
  '地価税法': '地価税法関係',
  '登録免許税': '登録免許税法関係',
  '登録免許税法': '登録免許税法関係',
  '印紙税': '印紙税法関係',
  '印紙税法': '印紙税法関係',
  '揮発油税': '揮発油税法関係',
  '揮発油税法': '揮発油税法関係',
  '自動車重量税': '自動車重量税法関係',
  '自動車重量税法': '自動車重量税法関係',
  '徴収法': '国税徴収法関係',
  '国税徴収法': '国税徴収法関係',
  '措置法': '租税特別措置法関係',
  '租税特別措置法': '租税特別措置法関係',
  'たばこ税': 'たばこ税法関係',
  'たばこ税法': 'たばこ税法関係',
};

/**
 * 税目名を解決（正式名 or エイリアス → レジストリエントリ）
 */
export function resolveKfsTaxType(
  input: string
): { name: string; entry: KfsTaxTypeEntry | null } {
  // 正式名で検索
  if (KFS_TAX_TYPE_REGISTRY[input]) {
    return { name: input, entry: KFS_TAX_TYPE_REGISTRY[input] };
  }

  // エイリアスで検索
  const resolved = KFS_TAX_TYPE_ALIAS[input];
  if (resolved && KFS_TAX_TYPE_REGISTRY[resolved]) {
    return { name: resolved, entry: KFS_TAX_TYPE_REGISTRY[resolved] };
  }

  // 部分一致（「所得税法」→「所得税法関係」）
  for (const name of Object.keys(KFS_TAX_TYPE_REGISTRY)) {
    if (name.includes(input) || input.includes(name.replace('関係', ''))) {
      return { name, entry: KFS_TAX_TYPE_REGISTRY[name] };
    }
  }

  return { name: input, entry: null };
}

/**
 * 対応税目の一覧を返す
 */
export function listKfsTaxTypes(): string[] {
  return Object.keys(KFS_TAX_TYPE_REGISTRY);
}
