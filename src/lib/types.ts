/** e-Gov API v2 のレスポンス型 */

export interface EgovLawSearchResult {
  law_info: {
    law_id: string;
    law_type: string;
    law_num: string;
    promulgation_date: string;
  };
  revision_info?: {
    law_title: string;
    law_title_kana?: string;
    abbrev?: string;
  };
  current_revision_info?: {
    law_title: string;
    law_title_kana?: string;
    abbrev?: string;
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

/** 裁決事例（KFS）の型 */

export interface KfsTaxType {
  /** 税目名（例: "所得税法関係"） */
  name: string;
  /** 件数 */
  caseCount: number;
  /** トピックページパス（例: "/service/MP/02/index.html"） */
  topicPath: string;
}

export interface KfsTopicCategory {
  /** カテゴリ名 */
  name: string;
  /** サブカテゴリ（件数付き） */
  items: { name: string; count: number; href: string }[];
}

export interface KfsCaseEntry {
  /** 事例集番号 */
  collectionNo: number;
  /** 税目（例: "所得税法関係"） */
  taxType: string;
  /** カテゴリ（例: "（譲渡所得　取得費の意義、範囲）"） */
  category: string;
  /** 要旨テキスト */
  summary: string;
  /** 裁決日（例: "令和7年4月11日"） */
  date: string;
  /** 裁決事例ページURL */
  caseUrl: string;
  /** 要旨ページURL */
  youshiUrl?: string;
}

export interface KfsCaseFullText {
  /** 裁決全文テキスト */
  body: string;
  /** 裁決日 */
  date: string;
  /** ソースURL */
  url: string;
}
