/**
 * 統合テスト: 全17通達の実NTAサイト取得検証
 *
 * NTAサイトへの負荷軽減のため、sequential実行 + 各テスト30秒タイムアウト
 */
import { describe, it, expect } from 'vitest';
import { resolveTsutatsuName, TSUTATSU_REGISTRY } from '../../src/lib/tsutatsu-registry.js';
import { fetchTsutatsuToc, fetchNtaPage, getNtaUrl } from '../../src/lib/tsutatsu-client.js';
import { parseTocLinks, findPageForNumber, extractTsutatsuEntry, getCandidatePages } from '../../src/lib/tsutatsu-parser.js';

/**
 * 通達を実際に取得するヘルパー（get-tsutatsu.ts のフォールバックロジックを完全再現）
 */
async function fetchTsutatsu(tsutatsuName: string, number: string) {
  const { name, entry } = resolveTsutatsuName(tsutatsuName);
  if (!entry) throw new Error(`通達 "${tsutatsuName}" はレジストリに存在しません`);

  const tocHtml = await fetchTsutatsuToc(entry.tocPath, entry.encoding);
  const tocLinks = parseTocLinks(tocHtml, entry.tocFormat, entry.tocPath);

  if (tocLinks.length === 0) {
    throw new Error(`${name}: TOCリンクが0件（パーサーが合っていない可能性）`);
  }

  // Step 1: TOCからページ特定
  const pageHref = findPageForNumber(tocLinks, number);
  let tsutatsuEntry: import('../../src/lib/types.js').TsutatsuEntry | null = null;

  if (pageHref) {
    const pageHtml = await fetchNtaPage(pageHref, entry.encoding);
    const pageUrl = getNtaUrl(pageHref);
    tsutatsuEntry = extractTsutatsuEntry(pageHtml, number, pageUrl);

    // フォールバック: 前後ページも検索
    if (!tsutatsuEntry) {
      const currentIdx = tocLinks.findIndex(l => l.href === pageHref);
      if (currentIdx !== -1) {
        const start = Math.max(0, currentIdx - 2);
        const end = Math.min(tocLinks.length, currentIdx + 3);
        for (let i = start; i < end; i++) {
          if (tocLinks[i].href === pageHref) continue;
          try {
            const html = await fetchNtaPage(tocLinks[i].href, entry.encoding);
            const url = getNtaUrl(tocLinks[i].href);
            tsutatsuEntry = extractTsutatsuEntry(html, number, url);
            if (tsutatsuEntry) break;
          } catch { /* skip */ }
        }
      }
    }
  }

  // Step 2: getCandidatePages フォールバック
  if (!tsutatsuEntry) {
    const candidates = getCandidatePages(tocLinks, number);
    for (const candidateHref of candidates) {
      if (candidateHref === pageHref) continue;
      try {
        const html = await fetchNtaPage(candidateHref, entry.encoding);
        const url = getNtaUrl(candidateHref);
        tsutatsuEntry = extractTsutatsuEntry(html, number, url);
        if (tsutatsuEntry) break;
      } catch { /* skip */ }
    }
  }

  return { name, tocLinks, entry: tsutatsuEntry, error: tsutatsuEntry ? null : `エントリが見つからない: ${number}` };
}

// NTA負荷軽減のため sequential実行
describe.sequential('全通達の実NTA取得テスト', () => {

  // --- 既存の基本通達6つ ---

  it('所得税基本通達 33-6（借家人が受ける立退料）', async () => {
    const result = await fetchTsutatsu('所得税基本通達', '33-6');
    expect(result.error).toBeNull();
    expect(result.entry).not.toBeNull();
    expect(result.entry!.number).toBe('33-6');
    expect(result.entry!.body).toContain('借家人');
  }, 30000);

  it('法人税基本通達 2-1-1', async () => {
    const result = await fetchTsutatsu('法人税基本通達', '2-1-1');
    expect(result.error).toBeNull();
    expect(result.entry).not.toBeNull();
    expect(result.entry!.number).toBe('2-1-1');
  }, 30000);

  it('消費税法基本通達 5-1-1', async () => {
    const result = await fetchTsutatsu('消費税法基本通達', '5-1-1');
    expect(result.error).toBeNull();
    expect(result.entry).not.toBeNull();
    expect(result.entry!.number).toBe('5-1-1');
  }, 30000);

  it('相続税法基本通達 11の2-1', async () => {
    const result = await fetchTsutatsu('相続税法基本通達', '11の2-1');
    expect(result.error).toBeNull();
    expect(result.entry).not.toBeNull();
  }, 30000);

  it('財産評価基本通達 1', async () => {
    const result = await fetchTsutatsu('財産評価基本通達', '1');
    expect(result.error).toBeNull();
    expect(result.entry).not.toBeNull();
  }, 30000);

  it('連結納税基本通達 — TOC取得成功', async () => {
    // 連結納税基本通達はTOCが節ベース（第X節）でarticlePrefixが取れないため
    // 特定エントリの検索はfindPageForNumberでは困難（既存の制約）。TOC取得のみ検証。
    const { entry } = resolveTsutatsuName('連結納税基本通達');
    expect(entry).not.toBeNull();
    const tocHtml = await fetchTsutatsuToc(entry!.tocPath, entry!.encoding);
    const tocLinks = parseTocLinks(tocHtml, entry!.tocFormat, entry!.tocPath);
    expect(tocLinks.length).toBeGreaterThan(0);
  }, 30000);

  // --- 措置法通達（Priority 1） ---

  it('措置法通達（山林所得・譲渡所得関係）33-8（対価補償金の区分）★重要', async () => {
    const result = await fetchTsutatsu('措置法通達（山林所得・譲渡所得関係）', '33-8');
    expect(result.error).toBeNull();
    expect(result.entry).not.toBeNull();
    expect(result.entry!.number).toBe('33-8');
    // このテスト追加のきっかけとなった通達
    expect(result.entry!.body).toContain('補償金');
  }, 30000);

  it('措置法通達（山林所得・譲渡所得関係）33-9（補償金の課税上の取扱い）★重要', async () => {
    const result = await fetchTsutatsu('措通（譲渡）', '33-9');
    expect(result.error).toBeNull();
    expect(result.entry).not.toBeNull();
    expect(result.entry!.number).toBe('33-9');
  }, 30000);

  it('措置法通達（申告所得税関係）10-1', async () => {
    const result = await fetchTsutatsu('措通（申告）', '10-1');
    expect(result.error).toBeNull();
    expect(result.entry).not.toBeNull();
    expect(result.entry!.number).toBe('10-1');
  }, 30000);

  it('措置法通達（法人税編）— TOC取得成功', async () => {
    // 法人税編はsochiho-article形式（kihonと同じパーサー）
    const { entry } = resolveTsutatsuName('措通（法人税）');
    expect(entry).not.toBeNull();
    const tocHtml = await fetchTsutatsuToc(entry!.tocPath, entry!.encoding);
    const tocLinks = parseTocLinks(tocHtml, entry!.tocFormat, entry!.tocPath);
    expect(tocLinks.length).toBeGreaterThan(0);
  }, 30000);

  it('措置法通達（相続税関係）69の4-1', async () => {
    const result = await fetchTsutatsu('措通（相続税）', '69の4-1');
    expect(result.error).toBeNull();
    expect(result.entry).not.toBeNull();
  }, 30000);

  // --- 基本通達（Priority 2） ---

  it('国税通則法基本通達 — TOC取得成功', async () => {
    const { entry } = resolveTsutatsuName('通法基通');
    expect(entry).not.toBeNull();
    const tocHtml = await fetchTsutatsuToc(entry!.tocPath, entry!.encoding);
    const tocLinks = parseTocLinks(tocHtml, entry!.tocFormat, entry!.tocPath);
    expect(tocLinks.length).toBeGreaterThan(0);
  }, 30000);

  it('印紙税法基本通達 — TOC取得成功', async () => {
    const { entry } = resolveTsutatsuName('印基通');
    expect(entry).not.toBeNull();
    const tocHtml = await fetchTsutatsuToc(entry!.tocPath, entry!.encoding);
    const tocLinks = parseTocLinks(tocHtml, entry!.tocFormat, entry!.tocPath);
    expect(tocLinks.length).toBeGreaterThan(0);
  }, 30000);

  it('税理士法基本通達 — TOC取得成功', async () => {
    const { entry } = resolveTsutatsuName('税理士通達');
    expect(entry).not.toBeNull();
    const tocHtml = await fetchTsutatsuToc(entry!.tocPath, entry!.encoding);
    const tocLinks = parseTocLinks(tocHtml, entry!.tocFormat, entry!.tocPath);
    expect(tocLinks.length).toBeGreaterThan(0);
  }, 30000);

  // --- Priority 3 ---

  it('措置法通達（源泉所得税関係）— TOC取得成功', async () => {
    const { entry } = resolveTsutatsuName('措通（源泉）');
    expect(entry).not.toBeNull();
    const tocHtml = await fetchTsutatsuToc(entry!.tocPath, entry!.encoding);
    const tocLinks = parseTocLinks(tocHtml, entry!.tocFormat, entry!.tocPath);
    expect(tocLinks.length).toBeGreaterThan(0);
  }, 30000);

  it('措置法通達（株式等譲渡所得等関係）— TOC取得成功', async () => {
    const { entry } = resolveTsutatsuName('措通（株式）');
    expect(entry).not.toBeNull();
    const tocHtml = await fetchTsutatsuToc(entry!.tocPath, entry!.encoding);
    const tocLinks = parseTocLinks(tocHtml, entry!.tocFormat, entry!.tocPath);
    expect(tocLinks.length).toBeGreaterThan(0);
  }, 30000);

  it('国税徴収法基本通達 — TOC取得成功', async () => {
    const { entry } = resolveTsutatsuName('徴基通');
    expect(entry).not.toBeNull();
    const tocHtml = await fetchTsutatsuToc(entry!.tocPath, entry!.encoding);
    const tocLinks = parseTocLinks(tocHtml, entry!.tocFormat, entry!.tocPath);
    expect(tocLinks.length).toBeGreaterThan(0);
  }, 30000);

  it('酒税法基本通達 — TOC取得成功', async () => {
    const { entry } = resolveTsutatsuName('酒基通');
    expect(entry).not.toBeNull();
    const tocHtml = await fetchTsutatsuToc(entry!.tocPath, entry!.encoding);
    const tocLinks = parseTocLinks(tocHtml, entry!.tocFormat, entry!.tocPath);
    expect(tocLinks.length).toBeGreaterThan(0);
  }, 30000);

  // --- エイリアス経由のアクセス検証 ---

  it('エイリアス「措通（譲渡）」で措置法通達（山林所得・譲渡所得関係）にアクセスできる', async () => {
    const result = await fetchTsutatsu('措通（譲渡）', '33-1');
    expect(result.error).toBeNull();
    expect(result.entry).not.toBeNull();
  }, 30000);
});
