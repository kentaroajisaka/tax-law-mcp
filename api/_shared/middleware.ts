/**
 * REST API 共通ミドルウェア
 * CORS, GETのみ許可, レート制限, エラーハンドリング
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { NotFoundError, ValidationError, UnsupportedError, ExternalApiError } from '../../src/lib/errors.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
} as const;

// シンプルなインメモリレート制限（Vercelインスタンス単位）
const requestCounts = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 30;         // 1分あたり30リクエスト
const RATE_WINDOW_MS = 60_000; // 1分

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = requestCounts.get(ip);
  if (!entry || now > entry.resetAt) {
    requestCounts.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  entry.count++;
  return entry.count <= RATE_LIMIT;
}

type Handler = (req: VercelRequest, res: VercelResponse) => Promise<void | VercelResponse>;

export function withMiddleware(handler: Handler) {
  return async (req: VercelRequest, res: VercelResponse) => {
    // CORS ヘッダー
    for (const [k, v] of Object.entries(CORS_HEADERS)) {
      res.setHeader(k, v);
    }

    // プリフライト
    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }

    // GET のみ許可
    if (req.method !== 'GET') {
      return res.status(405).json({
        error: { code: 'METHOD_NOT_ALLOWED', message: 'Only GET is allowed' },
      });
    }

    // レート制限
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || 'unknown';
    if (!checkRateLimit(ip)) {
      return res.status(429).json({
        error: { code: 'RATE_LIMITED', message: 'Too many requests. Please wait and try again.' },
      });
    }

    // ハンドラ実行
    try {
      await handler(req, res);
    } catch (error) {
      if (error instanceof ValidationError || error instanceof UnsupportedError) {
        return res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: error.message },
        });
      }
      if (error instanceof NotFoundError) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: error.message },
        });
      }
      if (error instanceof ExternalApiError) {
        return res.status(502).json({
          error: { code: 'EXTERNAL_API_ERROR', message: error.message },
        });
      }
      return res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
      });
    }
  };
}

/** クエリパラメータを string として取得（配列の場合は先頭要素） */
export function queryString(val: string | string[] | undefined): string | undefined {
  if (Array.isArray(val)) return val[0];
  return val;
}

/** クエリパラメータを number として取得 */
export function queryNumber(val: string | string[] | undefined): number | undefined {
  const s = queryString(val);
  if (s == null) return undefined;
  const n = Number(s);
  return isNaN(n) ? undefined : n;
}
