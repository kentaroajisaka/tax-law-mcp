/**
 * シンプルなインメモリTTLキャッシュ
 * ryoooo版の3層キャッシュ戦略を参考にしたが、軽量に実装
 */

interface CacheEntry<T> {
  value: T;
  expires: number;
}

export class TTLCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private readonly defaultTtlMs: number;

  constructor(defaultTtlMs: number) {
    this.defaultTtlMs = defaultTtlMs;
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expires) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T, ttlMs?: number): void {
    this.cache.set(key, {
      value,
      expires: Date.now() + (ttlMs ?? this.defaultTtlMs),
    });
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

// キャッシュインスタンス（セッション中共有）
/** 法令全文キャッシュ: TTL 1時間 */
export const lawDataCache = new TTLCache<string>(60 * 60 * 1000);

/** 法令検索結果キャッシュ: TTL 30分 */
export const lawSearchCache = new TTLCache<string>(30 * 60 * 1000);

/** 通達TOCキャッシュ: TTL 24時間 */
export const tsutatsuTocCache = new TTLCache<string>(24 * 60 * 60 * 1000);

/** 通達ページキャッシュ: TTL 1時間 */
export const tsutatsuPageCache = new TTLCache<string>(60 * 60 * 1000);

/** KFSトピックページキャッシュ: TTL 24時間 */
export const kfsTopicCache = new TTLCache<string>(24 * 60 * 60 * 1000);

/** KFS個別ページキャッシュ: TTL 1時間 */
export const kfsPageCache = new TTLCache<string>(60 * 60 * 1000);
