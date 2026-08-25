#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
每周热榜 + BGM + 爆款拆解 + 选题日历 + 竞品监控 + 学习计划 数据生成脚本
由 GitHub Action 定时调用：
  - 每周一 09:00 北京时间：热榜 + BGM + 爆款拆解 + 选题日历 + 竞品监控
  - 每月1号 09:00 北京时间：学习计划（月度更新）

数据源：
  1. uapis.cn 免费热榜接口（无需 Key）
  2. DeepSeek API（需环境变量 DEEPSEEK_API_KEY，从 GitHub Secret 注入）

若 DeepSeek Key 未配置或调用失败，对应模块跳过不破坏已有数据。
若全部平台热榜抓取失败，整体跳过。
"""
import json
import os
import sys
import datetime
import urllib.request
import urllib.error

# ── 配置 ──────────────────────────────────────────────
PLATFORMS = {
    "douyin": "douyin",
    "rednote": "rednote",
    "weibo": "weibo",
    "zhihu": "zhihu",
}
API_URL = "https://uapis.cn/api/v1/misc/hotboard?type={}"
UA = {
    "User-Agent": "Mozilla/5.0 (compatible; apt-ops-workbench/2.0)",
    "Origin": "https://userzhz-design.github.io",
}
TOP_N = 30
BGM_NAME_LIMIT = 40
DEEPSEEK_API = "https://api.deepseek.com/v1/chat/completions"
DEEPSEEK_MODEL = "deepseek-chat"

# 竞品列表（固定，用于竞品监控 prompt）
COMPETITORS = [
    {"name": "自如租房", "desc": "长租公寓头部品牌，毕业季营销强"},
    {"name": "魔方公寓", "desc": "集中式公寓，社区社交活动多"},
    {"name": "V领地", "desc": "青年公寓，改造类内容出圈"},
    {"name": "城家公寓", "desc": "华润旗下，情侣/家庭向内容多"},
]

# ── 工具函数 ──────────────────────────────────────────


class DeepSeekError(Exception):
    """DeepSeek API 调用失败（区分余额不足 / Key无效 / 限频 / 网络）"""

    def __init__(self, code, kind, message):
        super().__init__(message)
        self.code = code
        self.kind = kind
        self.message = message


def classify_http_error(code, detail):
    """把 HTTP 状态码映射为友好中文提示 + 类型标记"""
    if code == 402:
        return (
            "DeepSeek 余额不足（HTTP 402），AI 模块本次未能更新。请到 DeepSeek 平台充值后，"
            "到 GitHub 仓库 Actions 重新运行「每周热榜+BGM自动刷新」定时任务。",
            "insufficient_balance",
        )
    if code == 401:
        return (
            "DeepSeek API Key 无效（HTTP 401）。请检查仓库 Settings → Secrets 中的 "
            "DEEPSEEK_API_KEY 是否正确。",
            "auth_fail",
        )
    if code == 429:
        return (
            "DeepSeek 触发限频（HTTP 429），本次 AI 生成被跳过，下一周期会自动重试。",
            "rate_limit",
        )
    return ("DeepSeek 调用失败（HTTP %s）%s" % (code, detail), "api_error")


def monday_of(d):
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


def next_week_days(today):
    """返回下周一到周日的日期标签列表"""
    mon = monday_of(today) + datetime.timedelta(days=7)
    days = []
    names = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]
    for i, n in enumerate(names):
        d = mon + datetime.timedelta(days=i)
        days.append("%s %d/%d" % (n, d.month, d.day))
    return days


def season_context(today):
    """根据月份返回季节+运营节奏提示"""
    m = today.month
    if 6 <= m <= 7:
        return "6-7月毕业季，应届毕业生是核心人群，内容方向：毕业租房、首次独居、宿舍vs公寓对比、搬家攻略"
    elif 8 <= m <= 9:
        return "8-9月换租季+金九银十，内容方向：换租对比、价格变化、保租房新政、通勤优化、情侣合租"
    elif 10 <= m <= 11:
        return "10-11月年末冲刺，内容方向：年终盘点、租房账单、冬日保暖改造、宠物友好、年底续约优惠"
    elif m == 12 or m == 1:
        return "12-1月春节前后，内容方向：新年规划、返乡vs留沪、年后返工租房准备、春节租房避坑"
    elif 2 <= m <= 3:
        return "2-3月春招季，内容方向：春招租房、职场新人指南、预算规划、地铁沿线房源"
    else:  # 4-5
        return "4-5月春夏过渡，内容方向：租房改造、夏日清凉好房、毕业季预热、实习租房"


def fetch_platform(ptype, retries=2):
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
        except Exception as e:
            last_err = e
            if attempt < retries:
                continue
    print("  [warn] 平台 %s 抓取失败: %s" % (ptype, last_err), file=sys.stderr)
    return None


def call_deepseek(system_prompt, user_prompt, retries=2):
    """调用 DeepSeek API，返回文本内容。

    - 未配置 Key：返回 None（视为跳过，非错误）
    - HTTP 401/402/429 等：抛出 DeepSeekError（带类型，供上层提示用户）
    - 网络/未知异常：重试后抛出 DeepSeekError
    """
    key = os.environ.get("DEEPSEEK_API_KEY", "").strip()
    if not key:
        print("  [skip] DEEPSEEK_API_KEY 未配置，跳过 AI 生成", file=sys.stderr)
        return None
    body = json.dumps({
        "model": DEEPSEEK_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.8,
        "max_tokens": 4000,
    }).encode("utf-8")
    headers = {
        "Authorization": "Bearer %s" % key,
        "Content-Type": "application/json",
    }
    last_err = None
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(DEEPSEEK_API, data=body, headers=headers, method="POST")
            with urllib.request.urlopen(req, timeout=60) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            text = data.get("choices", [{}])[0].get("message", {}).get("content", "")
            if text:
                return text.strip()
            # 200 但内容为空：不算错误，直接跳过该模块
            print("  [warn] DeepSeek 返回空内容", file=sys.stderr)
            return None
        except urllib.error.HTTPError as e:
            code = e.code
            detail = ""
            try:
                err_body = json.loads(e.read().decode("utf-8"))
                em = err_body.get("error")
                if isinstance(em, dict):
                    detail = em.get("message", "")
                elif isinstance(em, str):
                    detail = em
                else:
                    detail = err_body.get("message", "")
            except Exception:
                pass
            msg, kind = classify_http_error(code, detail)
            if attempt < retries:
                print("  [retry] DeepSeek HTTP %s: %s（重试 %d）" % (code, msg, attempt + 1), file=sys.stderr)
                continue
            raise DeepSeekError(code, kind, msg)
        except urllib.error.URLError as e:
            last_err = e
            if attempt < retries:
                print("  [retry] DeepSeek 网络异常: %s（重试 %d）" % (e, attempt + 1), file=sys.stderr)
                continue
            raise DeepSeekError(None, "network", "无法连接 DeepSeek API：%s" % e)
        except Exception as e:
            last_err = e
            if attempt < retries:
                continue
            raise DeepSeekError(None, "unknown", "DeepSeek 调用异常：%s" % e)
    raise DeepSeekError(None, "unknown", "DeepSeek 未知错误：%s" % last_err)


def parse_json_from_text(text):
    """尝试从 AI 返回的文本中提取 JSON（处理 markdown 代码块包裹）"""
    if not text:
        return None
    # 去掉可能的 ```json / ``` 包裹
    t = text.strip()
    if t.startswith("```"):
        lines = t.split("\n")
        # 去掉首行 ```json 或 ```
        lines = lines[1:]
        # 去掉末尾 ```
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        t = "\n".join(lines).strip()
    try:
        return json.loads(t)
    except (json.JSONDecodeError, ValueError):
        pass
    return None


# ── 各模块生成函数 ────────────────────────────────────


def generate_analysis(hot_topics_text, today):
    """爆款拆解：基于本周热梗生成 5 条高赞 + 5 条高播放 + 共性归纳"""
    week = iso_week_label(today)
    season = season_context(today)
    system = """你是资深短视频运营分析师，专注长租公寓/租房赛道（抖音+小红书）。
你擅长从热门话题中提炼可复制的爆款视频拆解。

用户会提供本周热门话题列表和当前季节运营背景。
请严格以 JSON 格式输出，不要包含任何其他文字。JSON 结构如下：
{
  "like_winners": [
    {
      "title": "视频标题（带书名号）",
      "likes": "点赞数（如 8,234）",
      "plays": "播放量（如 12.5万播放）",
      "hook": "前3秒钩子台词（直接引用风格）",
      "structure": "内容结构描述（分镜概要）",
      "reason": "爆款原因分析（一句话）",
      "bgm": "推荐BGM名称"
    }
  ],
  "view_winners": [
    { 同上结构 }
  ],
  "summary": {
    "type_dist": "类型分布（如 价格对比型 30% | 情感故事型 25% ...）",
    "duration": "视频时长分布",
    "bgm_preference": "BGM偏好",
    "cover_style": "封面风格",
    "publish_time": "最佳发布时间分布"
  }
}

要求：
- like_winners 5条（点赞破5000的模拟爆款），view_winners 5条（播放破5万的模拟爆款）
- 标题要贴合实际热门话题，看起来像真实抖音/小红书爆款
- hook 要有冲击力，能让人停下滑动
- reason 要点出可复制的运营逻辑"""
    user = """本周热门话题（来自抖音/小红书/微博/知乎热榜）：
%s

当前时间：%s
季节运营背景：%s

请基于以上热门话题，生成租房赛道的爆款视频拆解。""" % (hot_topics_text, week, season)
    text = call_deepseek(system, user)
    if not text:
        return None
    return parse_json_from_text(text)


def generate_calendar(hot_topics_text, today):
    """选题日历：下周 7 天选题规划"""
    week = iso_week_label(today)
    season = season_context(today)
    days = next_week_days(today)
    days_str = "\n".join(["  %d. %s" % (i + 1, d) for i, d in enumerate(days)])
    system = """你是长租公寓新媒体运营策划专家，负责抖音+小红书双平台内容规划。
目标人群：上海应届毕业生、青年白领、情侣租客、上海打工人。
卖点组合参考：A(地铁口+民用水电+押一付一) / B(拎包入住+健身房+社交公区) / C(租金便宜+采光好+可短租)

请严格以 JSON 格式输出，不要包含任何其他文字。JSON 结构如下：
{
  "week_title": "X月第X周选题规划（副标题）",
  "plans": [
    {
      "day": "周一 X/X",
      "title": "选题标题（带书名号，有吸引力）",
      "type": "脚本类型（反差吐槽型/干货攻略型/场景生活型/故事走心型/算账对比型/安全攻略型/改造展示型）",
      "audience": "目标人群",
      "bgm": "BGM建议",
      "time": "发布时间（HH:MM格式）",
      "summary": "详细内容概括（3-5句话，含借势热点、卖点植入、互动设计、转化路径）"
    }
  ]
}

要求：
- plans 恰好 7 条，对应周一到周日
- 每天混搭不同内容类型，避免连续两天同类型
- 标题要有抖音/小红书爆款感（数字+emoji+冲突/悬念/共鸣）
- summary 要具体可执行，不是空话
- 结合当周热门话题借势
- 发布时间参考：工作日 12:00/18:00-20:00，周末 12:00/19:00-21:00"""
    user = """本周热门话题（用于借势参考）：
%s

下周日期：
%s

当前：%s
季节背景：%s

请为下周生成完整的7天选题规划。""" % (hot_topics_text, days_str, week, season)
    text = call_deepseek(system, user)
    if not text:
        return None
    return parse_json_from_text(text)


def generate_competitor(hot_topics_text, today):
    """竞品监控：4 个竞品本周表现分析"""
    week = iso_week_label(today)
    season = season_context(today)
    comp_list = "\n".join(["  - %s（%s）" % (c["name"], c["desc"]) for c in COMPETITORS])
    system = """你是长租公寓行业竞争情报分析师。
你会监控上海本地主要竞品公寓品牌的表现，并给出可操作的运营启示。

请严格以 JSON 格式输出，不要包含任何其他文字。JSON 结构如下：
{
  "competitors": [
    {
      "name": "竞品名称（含emoji前缀）",
      "posts": "本周发布数（如 5条）",
      "max_likes": "最高点赞（如 2.3万）",
      "hot_topic": "本周热门主题",
      "hot_video": {
        "title": "最热视频标题",
        "summary": "视频内容概括（3-4句话）",
        "data": "数据简析（播放·点赞·完播率·评论）"
      }
    }
  ],
  "comment_insights": [
    "1️⃣ 诉求主题 — 描述（如 位置/地铁距离 — 出现频率最高...）"
  ],
  "industry_intel": {
    "tag": "情报来源标签",
    "title": "情报标题",
    "content": "情报内容摘要（2-3句话）"
  },
  "insights": [
    "1️⃣ 对我方的启示（一条具体可执行的建议）"
  ]
}

要求：
- competitors 恰好 4 个（自如租房/魔方公寓/V领地/城家公寓）
- 数据要看起来真实合理（不需要真实爬取，但要有行业可信度）
- insights 要具体可执行，不能空泛
- 结合当前季节和热门话题趋势"""
    user = """监控竞品列表：
%s

当前：%s
季节背景：%s
本周热门话题（用于判断竞品可能借势的方向）：
%s

请生成本周竞品监控报告。""" % (comp_list, week, season, hot_topics_text)
    text = call_deepseek(system, user)
    if not text:
        return None
    return parse_json_from_text(text)


def generate_ref_ideas(hot_topics_text, today):
    """可参考创意：5 个经典创意角度（与本周热梗同区展示，每条含可复制文案）"""
    week = iso_week_label(today)
    season = season_context(today)
    system = """你是长租公寓新媒体内容策划专家，精通抖音+小红书双平台运营。
目标人群：上海应届毕业生、青年白领、情侣租客、上海打工人。
卖点组合参考：A(地铁口+民用水电+押一付一) / B(拎包入住+健身房+社交公区) / C(租金便宜+采光好+可短租)

请严格以 JSON 格式输出，不要包含任何其他文字。JSON 结构如下：
{
  "ideas": [
    {
      "title": "创意话题标题（带#话题标签，6-15字）",
      "platform": "抖音 或 小红书",
      "exposure": "预估曝光量（带单位，如'8200万浏览'或'1.2亿播放'）",
      "tip": "创作要点（2-3句话，说明这个角度为什么好、如何借势、可搭配的视觉/情绪/互动）",
      "captions": [
        {"label": "文案1 · xxx版", "text": "完整文案1（30-80字，含emoji和2-3个#话题）"},
        {"label": "文案2 · xxx版", "text": "完整文案2（30-80字，含emoji和2-3个#话题）"}
      ]
    }
  ]
}

要求：
- ideas 恰好 5 条，每条都是「经典角度」（不追求当周热度，而是经久不衰的内容模板）
- 角度必须多样化：覆盖测评对比、情感共鸣、攻略干货、故事走心、互动投票、改造展示等多种方向
- 每条 captions 必须是 2 条不同风格的完整文案（反差/走心/干货/互动/幽默等不同风格）
- exposure 字段填合理预估（参考近期同类型内容），不要固定数字
- title 必须是 # 话题标签格式（如 #MBTI选房指南）
- 借势当前热点话题（如有），融合季节/人群/卖点"""
    user = """本周热门话题（用于借势参考）：
%s

当前：%s
季节背景：%s

请生成 5 个「经典角度 + 可直接使用」的可参考创意。""" % (hot_topics_text, week, season)
    text = call_deepseek(system, user)
    if not text:
        return None
    data = parse_json_from_text(text)
    if not data or not isinstance(data.get("ideas"), list) or len(data["ideas"]) == 0:
        return None
    # 补全每个 idea 的元信息（前端卡片渲染需要的字段）
    for it in data["ideas"]:
        if "tag" not in it:
            it["tag"] = "👀 可参考创意"
        if "tagClass" not in it:
            it["tagClass"] = "tag-idea"
        if "sources" not in it or not it["sources"]:
            it["sources"] = [
                {"url": "https://www.xiaohongshu.com/explore", "label": "小红书参考"},
                {"url": "https://www.douyin.com/", "label": "抖音参考"}
            ]
    return data


def generate_learning(today):
    """学习计划：月度学习目标和今日打卡目标"""
    m = today.month
    season = season_context(today)
    system = """你是新媒体运营学习规划师，帮助长租公寓运营者制定AI工具学习计划。
涵盖：文案生成(AI写作)、图像生成(AI绘图)、视频创作(AI剪辑)、数据分析(数据工具)四大领域。

请严格以 JSON 格式输出，不要包含任何其他文字。JSON 结构如下：
{
  "month": "X月学习计划",
  "today_goals": [
    {"id": "g1", "text": "今日目标1（具体可执行的任务描述）", "done": false},
    {"id": "g2", "text": "今日目标2", "done": false},
    ...
  ],
  "phases": [
    {
      "week": "第X-Y周",
      "title": "阶段主题",
      "goal": "阶段目标（一句话）",
      "tools": "涉及工具（用 · 分隔）",
      "status": "🟡 进行中 或 ⚪ 待开始",
      "icon": "emoji图标"
    }
  ]
}

要求：
- today_goals 5条，混合不同领域（文案/图像/视频/数据），具体可执行
- phases 4个阶段，覆盖一个月的学习路径
- 工具要是国内可免费/低成本使用的（DeepSeek/豆包/Kimi/即梦AI/剪映/蝉妈妈AI等）
- status 第一个为 🟡 其余 ⚪"""
    user = """当前日期：%d年%d月
季节运营背景：%s
请生成%d月的学习计划。""" % (today.year, today.m, season, m)
    text = call_deepseek(system, user)
    if not text:
        return None
    return parse_json_from_text(text)


# ── 主流程 ────────────────────────────────────────────


def build():
    today = datetime.date.today()
    is_monthly_first = today.day == 1  # 月度第一天触发学习计划更新

    # ═══ Step 1: 抓取热榜（基础数据，必须成功）═══
    hotspot = {}
    ok = False
    for key, ptype in PLATFORMS.items():
        print("[1/4] 抓取热榜: %s ..." % key)
        res = fetch_platform(ptype)
        if res is not None:
            hotspot[key] = res
            ok = True
            print("  -> %d 条" % len(res))
        else:
            hotspot[key] = []

    if not ok:
        print("[skip] 全部热榜平台抓取失败，保留旧数据。")
        return False

    # ═══ Step 2: 构建 BGM 名字列表 ═══
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

    # ═══ Step 3: 构建热梗摘要文本（供 DeepSeek prompt 使用）═══
    hot_texts = []
    for k in ("douyin", "rednote"):
        items = hotspot.get(k, [])[:15]
        if items:
            lines = ["[%s Top10]" % k]
            for it in items[:10]:
                lines.append("  %d. %s (热度:%s)" % (
                    it.get("index", "?"), it.get("title", ""), it.get("hot", "")))
            hot_texts.append("\n".join(lines))
    hot_topics_text = "\n\n".join(hot_texts) if hot_texts else "(暂无热榜数据)"

    # ═══ Step 4: DeepSeek AI 生成各模块 ═══
    analysis_data = None
    calendar_data = None
    competitor_data = None
    learning_data = None
    ref_ideas_data = None

    has_key = bool(os.environ.get("DEEPSEEK_API_KEY", "").strip())

    # 读取旧数据：AI 生成失败时保留已有内容，避免清空模块
    old_data = None
    if os.path.exists("data/latest.json"):
        try:
            with open("data/latest.json", encoding="utf-8") as _f:
                old_data = json.load(_f)
        except Exception:
            old_data = None

    ds_error = None
    if has_key:
        try:
            print("[2/4] AI生成: 爆款拆解 ...")
            analysis_data = generate_analysis(hot_topics_text, today)
            print("  -> %s" % ("成功" if analysis_data else "跳过(空)"))

            print("[3/4] AI生成: 选题日历 ...")
            calendar_data = generate_calendar(hot_topics_text, today)
            print("  -> %s" % ("成功" if calendar_data else "跳过(空)"))

            print("[3/4] AI生成: 竞品监控 ...")
            competitor_data = generate_competitor(hot_topics_text, today)
            print("  -> %s" % ("成功" if competitor_data else "跳过(空)"))

            print("[3/4] AI生成: 可参考创意（5个经典角度）...")
            ref_ideas_data = generate_ref_ideas(hot_topics_text, today)
            print("  -> %s" % ("成功" if ref_ideas_data else "跳过(空)"))

            if is_monthly_first:
                print("[4/4] AI生成: 学习计划（月度更新）...")
                learning_data = generate_learning(today)
                print("  -> %s" % ("成功" if learning_data else "跳过(空)"))
            else:
                print("[4/4] 学习计划: 非月初，跳过（每月1号更新）")
        except DeepSeekError as e:
            ds_error = e
            print("[error] DeepSeek 调用失败: %s" % e, file=sys.stderr)
    else:
        print("[skip] DEEPSEEK_API_KEY 未配置，所有 AI 模块跳过")

    # 失败时保留旧 AI 数据，并标记 stale（前端会提示"数据非最新"）
    ai_stale = False
    if analysis_data is None and old_data and old_data.get("analysis"):
        analysis_data = old_data["analysis"]; ai_stale = True
    if calendar_data is None and old_data and old_data.get("calendar"):
        calendar_data = old_data["calendar"]; ai_stale = True
    if competitor_data is None and old_data and old_data.get("competitor"):
        competitor_data = old_data["competitor"]; ai_stale = True
    if learning_data is None and old_data and old_data.get("learning"):
        learning_data = old_data["learning"]; ai_stale = True
    if ref_ideas_data is None and old_data and old_data.get("ref_ideas"):
        ref_ideas_data = old_data["ref_ideas"]; ai_stale = True

    # 构建 DeepSeek 状态，供前端提示「余额不足 / Key无效」等
    now_iso = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    if not has_key:
        ds_status = {"ok": False, "reason": "no_key",
                     "message": "未配置 DEEPSEEK_API_KEY，AI 模块（爆款拆解/选题日历/竞品监控/学习计划）未更新。手动生成的脚本与热梗不受影响。",
                     "checked_at": now_iso}
    elif ds_error is not None:
        ds_status = {"ok": False, "reason": ds_error.kind, "message": ds_error.message,
                     "code": ds_error.code, "checked_at": now_iso}
    else:
        any_ai = any([analysis_data, calendar_data, competitor_data, learning_data])
        ds_status = {"ok": any_ai, "checked_at": now_iso}
        if not any_ai:
            ds_status["reason"] = "empty"
            ds_status["message"] = "本次 AI 模块未生成内容（可能返回空），请检查后重试。"

    # ═══ Step 5: 组装最终 payload ═══
    payload = {
        "week": iso_week_label(today),
        "week_label": week_range_label(today),
        "generated_at": now_iso,
        "source": "uapis.cn + deepseek",
        "hotspot": hotspot,
        "bgm": {"names": names},
        "deepseek_status": ds_status,
        "ai_stale": ai_stale,
    }

    if analysis_data:
        payload["analysis"] = analysis_data
    if calendar_data:
        payload["calendar"] = calendar_data
    if competitor_data:
        payload["competitor"] = competitor_data
    if learning_data:
        payload["learning"] = learning_data
    if ref_ideas_data:
        payload["ref_ideas"] = ref_ideas_data

    # ═══ Step 6: 写入文件 ═══
    os.makedirs("data", exist_ok=True)
    with open("data/latest.json", "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    total_hot = sum(len(v) for v in hotspot.values())
    parts = ["%d条热榜" % total_hot, "%d个BGM名字" % len(names)]
    if analysis_data:
        parts.append("爆款拆解✅")
    if calendar_data:
        parts.append("选题日历✅")
    if competitor_data:
        parts.append("竞品监控✅")
    if learning_data:
        parts.append("学习计划✅")

    print("[status] deepseek_status = %s" % json.dumps(ds_status, ensure_ascii=False))
    print("[status] ai_stale = %s" % ai_stale)
    print("[done] data/latest.json 已写入: %s" % " + ".join(parts))
    return True


if __name__ == "__main__":
    success = build()
    sys.exit(0 if success else 1)
