/**
 * KFS（国税不服審判所）サイトからページを取得するクライアント
 * Shift_JIS → UTF-8 変換対応
 */

import { kfsTopicCache, kfsPageCache } from './cache.js';

const KFS_BASE = 'https://www.kfs.go.jp';
const FETCH_TIMEOUT_MS = 15_000;

/**
 * タイムアウト付きでページを取得しShift_JISデコード
 * AbortControllerはbody読み取り完了まで有効
 */
async function fetchAndDecode(url: string, timeoutMs: number = FETCH_TIMEOUT_MS): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`KFSページ取得エラー: ${res.status} ${res.statusText} (${url})`);
    }
    const buf = await res.arrayBuffer();
    return new TextDecoder('shift_jis').decode(buf);
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error(`タイムアウト（${timeoutMs / 1000}秒）: ${url}`);
    }
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * KFSページを取得（Shift_JIS → UTF-8）
 * 個別事例ページ、idx目次ページ等に使用
 */
export async function fetchKfsPage(path: string): Promise<string> {
  const url = path.startsWith('http') ? path : `${KFS_BASE}${path}`;

  const cached = kfsPageCache.get(url);
  if (cached) return cached;

  const html = await fetchAndDecode(url);
  kfsPageCache.set(url, html);
  return html;
}

/**
 * KFSトピックページを取得（長めのキャッシュ）
 * MP系の税目一覧・カテゴリページに使用
 */
export async function fetchKfsTopicPage(path: string): Promise<string> {
  const url = path.startsWith('http') ? path : `${KFS_BASE}${path}`;

  const cached = kfsTopicCache.get(url);
  if (cached) return cached;

  const html = await fetchAndDecode(url);
  kfsTopicCache.set(url, html);
  return html;
}

/**
 * KFSページの完全URLを生成
 */
export function getKfsUrl(path: string): string {
  if (path.startsWith('http')) return path;
  return `${KFS_BASE}${path}`;
}
