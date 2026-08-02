#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
每周热榜 + BGM 数据抓取脚本
由 GitHub Action 每周一 09:00（北京时间）调用，抓取 uapis.cn 免费热榜接口，
生成 data/latest.json 提交回仓库，供静态 PWA 直接读取（同域、无跨域问题）。

免费、无需 Key。若全部平台抓取失败则跳过本次更新，保留旧数据，绝不破坏站点。
"""
import json
import os
import sys
import datetime
import urllib.request

PLATFORMS = {
    "douyin": "douyin",     # 抖音（主战场）
    "rednote": "rednote",   # 小红书（主战场）
    "weibo": "weibo",       # 微博
    "zhihu": "zhihu",       # 知乎
}
API_URL = "https://uapis.cn/api/v1/misc/hotboard?type={}"
UA = {
    "User-Agent": "Mozilla/5.0 (compatible; apt-ops-workbench/1.0)",
    "Origin": "https://userzhz-design.github.io",
}
TOP_N = 30          # 每个平台抓取条数
BGM_NAME_LIMIT = 40 # BGM/话题名字列表上限


def monday_of(d):
    """返回 d 所在周的周一日期"""
    return d - datetime.timedelta(days=d.weekday())


def iso_week_label(d):
    mon = monday_of(d)
    first = datetime.date(mon.year, 1, 1)
    wk = (mon - first).days // 7 + 1
    return "%d年第%d周" % (mon.year, wk)


def week_range_label(d):
    mon = monday_of(d)
    sun = mon + datetime.timedelta(days=6)
    return "%d年%d月%d日 ~ %d年%d月%d日" % (
        mon.year, mon.month, mon.day,
        sun.year, sun.month, sun.day,
    )


def fetch_platform(ptype, retries=2):
    """抓取单个平台热榜，返回 list[dict] 或 None"""
    last_err = None
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(API_URL.format(ptype), headers=UA)
            with urllib.request.urlopen(req, timeout=20) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            items = (data.get("list") or [])[:TOP_N]
            out = []
            for it in items:
                extra = it.get("extra") or {}
                out.append({
                    "index": it.get("index"),
                    "title": (it.get("title") or "").strip(),
                    "url": it.get("url") or "",
                    "hot": it.get("hot_value") or "",
                    "cover": it.get("cover") or extra.get("cover") or "",
                })
            return out
        except Exception as e:  # noqa: BLE001
            last_err = e
            if attempt < retries:
                continue
    print("  [warn] 平台 %s 抓取失败: %s" % (ptype, last_err), file=sys.stderr)
    return None


def build():
    today = datetime.date.today()
    hotspot = {}
    ok = False
    for key, ptype in PLATFORMS.items():
        print("抓取平台: %s ..." % key)
        res = fetch_platform(ptype)
        if res is not None:
            hotspot[key] = res
            ok = True
            print("  -> %d 条" % len(res))
        else:
            hotspot[key] = []

    if not ok:
        print("[skip] 全部平台抓取失败，保留旧数据，跳过本次提交。")
        return False

    # BGM / 话题名字：取抖音 + 小红书热门标题，去重
    names = []
    for k in ("douyin", "rednote"):
        for it in hotspot.get(k, []):
            t = (it.get("title") or "").strip()
            if t:
                names.append(t)
    seen = set()
    dedup = []
    for n in names:
        if n not in seen:
            seen.add(n)
            dedup.append(n)
    names = dedup[:BGM_NAME_LIMIT]

    payload = {
        "week": iso_week_label(today),
        "week_label": week_range_label(today),
        "generated_at": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": "uapis.cn",
        "hotspot": hotspot,
        "bgm": {"names": names},
    }

    os.makedirs("data", exist_ok=True)
    with open("data/latest.json", "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    total = sum(len(v) for v in hotspot.values())
    print("[done] 已写入 data/latest.json：%d 条热榜，%d 个BGM/话题名字" % (total, len(names)))
    return True


if __name__ == "__main__":
    build()
