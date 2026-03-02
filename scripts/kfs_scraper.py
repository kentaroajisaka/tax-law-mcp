"""
国税不服審判所 公表裁決事例 スクレイピングスクリプト
=======================================================
対象: https://www.kfs.go.jp/service/JP/

使い方:
  # 全件取得（時間がかかります）
  python kfs_scraper.py

  # 特定の裁決事例集のみ取得（例: No.138, No.139）
  python kfs_scraper.py --numbers 138 139

  # 最新5件の裁決事例集のみ取得
  python kfs_scraper.py --latest 5

出力: kfs_cases.csv（裁決事例一覧）
"""

import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin
import csv
import time
import argparse
import os
from datetime import datetime

BASE_URL = "https://www.kfs.go.jp"
INDEX_URL = f"{BASE_URL}/service/JP/index.html"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; research-bot/1.0)"
}
SLEEP_SEC = 1.0  # サーバー負荷軽減のため1秒待機


def fetch(url, encoding="shift_jis"):
    """URLを取得してBeautifulSoupで返す"""
    try:
        resp = requests.get(url, headers=HEADERS, timeout=15)
        resp.encoding = encoding
        return BeautifulSoup(resp.text, "html.parser")
    except Exception as e:
        print(f"  [ERROR] {url}: {e}")
        return None


def get_collection_list():
    """
    一覧ページから裁決事例集の番号とURLを取得
    戻り値: [(no: int, url: str, label: str), ...]
    """
    soup = fetch(INDEX_URL)
    if not soup:
        return []

    collections = []
    # テーブル内のリンクから idx/XX.html を抽出
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if href.startswith("idx/") and href.endswith(".html"):
            no_str = href.replace("idx/", "").replace(".html", "")
            try:
                no = int(no_str)
                full_url = f"{BASE_URL}/service/JP/{href}"
                label = a.get_text(strip=True)
                collections.append((no, full_url, label))
            except ValueError:
                pass

    # 重複除去・ソート
    seen = set()
    result = []
    for item in collections:
        if item[0] not in seen:
            seen.add(item[0])
            result.append(item)
    result.sort(key=lambda x: x[0])
    return result


def get_cases_from_collection(no, idx_url):
    """
    裁決事例集の目次ページから各事例のリンクと要旨を取得

    HTML構造:
      <h2><span>所得税法関係</span></h2>
      <h3>（カテゴリ名）</h3>
      <div class="article">
        <p class="article_point">▼ <a href="要旨URL">裁決事例要旨</a> ▼<a href="../139/01/index.html">裁決事例</a></p>
        <p>要旨テキスト...</p>
        <p class="article_date">令和７年４月11日裁決</p>
      </div>
    """
    import re
    soup = fetch(idx_url)
    if not soup:
        return []

    cases = []
    current_tax_type = ""
    current_category = ""

    # h2, h3, div.article を順にたどる
    for elem in soup.find_all(["h2", "h3", "div"]):
        if elem.name == "h2":
            # サイドバーのh2（imgを含む）は無視
            if elem.find("img"):
                continue
            span = elem.find("span")
            if span:
                current_tax_type = span.get_text(strip=True)
            else:
                text = elem.get_text(strip=True)
                if text and "関係" in text:
                    current_tax_type = text

        elif elem.name == "h3":
            current_category = elem.get_text(strip=True)

        elif elem.name == "div" and "article" in (elem.get("class") or []):
            # 裁決事例リンクを抽出
            case_url = ""
            youshi_url = ""
            for a in elem.find_all("a", href=True):
                href = a["href"]
                text = a.get_text(strip=True)
                if text == "裁決事例" and "index.html" in href:
                    case_url = urljoin(idx_url, href)
                elif text == "裁決事例要旨":
                    youshi_url = urljoin(idx_url, href)

            if not case_url:
                continue

            # 要旨テキスト: article_point でも article_date でもない <p>
            summary = ""
            for p in elem.find_all("p"):
                cls = p.get("class") or []
                if "article_point" not in cls and "article_date" not in cls:
                    text = p.get_text(strip=True)
                    if len(text) > 20:
                        summary = text.lstrip("\u3000").lstrip()  # 全角スペース除去
                        break

            # 裁決日
            date = ""
            date_p = elem.find("p", class_="article_date")
            if date_p:
                date = date_p.get_text(strip=True).replace("裁決", "").strip()

            cases.append({
                "collection_no": no,
                "url": case_url,
                "youshi_url": youshi_url,
                "tax_type": current_tax_type,
                "category": current_category,
                "summary": summary[:500],
                "date": date,
            })

    return cases


def get_case_detail(case_url):
    """
    個別裁決事例ページから詳細情報を取得
    戻り値: {"title": ..., "date": ..., "summary": ..., "tax_type": ...}
    """
    soup = fetch(case_url)
    if not soup:
        return {}

    # h1またはh2からタイトル取得
    title = ""
    for tag in soup.find_all(["h1", "h2", "h3"]):
        text = tag.get_text(strip=True)
        if text and len(text) > 10 and "国税不服審判所" not in text:
            title = text
            break

    # ページ全文から裁決日を探す
    full_text = soup.get_text(" ", strip=True)
    date = ""
    import re
    # 例: 「令和7年3月3日裁決」「平成28年9月29日裁決」
    m = re.search(r'(令和|平成|昭和)\d+年\d+月\d+日裁決', full_text)
    if m:
        date = m.group(0).replace("裁決", "")

    # 要旨（最初の段落テキスト）
    summary = ""
    paras = soup.find_all("p")
    for p in paras:
        text = p.get_text(strip=True)
        if len(text) > 30:
            summary = text[:300]
            break

    return {
        "title": title,
        "date": date,
        "summary": summary,
    }


def scrape(target_nos=None, output_file="kfs_cases.csv", with_detail=False):
    """メイン処理（目次ベース。--with-detail で個別ページも取得）"""
    print("=" * 60)
    print("国税不服審判所 裁決事例スクレイピング開始")
    print("=" * 60)

    # 裁決事例集一覧を取得
    print("\n[1] 裁決事例集一覧を取得中...")
    collections = get_collection_list()
    print(f"  → {len(collections)}件の裁決事例集を発見")

    # 対象を絞り込む
    if target_nos:
        collections = [(no, url, label) for no, url, label in collections
                      if no in target_nos]
        print(f"  → 指定された{len(collections)}件に絞り込み")

    # 各事例集の目次から事例URLを収集
    print("\n[2] 各事例集から事例リストを取得中...")
    all_cases = []
    for no, url, label in collections:
        print(f"  No.{no} {label} ...")
        cases = get_cases_from_collection(no, url)
        print(f"    → {len(cases)}件の事例発見")
        all_cases.extend(cases)
        time.sleep(SLEEP_SEC)

    print(f"\n  合計 {len(all_cases)} 件の事例を収集")

    # CSVに保存
    fieldnames = [
        "collection_no", "tax_type", "category", "date",
        "summary", "url", "youshi_url"
    ]
    if with_detail:
        fieldnames.extend(["detail_title", "detail_full_text"])

    print(f"\n[3] CSVに保存: {output_file}")

    with open(output_file, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()

        for i, case in enumerate(all_cases, 1):
            row = {k: case.get(k, "") for k in fieldnames if k in case}

            if with_detail:
                url = case.get("url", "")
                print(f"  [{i}/{len(all_cases)}] {url}")
                detail = get_case_detail(url)
                row["detail_title"] = detail.get("title", "")
                row["detail_full_text"] = detail.get("summary", "")
                time.sleep(SLEEP_SEC)

            writer.writerow(row)

    print(f"\n完了! {output_file} に{len(all_cases)}件保存しました")
    return output_file


def scrape_index_only(target_nos=None, output_file="kfs_index.csv"):
    """
    事例詳細は取得せず、目次レベルの情報のみ高速収集するモード
    """
    print("=" * 60)
    print("国税不服審判所 裁決事例インデックス収集（高速モード）")
    print("=" * 60)

    print("\n[1] 裁決事例集一覧を取得中...")
    collections = get_collection_list()
    print(f"  → {len(collections)}件の裁決事例集を発見")

    if target_nos:
        collections = [(no, url, label) for no, url, label in collections
                      if no in target_nos]

    rows = []
    for no, url, label in collections:
        print(f"  No.{no} ({url})")
        rows.append({
            "collection_no": no,
            "label": label,
            "index_url": url,
        })
        time.sleep(0.5)

    with open(output_file, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["collection_no", "label", "index_url"])
        writer.writeheader()
        writer.writerows(rows)

    print(f"\n完了! {output_file} に{len(rows)}件保存")
    return output_file


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="国税不服審判所 裁決事例スクレイパー")
    parser.add_argument("--numbers", nargs="+", type=int,
                        help="取得する裁決事例集番号 (例: --numbers 138 139)")
    parser.add_argument("--latest", type=int,
                        help="最新N件の裁決事例集のみ取得 (例: --latest 5)")
    parser.add_argument("--index-only", action="store_true",
                        help="事例集一覧のみ収集（最も高速）")
    parser.add_argument("--with-detail", action="store_true",
                        help="個別事例ページも取得（時間がかかる）")
    parser.add_argument("--output", default=None,
                        help="出力CSVファイル名")
    args = parser.parse_args()

    # 対象番号の決定
    target_nos = None
    if args.numbers:
        target_nos = set(args.numbers)
    elif args.latest:
        # 一覧取得して最新N件を選択
        collections = get_collection_list()
        latest = collections[-args.latest:]
        target_nos = {no for no, _, _ in latest}
        print(f"最新{args.latest}件: No.{sorted(target_nos)}")

    if args.index_only:
        output = args.output or "kfs_index.csv"
        scrape_index_only(target_nos, output)
    else:
        output = args.output or "kfs_cases.csv"
        scrape(target_nos, output, with_detail=args.with_detail)
