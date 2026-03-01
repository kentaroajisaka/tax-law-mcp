/** e-Gov API v2 のレスポンス型 */

export interface EgovLawSearchResult {
  law_info: {
    law_id: string;
    law_type: string;
    law_num: string;
    law_title: string;
    promulgation_date: string;
    amendment_law_id?: string;
    amendment_promulgation_date?: string;
  };
}

export interface EgovLawData {
  law_info: {
    law_id: string;
    law_type: string;
    law_num: string;
    law_num_era?: string;
    law_num_year?: number;
    law_num_type?: string;
    law_num_num?: string;
    promulgation_date: string;
  };
  law_full_text: EgovNode;
}

export interface EgovNode {
  tag: string;
  attr?: Record<string, string>;
  children?: (EgovNode | string)[];
}

/** 通達レジストリの型 */

export interface TsutatsuRegistryEntry {
  /** TOC（目次）ページのパス */
  tocPath: string;
  /** エンコーディング */
  encoding: 'shift_jis' | 'utf-8';
  /** 基本URL */
  baseUrl: string;
  /** TOCのHTML形式ヒント。省略時は 'kihon' */
  tocFormat?: 'kihon' | 'sochiho-li' | 'sochiho-p' | 'sochiho-article';
}

/** 通達の解析結果 */

export interface TsutatsuEntry {
  /** 通達番号 (e.g. "33-6") */
  number: string;
  /** 見出し (e.g. "収用等の場合の対価補償金等の区分") */
  caption: string;
  /** 本文テキスト */
  body: string;
  /** ソースURL */
  url: string;
}

/** TOCリンクの解析結果 */

export interface TsutatsuTocLink {
  /** リンクテキスト */
  text: string;
  /** ページURL（相対パス、フラグメントなし） */
  href: string;
  /** フラグメント付きURL（#a-33-1 等） */
  fullHref?: string;
  /** 対応する条文番号プレフィックス（推測） */
  articlePrefix?: string;
  /** TOCから直接取得した通達番号（例: "33-1", "69の4-1"） */
  tsutatsuNumber?: string;
}
