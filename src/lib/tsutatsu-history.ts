/**
 * 通達の改正履歴
 *
 * 国税庁の通達ページには現行の本文しか載っていないが、各通達の末尾に
 * 「（昭49直所2－23、…、令８課個2-8、課法12-7、課審5-3改正）」のような注記があり、
 * どの改正通達（発遣番号）で直ったかが分かる。
 * これを、通達ごとの「一部改正通達」一覧（日付つき）と、その個別ページ
 * （発遣番号・趣旨・新旧対照表）に突き合わせて、最終改正の日付と新旧対照表を示す。
 */

import { tsutatsuTocCache } from './cache.js';

const NTA_BASE = 'https://www.nta.go.jp';

/** 注記から読んだ1回分の改正（同じ元号年の発遣番号のまとまり） */
export interface AnnotationGroup {
  /** 元号（昭・平・令） */
  era: string;
  /** 元号の年（元年は1） */
  eraYear: number;
  /** 西暦年 */
  year: number;
  /** 発遣番号（正規化済み。例: "課個2-8"） */
  numbers: string[];
  /** 「追加」（新設）か */
  added: boolean;
}

/** 一部改正通達の一覧の1件 */
export interface KaiseiIndexEntry {
  url: string;
  title: string;
  /** YYYY-MM-DD。読めなければ undefined */
  date?: string;
  /** 表示用の日付（和暦） */
  dateText?: string;
}

/** 一部改正通達の個別ページ */
export interface KaiseiNotice {
  url: string;
  numbers: string[];
  purpose?: string;
  /** 適用時期の文（「…以後に…適用する」など） */
  application?: string;
  pdfs: { url: string; title: string }[];
}

export interface TsutatsuHistory {
  /** 注記から読んだ改正（古い順） */
  groups: AnnotationGroup[];
  /** 最終改正（注記の最後のまとまり） */
  latest?: AnnotationGroup;
  /** 最終改正に当たる改正通達（突き合わせできたとき） */
  latestNotice?: KaiseiIndexEntry & Partial<KaiseiNotice>;
  /** この通達集の一部改正通達のうち最新のもの */
  newestInIndex?: KaiseiIndexEntry;
  /** 一覧ページの URL */
  indexUrl?: string;
  error?: string;
}

const ERA_BASE: Record<string, number> = { 明: 1867, 大: 1911, 昭: 1925, 平: 1988, 令: 2018 };
const ERA_FULL: Record<string, string> = { 昭: '昭和', 平: '平成', 令: '令和', 大: '大正', 明: '明治' };

/** 全角数字・ダッシュ類を半角にそろえる */
export function normalizeWidth(s: string): string {
  return s
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[－‐−―ー‑–—]/g, '-')
    .replace(/[\s　]/g, '');
}

/** 発遣番号の形（課個2-8、直所3-1、課法12-7、徴管6-12、査調14-7 など） */
const NUMBER_RE = /^([課直徴査官][^\d-]{0,4})(\d+)-(\d+)$/;

/**
 * 本文から改正注記を探して、改正のまとまりに分ける。
 * 注記は「（…改正）」「（…追加）」の形で、中に発遣番号が並ぶ。
 */
export function parseRevisionAnnotations(body: string): AnnotationGroup[] {
  const groups: AnnotationGroup[] = [];
  const re = /[（(]([^（）()]{3,1500}?)(改正|追加)[）)]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const inner = normalizeWidth(m[1]);
    // 発遣番号を1つも含まないカッコ書き（「（…を改正）」のような本文）は除く
    if (!/[課直徴査]\D{0,4}\d+-\d+/.test(inner)) continue;
    const isAddedAtEnd = m[2] === '追加';
    let current: AnnotationGroup | null = null;
    const parsed: AnnotationGroup[] = [];
    // 区切りは「、」（所基通・措通）と「・」（評基通）。
    // 法基通・消基通は「平19年課法2－3「二十二」…により改正」、評基通は「平3課評2－4外」の形
    for (const rawTok of inner.split(/[、,，・]/)) {
      let tok = rawTok.replace(/「[^」]*」/g, '');
      let added = false;
      if (tok.endsWith('追加')) {
        added = true;
        tok = tok.slice(0, -2);
      }
      if (tok.endsWith('改正')) tok = tok.slice(0, -2);
      tok = tok.replace(/により$/, '').replace(/外$/, '');
      const eraM = tok.match(/^(昭|平|令|大|明)(元|\d{1,2})年?(.*)$/);
      if (eraM) {
        const eraYear = eraM[2] === '元' ? 1 : Number(eraM[2]);
        current = {
          era: eraM[1],
          eraYear,
          year: ERA_BASE[eraM[1]] + eraYear,
          numbers: [],
          added: false,
        };
        parsed.push(current);
        tok = eraM[3];
      }
      if (!current) continue;
      if (NUMBER_RE.test(tok)) current.numbers.push(tok);
      if (added) current.added = true;
    }
    if (parsed.length === 0) continue;
    // 「…追加）」で終わる注記は、最後のまとまりが新設
    if (isAddedAtEnd) parsed[parsed.length - 1].added = true;
    groups.push(...parsed.filter((g) => g.numbers.length > 0));
  }
  // 同じ改正が二重に読まれたもの（本文中の別の注記など）を除き、古い順に並べる
  const seen = new Set<string>();
  const uniq = groups.filter((g) => {
    const k = `${g.year}|${g.numbers.join(',')}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return uniq.sort((a, b) => a.year - b.year);
}

/** 「令和8年6月30日」「令和８年９月４日」「平成30年7月2日」「令和元年…」を YYYY-MM-DD に */
export function parseJapaneseDate(text: string): { date: string; dateText: string } | undefined {
  const t = normalizeWidth(text);
  const m = t.match(/(昭和|平成|令和)(元|\d{1,2})年(\d{1,2})月(\d{1,2})日/);
  if (!m) return undefined;
  const era = m[1].charAt(0);
  const y = ERA_BASE[era] + (m[2] === '元' ? 1 : Number(m[2]));
  const date = `${y}-${m[3].padStart(2, '0')}-${m[4].padStart(2, '0')}`;
  return { date, dateText: `${m[1]}${m[2]}年${m[3]}月${m[4]}日` };
}

async function fetchNtaText(pathOrUrl: string): Promise<string> {
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${NTA_BASE}${pathOrUrl}`;
  if (new URL(url).hostname !== 'www.nta.go.jp') {
    throw new Error(`NTA 以外の URL です: ${url}`);
  }
  const cached = tsutatsuTocCache.get(`hist|${url}`);
  if (cached) return cached;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`NTAページ取得エラー: ${res.status} (${url})`);
  const buf = await res.arrayBuffer();
  let html: string;
  try {
    html = new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    html = new TextDecoder('shift_jis').decode(buf);
  }
  tsutatsuTocCache.set(`hist|${url}`, html);
  return html;
}

function resolveHref(href: string, baseUrl: string): string {
  return new URL(href, baseUrl).toString();
}

function stripTags(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&emsp;|&ensp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/[ \t　]+/g, ' ');
}

/** 一部改正通達の一覧ページを読む */
export async function fetchKaiseiIndex(kaiseiPath: string): Promise<KaiseiIndexEntry[]> {
  const indexUrl = `${NTA_BASE}${kaiseiPath}`;
  const html = await fetchNtaText(indexUrl);
  const dir = kaiseiPath.replace(/[^/]+$/, '');
  const entries: KaiseiIndexEntry[] = [];
  const re = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const href = m[1];
    const title = stripTags(m[2]).replace(/\s+/g, ' ').trim();
    if (!/改正/.test(title)) continue;
    const url = resolveHref(href, indexUrl);
    // 一覧のあるディレクトリ配下（または同じ通達の kaisei 配下）の個別ページだけ
    if (!new URL(url).pathname.includes('/kaisei/') && !new URL(url).pathname.startsWith(dir)) continue;
    if (url === indexUrl) continue;
    const d = parseJapaneseDate(title);
    entries.push({ url, title, date: d?.date, dateText: d?.dateText });
  }
  return entries;
}

/** 一部改正通達の個別ページを読む（発遣番号・趣旨・適用時期・PDF） */
export async function fetchKaiseiNotice(url: string): Promise<KaiseiNotice> {
  const html = await fetchNtaText(url);
  const text = stripTags(html);
  const flat = normalizeWidth(text);
  // 発遣番号は宛名（「殿」）より前に並ぶ
  const headEnd = flat.indexOf('殿');
  const head = headEnd > 0 ? flat.slice(0, headEnd) : flat.slice(0, 600);
  const numbers = Array.from(
    new Set((head.match(/[課直徴査][^\d\-、。]{0,4}\d+-\d+/g) ?? []).filter((n) => NUMBER_RE.test(n))),
  );

  const oneLine = text.replace(/\s+/g, ' ');
  const purposeM = oneLine.match(/[（(]趣旨[）)]\s*(.{5,300}?。)/);
  // 「…平成31年1月1日以後に…適用する」の、日付から「適用…」までを取る（前置きの宛名・標題は入れない）
  const applyM = oneLine.match(/([^。、」\s]{0,40}以後[^。]{0,150}?適用[^。、]{0,30})/);

  const pdfs: { url: string; title: string }[] = [];
  const re = /<a[^>]+href="([^"]+\.pdf)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    pdfs.push({ url: resolveHref(m[1], url), title: stripTags(m[2]).replace(/\s+/g, ' ').trim() });
  }
  return {
    url,
    numbers,
    purpose: purposeM?.[1].trim(),
    application: applyM?.[1].trim(),
    pdfs,
  };
}

/** 一覧から、注記のまとまりに当たる改正通達を探す */
async function matchGroup(
  group: AnnotationGroup,
  index: KaiseiIndexEntry[],
): Promise<(KaiseiIndexEntry & Partial<KaiseiNotice>) | undefined> {
  const sameYear = index.filter((e) => e.date && Number(e.date.slice(0, 4)) === group.year);
  const nearYear = index.filter(
    (e) => e.date && Math.abs(Number(e.date.slice(0, 4)) - group.year) === 1,
  );
  const want = new Set(group.numbers);
  for (const cand of [...sameYear, ...nearYear].slice(0, 8)) {
    try {
      const notice = await fetchKaiseiNotice(cand.url);
      if (notice.numbers.some((n) => want.has(n))) {
        return { ...cand, ...notice };
      }
    } catch {
      // 取れないページは飛ばす
    }
  }
  return undefined;
}

/**
 * 本文の後ろに続く別の通達（「2－23 削除（…改正）」など）を切り落とす。
 * 行頭に通達番号の形が現れ、それが求めた番号と違えば、そこから先は別の通達。
 */
export function trimToOwnEntry(body: string, number?: string): string {
  if (!number) return body;
  const own = normalizeWidth(number).replace(/条/g, '');
  const re = /\n[ \t\u3000]*([0-9０-９]+(?:の[0-9０-９]+)*(?:[－\-‐−・共][0-9０-９]+(?:の[0-9０-９]+)*)+)[ \t\u3000]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    if (m.index < 10) continue;
    if (normalizeWidth(m[1]) !== own) return body.slice(0, m.index);
  }
  return body;
}

/** 通達本文の注記から改正履歴を組み立てる */
export async function buildTsutatsuHistory(
  body: string,
  kaiseiPath: string | undefined,
  number?: string,
): Promise<TsutatsuHistory> {
  const groups = parseRevisionAnnotations(trimToOwnEntry(body, number));
  const latest = groups.length > 0 ? groups[groups.length - 1] : undefined;
  const history: TsutatsuHistory = { groups, latest };
  if (!kaiseiPath) return history;

  history.indexUrl = `${NTA_BASE}${kaiseiPath}`;
  try {
    const index = await fetchKaiseiIndex(kaiseiPath);
    history.newestInIndex = index
      .filter((e) => e.date)
      .sort((a, b) => (a.date! < b.date! ? 1 : -1))[0];
    if (latest) history.latestNotice = await matchGroup(latest, index);
  } catch (e) {
    history.error = `一部改正通達の一覧を読めませんでした（${e instanceof Error ? e.message : String(e)}）`;
  }
  return history;
}

function groupLabel(g: AnnotationGroup): string {
  const y = g.eraYear === 1 ? '元' : String(g.eraYear);
  return `${ERA_FULL[g.era] ?? g.era}${y}年（${g.numbers.join('・')}）`;
}

/** 直近の改正とみなす期間（日） */
const RECENT_DAYS = 730;

/** 改正履歴を、通達本文の後ろに付ける文章にする */
export function formatTsutatsuHistory(h: TsutatsuHistory, now: Date = new Date()): string {
  const lines: string[] = [];
  if (!h.latest) {
    lines.push('【改正履歴】本文に改正の注記が見当たりません（制定時のままか、注記を読み取れない書式です）。');
  } else {
    lines.push('【改正履歴】（本文末尾の注記と国税庁の一部改正通達から）');
    const n = h.latestNotice;
    const kind = h.latest.added ? '新設' : '最終改正';
    if (n) {
      lines.push(`- ${kind}：${n.dateText ?? groupLabel(h.latest)}　${n.title.replace(/[（(][^（）()]*年[^（）()]*日[）)]\s*$/, '')}（${h.latest.numbers.join('・')}）`);
      if (n.purpose) lines.push(`  趣旨：${n.purpose}`);
      if (n.application) lines.push(`  適用：${n.application}`);
      const table = n.pdfs?.find((p) => /新旧/.test(p.title)) ?? n.pdfs?.[0];
      if (table) lines.push(`  ${/新旧/.test(table.title) ? '新旧対照表' : '資料'}：${table.url}`);
      lines.push(`  改正通達：${n.url}`);
    } else {
      lines.push(`- ${kind}：${groupLabel(h.latest)}（一部改正通達の一覧で該当を特定できませんでした）`);
    }
    const earlier = h.groups.slice(0, -1);
    if (earlier.length > 0) {
      const shown = earlier.slice(-6).reverse().map(groupLabel);
      const more = earlier.length > 6 ? ` ほか${earlier.length - 6}回` : '';
      lines.push(`- それ以前：${shown.join('、')}${more}`);
    }
    const first = h.groups[0];
    if (first?.added && first !== h.latest) lines.push(`- 新設：${groupLabel(first)}`);

    const latestDate = n?.date ? new Date(n.date) : new Date(`${h.latest.year}-12-31`);
    const days = (now.getTime() - latestDate.getTime()) / 86400000;
    if (days <= RECENT_DAYS && !h.latest.added) {
      lines.push(
        '⚠ 直近に改正されています。過年分・改正前の事実に当てはめるときは、改正前の取扱いを新旧対照表で確かめ、改正通達の適用時期も見てください。',
      );
    } else if (days <= RECENT_DAYS && h.latest.added) {
      lines.push('⚠ 直近に新設された通達です。新設前の年分・事業年度には当たらないことがあります。適用時期を確かめてください。');
    }
  }
  if (h.newestInIndex && h.newestInIndex.url !== h.latestNotice?.url) {
    lines.push(
      `（参考）この通達集の最新の一部改正：${h.newestInIndex.dateText ?? h.newestInIndex.date}　${h.newestInIndex.url}` +
        '　※国税庁の本文への反映が遅れている間は、上の注記にまだ出ません',
    );
  }
  if (h.error) lines.push(`（注）${h.error}`);
  return lines.join('\n');
}
