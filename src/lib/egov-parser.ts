/**
 * e-Gov API v2 のJSONレスポンスを解析して条文テキストを抽出
 *
 * takurot/egov-law-mcp の LawXMLParser を参考に、JSON版として実装:
 * - ルビ(Rt)タグのフィルタリング
 * - 再帰的サブアイテム処理（Subitem{level} の動的対応）
 * - 行蓄積パターン（lines[] + join）
 * - 条文番号の int() フォールバック
 * - 階層的Markdown変換（Part→# / Chapter→## / Section→### / Article→####）
 */

import type { EgovNode, EgovLawData } from './types.js';

// ============================
// 条文番号の正規化
// ============================

/**
 * 条文番号を正規化する
 * "33" → "33", "33の2" → "33_2", "第33条" → "33", "33-2" → "33_2"
 */
export function normalizeNum(input: string | number): string {
  let num = String(input).trim();
  num = num.replace(/^第/, '');
  // "33条の2" のように単位の直後に枝番が続く場合は単位だけを落とす
  num = num.replace(/([条項号])(?=[のノ])/g, '');
  // それ以外は単位以降を切り捨てる ("第33条第2項" → "33")
  num = num.replace(/[条項号].*$/, '');
  num = num.replace(/[のノ]/g, '_');
  num = num.replace(/[-\u{FF0D}\u{30FC}]/gu, '_');
  num = num.replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFF10 + 0x30));
  return num;
}

/** 条文番号の正規化（normalizeNum のエイリアス。後方互換のため残す） */
export function normalizeArticleNum(input: string): string {
  return normalizeNum(input);
}

/** イ/（1）/（ｉ）などのサブアイテム見出しを比較用に正規化 */
function normalizeSubitemLabel(input: string): string {
  return String(input)
    .trim()
    .replace(/[（）()\s.]/g, '')
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .toLowerCase();
}

// ============================
// 公開API
// ============================

/**
 * 法令全文から特定の条文を抽出する
 */
export function extractArticle(
  lawData: EgovLawData,
  articleNum: string,
  paragraph?: number,
  item?: string | number,
  subitem?: string,
): { text: string; articleCaption: string; matchedParagraph?: number } | null {
  const mainProvision = findNode(lawData.law_full_text, 'MainProvision');
  if (!mainProvision) return null;
  return extractArticleFromScope(mainProvision, articleNum, paragraph, item, subitem);
}

/**
 * 任意のスコープ（本則 / 特定の附則ブロック）から条文を抽出する
 */
function extractArticleFromScope(
  scope: EgovNode,
  articleNum: string,
  paragraph?: number,
  item?: string | number,
  subitem?: string,
): { text: string; articleCaption: string; matchedParagraph?: number } | null {
  const normalized = normalizeArticleNum(articleNum);
  const mainProvision = scope;

  // 正規化した番号で検索、見つからなければ int 変換でフォールバック (takurot版参考)
  let article = findArticleNode(mainProvision, normalized);
  if (!article) {
    const intNormalized = String(parseInt(normalized.split('_')[0], 10));
    if (intNormalized !== normalized.split('_')[0]) {
      const fallback = normalized.replace(/^\d+/, intNormalized);
      article = findArticleNode(mainProvision, fallback);
    }
  }
  if (!article) return null;

  const caption = getText(findNode(article, 'ArticleCaption'));
  const lines: string[] = [];

  // subitem は item とセットでしか指定できない
  if (subitem !== undefined && item === undefined) return null;

  let itemNode: EgovNode | null = null;
  let paraNode: EgovNode | null = null;
  let matchedParagraph: number | undefined;
  const subitemPath = subitem !== undefined ? splitSubitemPath(subitem) : null;

  if (paragraph !== undefined) {
    paraNode = findParagraphNode(article, paragraph);
    if (!paraNode) return null;
    if (item !== undefined) {
      itemNode = findItemNode(paraNode, item);
      if (!itemNode) return null;
    }
  } else if (item !== undefined) {
    // 項の指定がなくても全項を走査する。
    // 号番号は項をまたいで重複しうるので、subitem が指定されていれば
    // それが解決できる候補を優先する。
    const candidates = findItemCandidates(article, item);
    if (candidates.length === 0) return null;
    let chosen = candidates[0];
    if (subitemPath) {
      const better = candidates.find((c) => findSubitemNode(c.item, subitemPath) !== null);
      if (better) chosen = better;
    }
    itemNode = chosen.item;
    paraNode = chosen.paragraph;
    matchedParagraph = chosen.paragraphNum;
  }

  if (itemNode && subitemPath) {
    const subNode = findSubitemNode(itemNode, subitemPath);
    if (!subNode) return null;
    parseSubitem(subNode, lines, 0);
  } else if (itemNode) {
    parseItem(itemNode, lines, 0);
  } else if (paraNode) {
    parseParagraph(paraNode, lines);
  } else {
    parseArticle(article, lines);
  }

  return { text: lines.join('\n').trim(), articleCaption: caption, matchedParagraph };
}

/**
 * 法令タイトルを取得する (LawTitleノードから)
 */
export function extractLawTitle(lawData: EgovLawData): string {
  const titleNode = findNode(lawData.law_full_text, 'LawTitle');
  return getText(titleNode);
}

/**
 * 法令全文の目次を取得する (takurot版の parse_toc 相当)
 */
export function extractToc(lawData: EgovLawData): string {
  const mainProvision = findNode(lawData.law_full_text, 'MainProvision');
  if (!mainProvision) return '（MainProvisionが見つかりません）';

  const lines: string[] = [];
  collectToc(mainProvision, lines, 0);
  return lines.join('\n');
}

// ============================
// テキスト抽出 (takurot版の _get_text 相当)
// ============================

/**
 * ノードからテキストだけを再帰的に抽出
 * ルビ(Rt)タグをフィルタリング (takurot版参考)
 */
function getText(node: EgovNode | null): string {
  if (!node) return '';
  if (!node.children) return '';
  const parts: string[] = [];
  for (const child of node.children) {
    if (typeof child === 'string') {
      parts.push(child);
    } else if (child.tag === 'Rt') {
      // ルビ（ふりがな）は除外 (takurot版参考)
      continue;
    } else if (child.tag === 'Ruby') {
      // Ruby要素: Rtを除外してテキストのみ取得
      if (child.children) {
        for (const rc of child.children) {
          if (typeof rc === 'string') {
            parts.push(rc);
          } else if (rc.tag !== 'Rt') {
            parts.push(getText(rc));
          }
        }
      }
    } else {
      parts.push(getText(child));
    }
  }
  return parts.join('');
}

// ============================
// ノード検索
// ============================

function findNode(node: EgovNode, tag: string): EgovNode | null {
  if (node.tag === tag) return node;
  if (!node.children) return null;
  for (const child of node.children) {
    if (typeof child === 'string') continue;
    const found = findNode(child, tag);
    if (found) return found;
  }
  return null;
}

function findArticleNode(node: EgovNode, normalizedNum: string): EgovNode | null {
  if (node.tag === 'Article') {
    const num = node.attr?.Num;
    if (num && normalizeArticleNum(num) === normalizedNum) {
      return node;
    }
  }
  if (!node.children) return null;
  for (const child of node.children) {
    if (typeof child === 'string') continue;
    const found = findArticleNode(child, normalizedNum);
    if (found) return found;
  }
  return null;
}

function findParagraphNode(article: EgovNode, paragraphNum: number): EgovNode | null {
  if (!article.children) return null;
  for (const child of article.children) {
    if (typeof child === 'string') continue;
    if (child.tag === 'Paragraph') {
      const num = child.attr?.Num;
      if (num && parseInt(num, 10) === paragraphNum) return child;
    }
  }
  return null;
}

function findDirectChild(node: EgovNode, tag: string): EgovNode | null {
  if (!node.children) return null;
  for (const child of node.children) {
    if (typeof child === 'string') continue;
    if (child.tag === tag) return child;
  }
  return null;
}

/**
 * 項の直下から号を探す
 * Num（"6", "12_5_2"）と ItemTitle（"六", "十二の五の二"）の両方で照合する
 */
function findItemNode(paragraph: EgovNode, itemNum: string | number): EgovNode | null {
  if (!paragraph.children) return null;
  const target = normalizeNum(itemNum);
  const raw = String(itemNum).trim();
  for (const child of paragraph.children) {
    if (typeof child === 'string') continue;
    if (child.tag !== 'Item') continue;
    const num = child.attr?.Num;
    if (num && normalizeNum(num) === target) return child;
    const title = getText(findDirectChild(child, 'ItemTitle')).trim();
    if (title && (title === raw || normalizeNum(title) === target)) return child;
  }
  return null;
}

/** サブアイテムの指定文字列を階層ごとに分解する（"イ (1) (i)" → ["イ","(1)","(i)"]） */
function splitSubitemPath(subitem: string): string[] {
  return String(subitem)
    .split(/[\s.\-\u{FF0D}\u{30FB},\u{FF0C}/]+/u)
    .filter(Boolean);
}

/**
 * 条の全項を走査して、番号の一致する号をすべて列挙する
 * （号番号は項をまたいで重複しうるため、単一の結果に絞らない）
 */
function findItemCandidates(
  article: EgovNode,
  itemNum: string | number,
): { paragraph: EgovNode; item: EgovNode; paragraphNum: number }[] {
  const out: { paragraph: EgovNode; item: EgovNode; paragraphNum: number }[] = [];
  if (!article.children) return out;
  for (const child of article.children) {
    if (typeof child === 'string') continue;
    if (child.tag !== 'Paragraph') continue;
    const found = findItemNode(child, itemNum);
    if (found) {
      out.push({
        paragraph: child,
        item: found,
        paragraphNum: parseInt(child.attr?.Num ?? '1', 10),
      });
    }
  }
  return out;
}

/**
 * 号の下のサブアイテム（イ → (1) → (i)）を深さ順にたどる
 * 各階層は Num（"1"）と見出し（"イ" "（1）" "（ｉ）"）の両方で照合する
 */
function findSubitemNode(item: EgovNode, path: string[]): EgovNode | null {
  let current: EgovNode = item;
  for (let depth = 1; depth <= path.length; depth++) {
    const tag = `Subitem${depth}`;
    const token = path[depth - 1];
    const targetNum = normalizeNum(token);
    const targetLabel = normalizeSubitemLabel(token);
    let next: EgovNode | null = null;
    for (const child of current.children ?? []) {
      if (typeof child === 'string') continue;
      if (child.tag !== tag) continue;
      const num = child.attr?.Num;
      const label = normalizeSubitemLabel(getText(findDirectChild(child, `${tag}Title`)));
      if ((num && normalizeNum(num) === targetNum) || (label && label === targetLabel)) {
        next = child;
        break;
      }
    }
    if (!next) return null;
    current = next;
  }
  return current;
}

// ============================
// Markdown変換 (takurot版の階層マッピングを参考)
// Part → #, Chapter → ##, Section → ###, Article → ####
// ============================

/** 条文全体をパース */
function parseArticle(article: EgovNode, lines: string[]): void {
  if (!article.children) return;
  for (const child of article.children) {
    if (typeof child === 'string') continue;
    switch (child.tag) {
      case 'ArticleCaption':
        lines.push(`#### ${getText(child)}`);
        break;
      case 'ArticleTitle':
        lines.push(`**${getText(child)}**`);
        lines.push('');
        break;
      case 'Paragraph':
        parseParagraph(child, lines);
        break;
      default:
        // SupplProvisionLabel 等はスキップ
        break;
    }
  }
}

/** 項をパース */
function parseParagraph(para: EgovNode, lines: string[]): void {
  if (!para.children) return;

  let paragraphText = '';
  for (const child of para.children) {
    if (typeof child === 'string') continue;
    switch (child.tag) {
      case 'ParagraphNum':
        paragraphText += getText(child) + ' ';
        break;
      case 'ParagraphSentence':
        paragraphText += getText(child);
        break;
      case 'Item':
        // 項のテキストを先に出力
        if (paragraphText) {
          lines.push(paragraphText.trim());
          paragraphText = '';
        }
        parseItem(child, lines, 1);
        break;
      case 'TableStruct':
        if (paragraphText) {
          lines.push(paragraphText.trim());
          paragraphText = '';
        }
        lines.push('（表省略）');
        break;
      default:
        break;
    }
  }
  if (paragraphText) {
    lines.push(paragraphText.trim());
  }
}

/** 号をパース */
function parseItem(item: EgovNode, lines: string[], indentLevel: number): void {
  if (!item.children) return;
  const indent = '  '.repeat(indentLevel);

  let itemText = indent;
  for (const child of item.children) {
    if (typeof child === 'string') continue;
    switch (child.tag) {
      case 'ItemTitle':
        itemText += getText(child) + ' ';
        break;
      case 'ItemSentence':
        itemText += getText(child);
        break;
      default:
        // Subitem の再帰処理 (takurot版の _parse_subitem(level) 参考)
        if (child.tag.startsWith('Subitem')) {
          if (itemText.trim() !== indent.trim()) {
            lines.push(itemText.trim());
            itemText = indent;
          }
          parseSubitem(child, lines, indentLevel + 1);
        }
        break;
    }
  }
  if (itemText.trim()) {
    lines.push(itemText.trim());
  }
}

/**
 * サブアイテムを再帰的にパース
 * takurot版の _parse_subitem(level) を参考: 動的タグ名で任意の深さに対応
 * Subitem1 → Subitem1Title + Subitem1Sentence → Subitem2 → ...
 */
function parseSubitem(node: EgovNode, lines: string[], indentLevel: number): void {
  if (!node.children) return;
  const indent = '  '.repeat(indentLevel);

  let text = indent;
  for (const child of node.children) {
    if (typeof child === 'string') continue;
    if (child.tag.endsWith('Title')) {
      text += getText(child) + ' ';
    } else if (child.tag.endsWith('Sentence')) {
      text += getText(child);
    } else if (child.tag.startsWith('Subitem')) {
      // さらに深いサブアイテムの再帰
      if (text.trim() !== indent.trim()) {
        lines.push(text.trim());
        text = indent;
      }
      parseSubitem(child, lines, indentLevel + 1);
    }
  }
  if (text.trim()) {
    lines.push(text.trim());
  }
}

// ============================
// 目次収集
// ============================

function collectToc(node: EgovNode, lines: string[], depth: number): void {
  if (!node.children) return;

  for (const child of node.children) {
    if (typeof child === 'string') continue;

    switch (child.tag) {
      case 'Part': {
        const title = findNode(child, 'PartTitle');
        if (title) lines.push(`${'  '.repeat(depth)}# ${getText(title)}`);
        collectToc(child, lines, depth + 1);
        break;
      }
      case 'Chapter': {
        const title = findNode(child, 'ChapterTitle');
        if (title) lines.push(`${'  '.repeat(depth)}## ${getText(title)}`);
        collectToc(child, lines, depth + 1);
        break;
      }
      case 'Section': {
        const title = findNode(child, 'SectionTitle');
        if (title) lines.push(`${'  '.repeat(depth)}### ${getText(title)}`);
        collectToc(child, lines, depth + 1);
        break;
      }
      case 'Subsection': {
        const title = findNode(child, 'SubsectionTitle');
        if (title) lines.push(`${'  '.repeat(depth)}#### ${getText(title)}`);
        collectToc(child, lines, depth + 1);
        break;
      }
      case 'Division': {
        const title = findNode(child, 'DivisionTitle');
        if (title) lines.push(`${'  '.repeat(depth)}${getText(title)}`);
        collectToc(child, lines, depth + 1);
        break;
      }
      case 'Article': {
        const caption = getText(findNode(child, 'ArticleCaption'));
        const title = getText(findNode(child, 'ArticleTitle'));
        const indent = '  '.repeat(depth);
        if (caption || title) {
          lines.push(`${indent}${caption}${title ? ` ${title}` : ''}`);
        }
        break;
      }
      default:
        collectToc(child, lines, depth);
        break;
    }
  }
}

// ============================
// 附則（SupplProvision）
// ============================

/** 法令番号中の漢数字を算用数字に直す（e-Govは "平成二九年六月二日法律第四五号" 形式） */
function kanjiDigitsToArabic(input: string): string {
  const map: Record<string, string> = {
    '〇': '0', '一': '1', '二': '2', '三': '3', '四': '4',
    '五': '5', '六': '6', '七': '7', '八': '8', '九': '9',
  };
  return input.replace(/[〇一二三四五六七八九]/g, (ch) => map[ch] ?? ch);
}

/** 法令番号の比較用トークン（"平成29年" "45号" 等）を取り出す */
function lawNumTokens(input: string): string[] {
  const normalized = kanjiDigitsToArabic(String(input))
    .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFF10 + 0x30));
  const tokens: string[] = [];
  for (const m of normalized.matchAll(/(明治|大正|昭和|平成|令和)\s*(\d+)\s*年/g)) {
    tokens.push(`${m[1]}${parseInt(m[2], 10)}年`);
  }
  for (const m of normalized.matchAll(/第?\s*(\d+)\s*号/g)) {
    tokens.push(`${parseInt(m[1], 10)}号`);
  }
  return tokens;
}

export interface SupplProvisionInfo {
  index: number;
  /** 改正法の法令番号。制定時附則は undefined */
  amendLawNum?: string;
  /** 抄かどうか */
  extract: boolean;
  articleNums: string[];
  paragraphCount: number;
}

/** 法令中のすべての附則ブロックを列挙する */
export function listSupplProvisions(lawData: EgovLawData): SupplProvisionInfo[] {
  const body = findNode(lawData.law_full_text, 'LawBody');
  if (!body?.children) return [];
  const out: SupplProvisionInfo[] = [];
  let index = 0;
  for (const child of body.children) {
    if (typeof child === 'string') continue;
    if (child.tag !== 'SupplProvision') continue;
    const articles: EgovNode[] = [];
    collectByTag(child, 'Article', articles);
    const paragraphs: EgovNode[] = [];
    collectByTag(child, 'Paragraph', paragraphs);
    out.push({
      index: index++,
      amendLawNum: child.attr?.AmendLawNum,
      extract: child.attr?.Extract === 'true',
      articleNums: articles.map((a) => (a.attr?.Num ?? '').replace(/_/g, 'の')),
      paragraphCount: paragraphs.length,
    });
  }
  return out;
}

function collectByTag(node: EgovNode, tag: string, out: EgovNode[]): void {
  if (!node.children) return;
  for (const child of node.children) {
    if (typeof child === 'string') continue;
    if (child.tag === tag) out.push(child);
    collectByTag(child, tag, out);
  }
}

/**
 * 附則ブロックを特定する
 * query 省略 / "制定" / true → 改正法番号を持たない制定時附則
 * それ以外 → 改正法番号での絞り込み（"平成29年法律第45号" のような表記でよい）
 */
export function findSupplProvision(
  lawData: EgovLawData,
  query?: string | boolean,
): { node: EgovNode; info: SupplProvisionInfo } | { ambiguous: SupplProvisionInfo[] } | null {
  const body = findNode(lawData.law_full_text, 'LawBody');
  if (!body?.children) return null;
  const nodes: EgovNode[] = [];
  for (const child of body.children) {
    if (typeof child === 'string') continue;
    if (child.tag === 'SupplProvision') nodes.push(child);
  }
  const infos = listSupplProvisions(lawData);
  if (nodes.length === 0) return null;

  const q = typeof query === 'string' ? query.trim() : '';
  if (query === true || q === '' || q === '制定' || q === '制定時' || q === '本則') {
    const idx = infos.findIndex((i) => !i.amendLawNum);
    if (idx < 0) return { ambiguous: infos };
    return { node: nodes[idx], info: infos[idx] };
  }

  const wanted = lawNumTokens(q);
  const matched: number[] = [];
  for (let i = 0; i < infos.length; i++) {
    const amend = infos[i].amendLawNum;
    if (!amend) continue;
    const have = lawNumTokens(amend);
    if (wanted.length > 0 && wanted.every((t) => have.includes(t))) matched.push(i);
  }
  if (matched.length === 0) return null;
  if (matched.length > 1) return { ambiguous: matched.map((i) => infos[i]) };
  return { node: nodes[matched[0]], info: infos[matched[0]] };
}

/** 附則ブロック全体をテキスト化する */
export function parseSupplProvisionBlock(node: EgovNode): string {
  const lines: string[] = [];
  if (!node.children) return '';
  for (const child of node.children) {
    if (typeof child === 'string') continue;
    switch (child.tag) {
      case 'SupplProvisionLabel':
        break;
      case 'Article':
        parseArticle(child, lines);
        lines.push('');
        break;
      case 'Paragraph':
        parseParagraph(child, lines);
        break;
      default:
        break;
    }
  }
  return lines.join('\n').trim();
}

/** 附則から条文を抽出する */
export function extractSupplArticle(
  supplNode: EgovNode,
  articleNum?: string,
  paragraph?: number,
  item?: string | number,
  subitem?: string,
): { text: string; articleCaption: string; matchedParagraph?: number } | null {
  if (!articleNum) {
    const text = parseSupplProvisionBlock(supplNode);
    return text ? { text, articleCaption: '' } : null;
  }
  return extractArticleFromScope(supplNode, articleNum, paragraph, item, subitem);
}
