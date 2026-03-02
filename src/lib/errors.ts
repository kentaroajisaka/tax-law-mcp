/**
 * 共通エラークラス
 * REST API と MCP ツールの両方で使用
 */

export class NotFoundError extends Error {
  readonly status = 404;
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class UnsupportedError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedError';
  }
}

export class ExternalApiError extends Error {
  readonly status = 502;
  constructor(message: string) {
    super(message);
    this.name = 'ExternalApiError';
  }
}
