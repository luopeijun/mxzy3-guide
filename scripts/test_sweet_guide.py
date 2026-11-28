"""`scripts/extract_sweet_guide.py` 的守护测试。

甜蜜乐章的数据是脚本生成的，不允许手改 `public/data/sweet/guide.json` ——
手改一次之后重新生成就会悄悄回退。这里锁住这些事：

  * 提交的 guide.json 与脚本重算的结果完全一致；
  * 主线攻略被完整解析：4 个章节 + 23 个事件，编号连续，「时间/概要」都进了卡里；
  * 公司改建攻略：1 个章节 + 9 个事件（4-1 ~ 4-9），顶格的细节行也能识别；
  * 国外通告接拍条件：三行一组解析成 5 行表格，城市顺序与条件都对；
  * 目录结构按用户裁决：类目叫「经纪人事件簿」、没有「角色介绍」这一节。

跑法（用项目 venv 的 Python）：
    python scripts/test_sweet_guide.py
"""

from __future__ import annotations

import json
import re
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import extract_sweet_guide as esg  # noqa: E402

ROOT = HERE.parent
GUIDE = ROOT / "public" / "data" / "sweet" / "guide.json"

# 主线攻略的四个章节，按原攻略顺序。
CHAPTERS = ["投资", "骗局", "摩登时代", "落日"]
# 每章的事件编号；合计 23 个事件。
EVENT_LABELS = [
    *[f"1-{i}" for i in range(1, 6)],
    *[f"2-{i}" for i in range(1, 6)],
    *[f"3-{i}" for i in range(1, 7)],
    *[f"4-{i}" for i in range(1, 8)],
]
# 公司改建攻略：单一章节「改建」，9 个事件。
COMPANY_LABELS = [f"4-{i}" for i in range(1, 10)]
# 国外通告接拍条件：五个城市 + 各自的公司与接拍条件。
ABROAD_ROWS = [
    ("东京", "京风唱片（唱片）", "推出3张唱片以上（个人、团体分开计算）"),
    ("好莱坞", "大宇宙影业（电影）", "拍过3部电影主角"),
    ("伦敦", "伊丽莎白（广告）", "拍过5个广告"),
    ("米兰", "柯里昂（时装秀）", "拍过5个广告"),
    ("纽约", "巴洛克之诗（舞台剧）", "拍过电影，拍过电视剧，做过主持"),
]


def _node(data: dict, slug: str) -> dict:
    category = next(c for c in data["categories"] if c["id"] == "sweet-guide")
    return next(n for n in category["children"] if n["id"] == f"sweet-guide/{slug}")


class TestSweetGuide(unittest.TestCase):
    def setUp(self) -> None:
        self.data = esg.build()
        self.story = _node(self.data, "main-story")
        self.blocks = self.story["blocks"]
        self.company = _node(self.data, "company")
        self.abroad = _node(self.data, "abroad-notices")

    def test_cg_links_are_applied(self) -> None:
        """CG ↔ 攻略映射：`sources/sweet/cg-links.tsv` 的每条都落在唯一的事件块上。

        命中的块必须同时带 `cgIds`（正向，图鉴据此反查落点）与 `anchor`
        （页内 DOM id，`ev<块下标>`，与前端兜底编号同一套）；`event` 类还要补
        `cg`，让这些事件和原文标了（CG）的卡片长得一样。
        """
        links = esg._read_cg_links()
        self.assertTrue(links, "sources/sweet/cg-links.tsv 缺失或为空")
        total = sum(len(entries) for entries in links.values())
        self.assertEqual(total, 41)

        nodes = {n["id"]: n for c in self.data["categories"] for n in c["children"]}
        seen: set[str] = set()
        for node_id, entries in links.items():
            node = nodes[node_id]
            for cg_id, kind, key in entries:
                hits = [
                    i for i, b in enumerate(node["blocks"])
                    if (
                        (b.get("kind") == "event" and b.get("label") == key)
                        if kind == "event"
                        else key in b.get("text", "")
                    )
                ]
                self.assertEqual(len(hits), 1, f"{node_id} {kind} {key!r}")
                index = hits[0]
                block = node["blocks"][index]
                self.assertIn(cg_id, block["cgIds"], f"{node_id} ev{index}")
                self.assertEqual(block["anchor"], f"ev{index}")
                if kind == "event":
                    self.assertTrue(block.get("cg"), f"{node_id} {key}")
                seen.add(cg_id)
        # 41 条映射各自对应一张不同的 CG（丹尼斯 / 史蒂芬 的共用图是两条不同条目）。
        self.assertEqual(len(seen), total)

        # 全表一致：凡是带 cgIds 的块都必须有 anchor，否则图鉴那边点不回来。
        for node in nodes.values():
            for block in node["blocks"]:
                if block.get("cgIds"):
                    self.assertTrue(block.get("anchor"), f"{node['id']} 缺 anchor")
                    self.assertEqual(len(set(block["cgIds"])), len(block["cgIds"]))

        # 徐世杰的四步原文没标（CG），是按用户核对表人工补进来的。
        xu = nodes["sweet-side/xu-shijie"]
        self.assertEqual(
            [b["label"] for b in xu["blocks"] if b.get("cg")],
            ["1-3", "1-20", "1-23", "1-26"],
        )

    def test_committed_json_matches_build(self) -> None:
        committed = json.loads(GUIDE.read_text(encoding="utf-8"))
        self.assertEqual(committed, self.data, "guide.json 与脚本重算不一致，请重新生成")

    def test_category_is_broker_events(self) -> None:
        first = self.data["categories"][0]
        self.assertEqual(first["id"], "sweet-guide")
        self.assertEqual(first["title"], "经纪人事件簿")
        self.assertEqual(len(first["children"]), 21)
        self.assertNotIn("角色介绍", [n["title"] for n in first["children"]])
        self.assertNotIn("sweet-guide/intro", [n["id"] for n in first["children"]])

    def test_three_categories(self) -> None:
        self.assertEqual(
            [c["title"] for c in self.data["categories"]],
            ["经纪人事件簿", "角色攻略", "支线攻略"],
        )
        stats = self.data["meta"]["stats"]
        self.assertEqual(stats["categories"], 3)
        self.assertEqual(stats["items"], 35)
        self.assertEqual(stats["readyItems"], 35)
        self.assertEqual(stats["missingItems"], 0)

    def test_character_avatars(self) -> None:
        # 目录 / 角色卡在人名左侧显示圆圈头像：<slug>-logo.* 探测到才写，
        # 没有头像文件的节点（舞台秘影）与经纪人事件簿绝不带 avatar 字段。
        expected = {
            "sweet-characters": {"cheng-zhongxuan", "danisi", "ji-xiang", "murong-hexi",
                                 "shen-weizhen", "shi-difen", "wei-ya", "yao-ziqi"},
            "sweet-side": {"tian-qing", "xia-yijun", "du-sichen", "xu-shijie", "jin-haoxun"},
        }
        for category in self.data["categories"]:
            with_avatar = {n["id"].split("/")[-1] for n in category["children"] if "avatar" in n}
            self.assertEqual(with_avatar, expected.get(category["id"], set()),
                             f"{category['title']} 的头像名单不对")
            for node in category["children"]:
                if "avatar" not in node:
                    continue
                self.assertRegex(node["avatar"], r"^images/sweet/[a-z-]+-logo\.(png|jpg|webp)$")
                self.assertTrue(
                    (ROOT / "public" / node["avatar"]).exists(),
                    f"{node['title']} 的头像文件不存在：{node['avatar']}",
                )

    def test_character_covers(self) -> None:
        # 封面渲染在正文头部（ContentPanel 的 node.cover）：<slug>-cover.* 探测到
        # 才写。本轮只有角色攻略 8 位给了封面，支线 5 位没给，绝不留空串。
        expected = {"cheng-zhongxuan", "danisi", "ji-xiang", "murong-hexi",
                    "shen-weizhen", "shi-difen", "wei-ya", "yao-ziqi"}
        for category in self.data["categories"]:
            with_cover = {n["id"].split("/")[-1] for n in category["children"] if "cover" in n}
            if category["id"] == "sweet-characters":
                self.assertEqual(with_cover, expected, "角色攻略 8 位都应有封面")
                for node in category["children"]:
                    self.assertRegex(node["cover"], r"^images/sweet/[a-z-]+-cover\.(png|jpg|webp)$")
                    self.assertTrue(
                        (ROOT / "public" / node["cover"]).exists(),
                        f"{node['title']} 的封面文件不存在：{node['cover']}",
                    )
            else:
                self.assertEqual(with_cover, set(), f"{category['title']} 不该有封面")

    def test_no_invented_descriptions(self) -> None:
        # 用户在意的点：目录与页面上的说明文字只能来自原文，不能自己总结。
        def headline(node: dict) -> str:
            slug = node["id"].split("/")[-1]
            text = (ROOT / "sources" / "sweet" / f"{slug}.txt").read_bytes().decode("utf-8")
            return text.replace("\r\n", "\n").split("\n")[0].strip()

        for category in self.data["categories"]:
            self.assertNotIn("description", category, category["title"])
            for node in category["children"]:
                if "description" in node:
                    self.assertEqual(
                        node["description"],
                        headline(node),
                        f"{node['title']} 的副标题不是原文首行",
                    )

    def test_main_story_is_ready(self) -> None:
        self.assertEqual(self.story["status"], "ready")
        self.assertEqual(self.story["description"], "主线任务（落日相关）")

    def test_chapters_and_events(self) -> None:
        sections = [b["text"] for b in self.blocks if b["kind"] == "section"]
        self.assertEqual(sections, [*CHAPTERS, "结局分歧"])
        labels = [b["label"] for b in self.blocks if b["kind"] == "event"]
        self.assertEqual(labels, EVENT_LABELS)

    def test_every_event_keeps_time_and_summary(self) -> None:
        by_group: dict[int, list[dict]] = {}
        for block in self.blocks:
            by_group.setdefault(block["group"], []).append(block)
        for label in EVENT_LABELS:
            group = next(
                b["group"] for b in self.blocks if b["kind"] == "event" and b["label"] == label
            )
            texts = [b["text"] for b in by_group[group] if b["kind"] == "paragraph"]
            self.assertTrue(
                any(t.startswith("时间：") for t in texts), f"{label} 缺时间行"
            )
            self.assertTrue(
                any(t.startswith("概要：") for t in texts), f"{label} 缺概要行"
            )

    def test_hints_and_footnotes_become_notes(self) -> None:
        notes = [b["text"] for b in self.blocks if b["kind"] == "note"]
        # 原攻略里 3 处「提示：」（2-2 / 3-4 / 3-6 / 4-1）
        self.assertEqual(sum(1 for n in notes if n.startswith("提示：")), 4)
        # 4-5 括号里的个人注解
        self.assertTrue(any("若到七月尚未开拍" in n for n in notes))
        # 文末的结局分歧
        self.assertTrue(any("迈向国际的经纪公司" in n for n in notes))

    def test_no_leftover_source_artifacts(self) -> None:
        # 全角句点 / 全角空格都是源文本的排版残留，生成的 JSON 里不该再出现
        # （表格页的单元格同样要干净）。
        def texts(node: dict):
            for block in node["blocks"]:
                yield block["text"]
                table = block.get("table")
                if table:
                    yield from (column["label"] for column in table["columns"])
                    for row in table["rows"]:
                        yield from row.values()

        for category in self.data["categories"]:
            for node in category["children"]:
                for text in texts(node):
                    self.assertNotIn("．", text, f"残留全角句点：{text}")
                    self.assertNotIn("\u3000", text, f"残留全角空格：{text}")
                    self.assertNotRegex(text, r"[０-９]", f"残留全角数字：{text}")
                    # 转码漏网的：全角百分号、「讃」是「赞」的异体、「著」应作语助词「着」。
                    self.assertNotIn("％", text, f"残留全角百分号：{text}")
                    self.assertNotIn("讃", text, f"残留异体字「讃」：{text}")
                    # 「著名 / 显著」是简体标准词，不是繁体残留；只拦语助词误用的「穿著」等。
                    self.assertNotRegex(text, r"(?<!显)著(?!名)", f"残留「著」：{text}")

    def test_company_page(self) -> None:
        self.assertEqual(self.company["status"], "ready")
        # 副标题只来自原文首行（与标题重复时丢弃），不写自拟概述。
        self.assertNotIn("description", self.company)

        blocks = self.company["blocks"]
        # 「4.改建」里的章节号不进标题，和主线攻略的「投资」「骗局」保持同一种写法。
        self.assertEqual([b["text"] for b in blocks if b["kind"] == "section"], ["改建"])
        self.assertEqual([b["label"] for b in blocks if b["kind"] == "event"], COMPANY_LABELS)

        # 细节行顶格写（没有缩进），也得逐条落进对应事件卡里。
        by_group: dict[int, list[dict]] = {}
        for block in blocks:
            by_group.setdefault(block["group"], []).append(block)
        for label in COMPANY_LABELS:
            group = next(b["group"] for b in blocks if b["kind"] == "event" and b["label"] == label)
            texts = [b["text"] for b in by_group[group] if b["kind"] == "paragraph"]
            self.assertTrue(any(t.startswith("时间：") for t in texts), f"{label} 缺时间行")
            self.assertTrue(any(t.startswith("概要：") for t in texts), f"{label} 缺概要行")

        notes = [b["text"] for b in blocks if b["kind"] == "note"]
        self.assertEqual(len(notes), 3, notes)  # 4-1 / 4-3 / 4-7 各一条提示
        self.assertTrue(all(n.startswith("提示：") for n in notes))

    def test_abroad_notices_table(self) -> None:
        self.assertEqual(self.abroad["status"], "ready")
        self.assertNotIn("description", self.abroad)
        self.assertEqual(len(self.abroad["blocks"]), 1)

        block = self.abroad["blocks"][0]
        self.assertEqual(block["kind"], "table")
        table = block["table"]
        self.assertEqual([c["label"] for c in table["columns"]], ["城市", "公司（通告类型）", "接拍条件"])
        self.assertEqual(
            [(r["city"], r["company"], r["requirement"]) for r in table["rows"]],
            ABROAD_ROWS,
        )

    def test_self_notices(self) -> None:
        node = _node(self.data, "self-notices")
        blocks = node["blocks"]

        # 三种介质各一章；艺人分组是小标题，「其他」也在里面。
        self.assertEqual([b["text"] for b in blocks if b["kind"] == "section"], ["唱片", "电视剧", "电影"])
        headings = [b["text"] for b in blocks if b["kind"] == "heading"]
        self.assertEqual(len(headings), 24)
        self.assertEqual(headings[:2], ["杜云芊", "沈惟真"])
        self.assertEqual(headings[-1], "其他")

        # 一首歌一张卡：歌名当标题、编号进 pill，说明与属性要求在同一个 group 里。
        by_group: dict[int, list[dict]] = {}
        for block in blocks:
            by_group.setdefault(block["group"], []).append(block)
        songs = [b for b in blocks if b["kind"] == "event"]
        self.assertEqual(len(songs), 73)
        self.assertEqual(sum(1 for b in songs if "label" not in b), 4)  # 《无瑕四重奏》等没编号
        self.assertEqual((songs[0]["label"], songs[0]["text"]), ("1", "《晴天娃娃》"))

        first = by_group[songs[0]["group"]]
        self.assertEqual(
            [(b["kind"], b["text"]) for b in first],
            [
                ("event", "《晴天娃娃》"),
                ("paragraph", "特殊，录制完第一张专辑且上市后，累积16天自由活动获得。（民歌个人、两星）"),
            ],
        )
        escape = next(b for b in songs if b["text"] == "《逃离过去》")
        self.assertEqual(
            [b["text"] for b in by_group[escape["group"]] if b["kind"] == "paragraph"],
            ["一般，累积20天自由活动后获得（摇滚个人、五星）", "歌艺700、名气500、动感550、体能550"],
        )

        # 电影《讨厌爱上你》的片种说明是折行，要接回上一句。
        hate = next(b for b in songs if b["text"] == "《讨厌爱上你》")
        detail = [b["text"] for b in by_group[hate["group"]] if b["kind"] == "paragraph"]
        self.assertEqual(len(detail), 1)
        self.assertTrue(detail[0].endswith("（爱情文艺片，男双五星）"), detail[0])

        # 开头那段获得方式说明留在页首，不是艺人分组。
        self.assertEqual(blocks[0]["kind"], "paragraph")
        self.assertEqual(blocks[0]["text"], "1、触发剧情后直接获得；")

        # 作者补的 PS 单独走便签样式，行首的 * 是源文本的标记，去掉。
        notes = [b["text"] for b in blocks if b["kind"] == "note"]
        self.assertEqual(len(notes), 1, notes)
        self.assertTrue(notes[0].startswith("（PS："), notes[0])
        self.assertFalse(notes[0].startswith("*"), notes[0])

    def test_outfits(self) -> None:
        node = _node(self.data, "outfits")
        blocks = node["blocks"]
        self.assertEqual(node["description"], "服装获得方法")  # 原文首行，不是自拟的
        self.assertEqual(
            [b["text"] for b in blocks if b["kind"] == "section"], ["虚拟服装相关剧情"]
        )
        headings = [b["text"] for b in blocks if b["kind"] == "heading"]
        self.assertEqual(
            headings[:4],
            ["春夏洋装", "古典晚礼服", "皮衣", "诱惑女神晨袍"],
        )
        self.assertIn("甜美小红帽（坚定的友谊）", headings)

        labels = [b["label"] for b in blocks if b["kind"] == "event"]
        self.assertEqual(labels[:3], ["1-1", "1-2", "1-3"])
        self.assertIn("3-8-1", labels)  # 三级编号
        self.assertEqual(len(labels), 42)

        # 前半段「编号 + 标题…时间」：标题进卡片头，省略号后的条件与年月单列一行。
        by_group: dict[int, list[dict]] = {}
        for block in blocks:
            by_group.setdefault(block["group"], []).append(block)
        first = next(b for b in blocks if b["kind"] == "event" and b["label"] == "1-1")
        self.assertEqual(first["text"], "差不多该换季了")
        self.assertEqual(
            [b["text"] for b in by_group[first["group"]] if b["kind"] == "paragraph"],
            ["时间：2008/3", "工作结束后，自动遇到王洁安与马秋慧讨论换季的事"],
        )
        # 源文本的 `2-8周三,…` 漏了句点，也要认出来是事件。
        step = next(b for b in blocks if b["kind"] == "event" and b["label"] == "2-8")
        self.assertTrue(step["text"].startswith("周三"), step["text"])

        notes = [b["text"] for b in blocks if b["kind"] == "note"]
        self.assertEqual(len(notes), 3)
        self.assertTrue(all(n.startswith("※") for n in notes))

        # 女仆装 / 小红帽的时间、概要、提示、薪资与募款分支挂在事件块上，不新增块
        # ——追踪器按块下标存进度，插块会让老存档整体错位。
        annotated = {b["label"]: b for b in blocks if b.get("eventNotes")}
        self.assertEqual(len(annotated), 26)  # 女仆装 / 小红帽 15 + 甜蜜新娘礼服 11

        def note_text(label: str) -> str:
            return "\n".join(
                item["text"]
                for group in annotated[label]["eventNotes"]
                for item in group["items"]
            )

        # 3-1 的时间 / 概要 / 老板娘请求 / 装扮提示四项都要在。
        self.assertEqual([g["title"] for g in annotated["3-1"]["eventNotes"]], ["流程提示"])
        self.assertIn("2008/4-6", note_text("3-1"))
        self.assertIn("席若芸的请求", note_text("3-1"))
        self.assertIn("老板娘询问云芊要不要周末穿女仆装到酒吧打工", note_text("3-1"))
        self.assertIn("穿着女仆装进19号酒吧", note_text("3-1"))

        # 3-5 的两处灵感 / 两处装扮提示及「不限打工」不能漏。
        self.assertIn("3发生后~2009/11", note_text("3-5"))
        self.assertIn("穿着女仆装进19号酒吧（不限打工）", note_text("3-5"))
        self.assertIn("云芊到京风唱片，加贺大泽突然想到晚会的灵感", note_text("3-5"))
        self.assertIn("穿着女仆装进京风唱片", note_text("3-5"))

        # 小红帽：1-1 时间 / 概要 / 装扮齐全；新闻那条挂在 1-6 上（源文本只有 6 个事件）。
        self.assertEqual([g["title"] for g in annotated["1-1"]["eventNotes"]], ["流程提示"])
        self.assertIn("2008/6", note_text("1-1"))
        self.assertIn("合照", note_text("1-1"))
        self.assertIn("穿着小红帽装", note_text("1-1"))
        self.assertIn("安妤约云芊到公园", note_text("1-4"))
        self.assertNotIn("杨安妤", note_text("1-4"))
        self.assertIn("绯闻为新闻炒作", note_text("1-6"))
        self.assertIn("公司知名度+100、云芊人气-30", note_text("1-6"))

        # 甜蜜新娘礼服：物件 / 报酬 / 损失与两次花钱分支都要挂在对应事件上。
        self.assertIn("虚宝新娘礼服一件", note_text("2-1"))
        self.assertIn("事件图一枚", note_text("2-1"))
        self.assertIn("550万", note_text("2-1"))
        self.assertIn("仪态超过550", note_text("2-2"))
        self.assertIn("要记得点摄影师二次", note_text("2-2"))
        self.assertIn("失去50万", note_text("2-5"))
        self.assertIn("不答应→事件结束", note_text("2-6"))
        self.assertIn("没穿→事件结束", note_text("2-7"))
        self.assertIn("失去500万", note_text("2-8"))
        self.assertIn("得到一封信", note_text("2-9"))
        self.assertIn("人气上升5", note_text("2-11"))

    def test_festivals(self) -> None:
        node = _node(self.data, "festivals")
        blocks = node["blocks"]
        self.assertNotIn("description", node)  # 源文本没有整页标题
        self.assertEqual(
            [b["text"] for b in blocks if b["kind"] == "section"], ["主角生日", "情人节", "圣诞节"]
        )
        headings = [b["text"] for b in blocks if b["kind"] == "heading"]
        self.assertEqual(
            headings[:3], ["第一年生日", "第二年后生日", "艺人生日礼物列表--"]
        )
        # 列表项与箭头流程都是普通段落，原样保留编号。
        texts = [b["text"] for b in blocks if b["kind"] == "paragraph"]
        self.assertIn("1.如果有交往对象，就和交往对象一起过", texts)
        self.assertIn("第1年-不限次数", texts)
        self.assertTrue(
            any(t.startswith("情人节邀约沟通话题->") for t in texts), "箭头流程丢了"
        )
        # 源文本的两处错字已按用户裁决补正（缺字 / 同音字），别改回去。
        self.assertIn("城仲瑄：杜云芊穿着春夏洋装", texts)
        self.assertIn("2.该艺人2月14日当天没有特殊行程和约会", texts)

        # 名单行（谁：什么）用圆点；带序号的行不用，序号本身就是标记。
        dots = [b["text"] for b in blocks if b["kind"] == "paragraph" and b.get("bullet")]
        named = [t for t in dots if "：" in t and not t[0].isdigit() and not t.startswith("第")]
        self.assertEqual(len(named), 16)  # 生日礼物 8 + 情人节 CG 8
        self.assertFalse(any(t[0].isdigit() for t in dots), f"带序号的行不该有圆点：{dots}")
        # 年份门槛缩进一级挂在「约会次数要求：」/「好感度要求：」下面。
        years = [b for b in blocks if b["kind"] == "paragraph" and str(b["text"]).startswith("第")]
        self.assertEqual(len(years), 6)
        self.assertTrue(all(y.get("bullet") and y.get("depth") == 1 for y in years))
        numbered = [t for t in texts if t[0].isdigit()]
        self.assertEqual(len(numbered), 14)  # 生日 4 + 情人节 5 + 圣诞节 5
        self.assertFalse(any(t.startswith(("第", "沈惟真：")) for t in numbered))
        # 作者注是便签，不是圆点条目。
        self.assertEqual(
            [b["kind"] for b in blocks if b["text"].startswith("注：")], ["note", "note"]
        )
        # 用户给的节日真值：生日好感须为旗下最高、圣诞是 12/24、结局 CG 提示。
        self.assertTrue(any("且是旗下艺人之中最高的" in t for t in texts))
        self.assertIn("2.该艺人12月24日当天没有特殊行程和约会", texts)
        self.assertTrue(any("达成结局" in b["text"] for b in blocks))
        # 普通说明句不该带圆点（第一年生日那句）。
        solo = next(b for b in blocks if b["text"].startswith("只有杜司臣"))
        self.assertFalse(solo.get("bullet"))

    def test_career_endings(self) -> None:
        node = _node(self.data, "career-endings")
        blocks = node["blocks"]
        self.assertNotIn("description", node)  # 首行与页面标题同名

        # 前 11 条事业结局：每条都是一个大标题，条件跟在下面一行。
        sections = [b["text"] for b in blocks if b["kind"] == "section"]
        self.assertEqual(len(sections), 12)  # 11 个结局 + 巨星条件
        self.assertEqual((sections[0], sections[10], sections[-1]), ("天王巨星", "公司倒闭", "巨星条件"))
        by_group: dict[int, list[dict]] = {}
        for block in blocks:
            by_group.setdefault(block["group"], []).append(block)
        giant = next(b for b in blocks if b["text"] == "天王巨星")
        self.assertEqual(
            [b["text"] for b in by_group[giant["group"]] if b["kind"] == "paragraph"],
            ["女主角的称号为超级天后"],
        )

        # 「巨星条件」之后是四个块，各自一个小标题。
        self.assertEqual(
            [b["text"] for b in blocks if b["kind"] == "heading"],
            ["数值条件", "通告条件（1或2）", "其他条件（1和2）", "奖项条件"],
        )
        texts = [b["text"] for b in blocks if b["kind"] == "paragraph"]
        self.assertIn("女主角的称号为超级天后", texts)
        # 源文本是全角数字，转码时已归一成半角。
        self.assertIn("歌唱：600↑", texts)
        self.assertIn("知名度过1500而又没有创作10部以上上市", texts)
        self.assertIn("金像奖（11月30日）：最佳男主角奖、最佳女主角奖", texts)

        # 六项数值与四个奖项都是并列名单 → 圆点；奖项缩进一级挂在引导句下面。
        bulleted = [b for b in blocks if b.get("bullet")]
        self.assertEqual(
            [b["text"] for b in bulleted],
            [
                "歌唱：600↑",
                "演技：600↑",
                "仪态：500↑",
                "自信：700↑",
                "名气：700↑",
                "人气：5↑",
                "金星奖（2月29日）：最佳模特儿奖",
                "金钟奖（5月30日）：最佳演员奖、最佳主持人奖",
                "金曲奖（8月30日）：最佳演唱人奖",
                "金像奖（11月30日）：最佳男主角奖、最佳女主角奖",
            ],
        )
        self.assertEqual([b.get("depth") for b in bulleted], [None] * 6 + [1] * 4)
        # 带数字序号的通告 / 其他条件不加圆点（序号本身已是标记）。
        self.assertFalse(any(b.get("bullet") for b in blocks if "电影6" in b["text"] or "演唱会2场" in b["text"]))

    def test_endings_table(self) -> None:
        node = _node(self.data, "endings")
        self.assertEqual(len(node["blocks"]), 1)
        block = node["blocks"][0]
        self.assertEqual(block["kind"], "table")
        table = block["table"]
        self.assertEqual(
            [c["label"] for c in table["columns"]],
            ["序号", "公司显示名称", "知名度", "公关", "达成条件"],
        )

        rows = table["rows"]
        self.assertEqual(len(rows), 16)
        self.assertEqual(rows[0]["name"], "傲视全球的演艺帝国")
        self.assertEqual((rows[0]["fame"], rows[0]["pr"]), ("2500以上", "150以上"))
        self.assertEqual(rows[0]["condition"], "完成夏以军相关剧情，其余同顶尖国际经纪公司。")
        self.assertEqual(rows[13]["condition"], "以上皆不符合")
        self.assertEqual(rows[14]["condition"], "同上")
        self.assertEqual(rows[15]["condition"], "")  # 原文第 16 条没写说明

    def test_sweet_mode(self) -> None:
        node = _node(self.data, "sweet-mode")
        blocks = node["blocks"]
        self.assertNotIn("description", node)  # 原文没有页面总标题
        self.assertEqual(
            [b["text"] for b in blocks if b["kind"] == "section"],
            ["启动方法", "使用时机", "影响"],
        )
        notes = [b["text"] for b in blocks if b["kind"] == "note"]
        self.assertEqual(len(notes), 2)
        self.assertTrue(notes[0].startswith("以下列出使用甜蜜模式时结婚事件"), notes[0])

        # 「影响」的 a.~f. 是这一页的一级条目：必须是次级标题，不能是正文。
        self.assertEqual(
            [(b["text"][:2], b.get("depth")) for b in blocks if b["kind"] == "heading" and b.get("depth") == 1],
            [("a.", 1), ("b.", 1), ("c.", 1), ("d.", 1), ("e.", 1), ("f.", 1)],
        )
        # 「使用时机」那两条 a./b. 没有下级内容，用圆点条目。
        self.assertEqual(
            [b["text"][:2] for b in blocks if b["kind"] == "paragraph" and b.get("bullet")],
            ["a.", "b."],
        )

        # 结婚清单：角色退到三级标题（depth 2）并包在白底卡片里，条件比角色更内一层。
        cards = [b for b in blocks if b["kind"] == "heading" and b.get("card")]
        self.assertEqual(
            [b["text"] for b in cards],
            [
                "沈惟真", "丹尼斯", "史蒂芬", "姚子奇", "慕容和希", "卫亚", "纪翔", "城仲瑄",
                "沈惟真", "丹尼斯", "史蒂芬", "姚子奇", "慕容和希", "卫亚", "纪翔", "城仲瑄",
            ],
        )
        self.assertTrue(all(b["depth"] == 2 for b in cards))

        by_group: dict[int, list[dict]] = {}
        for block in blocks:
            by_group.setdefault(block["group"], []).append(block)
        first = next(b for b in blocks if b["text"] == "沈惟真")
        self.assertEqual(
            [b["text"] for b in by_group[first["group"]] if b["kind"] == "paragraph"],
            ["收到喜欢的礼物5个以上。", "邀约25次以上。", "沈惟真跟记者坦承与女主角交往"],
        )
        self.assertTrue(
            all(b.get("depth") == 2 for b in by_group[first["group"]] if b["kind"] == "paragraph")
        )

        # 告白清单：编号单独进 tag，正文里不再带「4-1.」。
        numbered = [
            b for b in blocks if b["kind"] == "paragraph" and b.get("label")
        ]
        self.assertEqual(len(numbered), 22)
        self.assertEqual([b["label"] for b in numbered][:3], ["4-1", "4-3", "4-5"])
        self.assertTrue(numbered[0]["text"].startswith("约会2次以上"))
        self.assertTrue(any(b["label"] == "7-10" for b in numbered))
        self.assertTrue(all(b["depth"] == 2 for b in numbered))
        self.assertFalse(any(b["text"][:2].startswith("4-") for b in numbered))

        # e./f. 的年份门槛挂在各自条目下面。
        e_group = by_group[next(b for b in blocks if b["text"].startswith("e.情人节"))["group"]]
        self.assertEqual(
            [b["text"] for b in e_group if b["kind"] == "paragraph"],
            ["第二年：前四个月约会超过4次→2次", "第三年：前四个月约会超过5次→3次"],
        )

    def test_favorite_gifts(self) -> None:
        node = _node(self.data, "favorite-gifts")
        blocks = node["blocks"]
        self.assertNotIn("description", node)
        # 一个角色一个大标题，物品清单跟在下面。
        self.assertEqual(
            [b["text"] for b in blocks if b["kind"] == "section"],
            ["沈惟真", "城仲瑄", "卫亚", "慕容和希", "姚子奇", "纪翔", "史蒂芬", "丹尼斯"],
        )
        self.assertEqual(len(blocks), 16)  # 8 个角色 ×（大标题 + 一行物品）

        by_group: dict[int, list[dict]] = {}
        for block in blocks:
            by_group.setdefault(block["group"], []).append(block)
        danisi = next(b for b in blocks if b["kind"] == "section" and b["text"] == "丹尼斯")
        items = by_group[danisi["group"]][1]["text"]
        # 原文写成「蓝色咖啡额」，多出来的「额」是错字，已补正。
        self.assertTrue(items.startswith("大宇啤酒、蓝色咖啡、海蓝色休闲头巾"), items[:24])
        self.assertNotIn("蓝色咖啡额", "".join(b["text"] for b in blocks))

    def test_character_pages(self) -> None:
        category = next(c for c in self.data["categories"] if c["id"] == "sweet-characters")
        nodes = {n["id"].split("/")[-1]: n for n in category["children"]}
        self.assertEqual(nodes["cheng-zhongxuan"]["status"], "ready")
        self.assertEqual(nodes["danisi"]["status"], "ready")
        # 首行就是角色名，与页面标题相同 → 不写副标题。
        self.assertNotIn("description", nodes["cheng-zhongxuan"])

        cheng = nodes["cheng-zhongxuan"]["blocks"]
        # 开头三行基础信息直接是列表，没有自拟的「基础信息」小标题。
        self.assertEqual(
            [b["text"] for b in cheng[:3]], ["签约金：0万", "分红：80%", "限制：严禁裸露"]
        )
        self.assertTrue(all(b["kind"] == "paragraph" and b.get("bullet") for b in cheng[:3]))

        self.assertEqual(
            [b["text"] for b in cheng if b["kind"] == "section"],
            [
                "可创作作品",
                "事件",
                "普通模式下结婚图取得条件",
                "甜蜜模式下结婚图取得条件",
                "甜蜜模式下告白相关事件触发条件",
                # 约会页的对话选项追加在页尾（见 test_character_date_options）。
                "普通约会对话选项提示",
                "亲密约会对话选项提示",
            ],
        )
        # 只数事件部分的章节标题；页尾约会小节下的地点名也是 heading。
        first_date = next(i for i, b in enumerate(cheng) if b["text"] == "普通约会对话选项提示")
        self.assertEqual(
            [b["text"] for b in cheng[:first_date] if b["kind"] == "heading"],
            ["加入", "拘谨", "得奖", "犹豫", "家境", "资格", "贤惠", "距离"],
        )

        events = [b for b in cheng if b["kind"] == "event"]
        self.assertEqual(len(events), 37)  # 1-1 ~ 8-7
        self.assertEqual((events[0]["label"], events[0]["text"]), ("1-1", "樱花绽放的季节"))
        self.assertEqual(events[-1]["label"], "8-7")
        # 括号里的效果标记拆成两个标记：CG 走徽标（和原站同一套高亮），其余进 tag。
        self.assertNotIn("（", "".join(b["text"] for b in events))
        self.assertEqual(events[1]["text"], "我看你的外型不错…")
        self.assertEqual(events[1]["tag"], "友好度上升")
        self.assertTrue(events[1]["cg"])
        cg_only = next(b for b in events if b["label"] == "8-2")
        self.assertTrue(cg_only["cg"])
        self.assertNotIn("tag", cg_only)
        self.assertEqual([b["label"] for b in events if b.get("cg")], ["1-2", "6-2", "8-2"])
        self.assertEqual(len([b for b in events if b.get("tag")]), 18)
        self.assertEqual({b["tag"] for b in events if b.get("tag")}, {"友好度上升"})

        # 「提示：」是金色备注，跟事件的细节行同组（会渲染进同一张卡）。
        note_at = next(i for i, b in enumerate(cheng) if b["kind"] == "note")
        self.assertTrue(cheng[note_at]["text"].startswith("提示："))
        self.assertEqual(cheng[note_at]["group"], cheng[note_at - 1]["group"])

        # 收尾三个小节里的编号条目是条件，不是事件：普通模式那几条保持原样一行一条。
        start = next(i for i, b in enumerate(cheng) if b["text"] == "普通模式下结婚图取得条件")
        tail = [b for b in cheng[start:] if b["group"] == cheng[start]["group"]]
        self.assertEqual(len(tail), 4)  # 小节头 + 3 条
        self.assertEqual(
            [b["text"] for b in tail[1:]],
            [
                "1.公司自制作品10个以上",
                "2.城仲瑄称号为天王巨星",
                "3.公司结局为顶尖国际经纪公司或迈向国际的经纪公司",
            ],
        )
        self.assertFalse(any(b.get("bullet") for b in tail[1:]))
        # 告白条件带事件编号：编号进 pill，条件跟在后面（页尾现在是约会小节）。
        announce = next(i for i, b in enumerate(cheng) if b["text"] == "甜蜜模式下告白相关事件触发条件")
        last_condition = [b for b in cheng[announce:] if b["group"] == cheng[announce]["group"]][-1]
        self.assertEqual(last_condition["label"], "6-2")
        self.assertTrue(last_condition["text"].startswith("取消友好度检查"))

        # 丹尼斯：可创作作品里带 `*` 的那条是特殊作品（金色菱形），星号不进正文。
        dan = nodes["danisi"]["blocks"]
        works = [b for b in dan if b["group"] == 1]
        self.assertEqual(len(works), 12)  # 小节头 + 11 部作品
        special = [b for b in works if b.get("special")]
        self.assertEqual([b["text"] for b in special], ["舞台剧·从接吻开始：获得kissCG后"])
        self.assertFalse(any(b["text"].startswith("*") for b in dan))
        # 源文本的「称讃」是错字，已按用户裁决补正。
        self.assertFalse(any("称讃" in b["text"] for b in dan))
        self.assertTrue(any("称赞" in b["text"] for b in dan))
        self.assertEqual(len([b for b in dan if b["kind"] == "event"]), 51)  # 1-1 ~ 8-9

    def test_remaining_character_pages(self) -> None:
        # 六页同一套排法，解析器不用各自定制；锁章节数 / 事件数 / 出 CG 的事件号。
        category = next(c for c in self.data["categories"] if c["id"] == "sweet-characters")
        nodes = {n["id"].split("/")[-1]: n for n in category["children"]}
        sections = [
            "可创作作品",
            "事件",
            "普通模式下结婚图取得条件",
            "甜蜜模式下结婚图取得条件",
            "甜蜜模式下告白相关事件触发条件",
            # 约会页的对话选项追加在页尾（见 test_character_date_options）。
            "普通约会对话选项提示",
            "亲密约会对话选项提示",
        ]
        expected = {
            "ji-xiang": (9, 43, ["5-2", "7-6", "8-2", "9-1"]),
            "murong-hexi": (9, 44, ["1-2", "4-1", "4-4", "7-4", "9-5"]),
            "shen-weizhen": (7, 36, ["1-1", "2-1", "4-6", "5-2", "7-4"]),
            "shi-difen": (7, 43, ["1-2", "4-3", "5-3"]),
            "wei-ya": (8, 40, ["4-4", "6-3", "8-2"]),
            "yao-ziqi": (9, 40, ["1-2", "8-5", "9-2"]),
        }
        for slug, (heads, events, cgs) in expected.items():
            node = nodes[slug]
            self.assertEqual(node["status"], "ready", slug)
            # 首行就是角色名 → 不写副标题。
            self.assertNotIn("description", node, slug)
            blocks = node["blocks"]
            self.assertEqual([b["text"] for b in blocks if b["kind"] == "section"], sections, slug)
            # 正文只数到约会页之前：约会的地点（植物园 / 电影院…）也是 heading。
            stop = next(i for i, b in enumerate(blocks) if b["text"] == "普通约会对话选项提示")
            body = blocks[:stop]
            self.assertEqual(len([b for b in body if b["kind"] == "heading"]), heads, slug)
            event_blocks = [b for b in body if b["kind"] == "event"]
            self.assertEqual(len(event_blocks), events, slug)
            self.assertEqual([b["label"] for b in event_blocks if b.get("cg")], cgs, slug)
            # 效果标记已经从标题里摘掉（CG / 友好度上升都进了标记）。
            self.assertFalse(
                any("（友好度上升" in b["text"] or "（CG" in b["text"] for b in event_blocks), slug
            )

        # 「出去走走吧～（2）」的括号是标题的一部分（同名事件的第二次），不是效果标记。
        shen = nodes["shen-weizhen"]["blocks"]
        again = next(b for b in shen if b.get("label") == "4-3")
        self.assertEqual(again["text"], "出去走走吧～（2）")
        self.assertNotIn("tag", again)
        self.assertNotIn("cg", again)

        # 沈惟真的作品清单自带「1、」序号，不再叠圆点；「分红：20％」的全角百分号已归一。
        works_start = next(i for i, b in enumerate(shen) if b["text"] == "可创作作品")
        works = [b for b in shen[works_start:] if b["group"] == shen[works_start]["group"]][1:]
        self.assertEqual(len(works), 9)
        self.assertEqual(works[0]["text"], "1、唱片·雨天：进公司一月后主动赠送")
        self.assertFalse(any(b.get("bullet") for b in works))
        self.assertEqual([b["text"] for b in shen[:3]][1], "分红：20%")

        # 转码漏网的异体字 / 语助词：「称讃」→称赞、「讃美」→赞美、「困扰著」→困扰着。
        wei = nodes["wei-ya"]["blocks"]
        self.assertTrue(any("称赞卫亚的新闻" in b["text"] for b in wei))
        self.assertTrue(any("困扰着" in b["text"] for b in wei))
        yao = nodes["yao-ziqi"]["blocks"]
        self.assertTrue(any("惊人的赞美！" in b["text"] for b in yao))

    def test_character_date_options(self) -> None:
        # 约会页（<slug>-date.txt）并进角色页：开头的邀约门槛接在基础信息后面，
        # 两组对话选项追加到页尾，按地点分组的 Q/A 走 `qa` 块。
        category = next(c for c in self.data["categories"] if c["id"] == "sweet-characters")
        nodes = {n["id"].split("/")[-1]: n for n in category["children"]}

        cheng = nodes["cheng-zhongxuan"]["blocks"]
        # 基础信息：签约金 / 分红 / 限制 之后接四行邀约门槛，仍是一张列表。
        head = [b["text"] for b in cheng if b["group"] == cheng[0]["group"]]
        self.assertEqual(
            head,
            [
                "签约金：0万",
                "分红：80%",
                "限制：严禁裸露",
                "开启邀约条件：公司知名度300以上、城仲瑄称号达偶像级",
                "无法邀约的情况：杜云芊一星期内任一天的行程失败",
                "可连续约会上限周数：1周",
                "达上限后无法邀约周数：1周",
            ],
        )
        self.assertTrue(all(b.get("bullet") for b in cheng if b["group"] == cheng[0]["group"]))

        # 两个约会小节排在三个条件小节之后（追加到页尾），没有插进事件中间。
        self.assertEqual(
            [b["text"] for b in cheng if b["kind"] == "section"][-2:],
            ["普通约会对话选项提示", "亲密约会对话选项提示"],
        )

        for slug, questions, answers, places, first_answer in (
            ("cheng-zhongxuan", 12, 13, 10, "赞成他的说法"),
            ("danisi", 20, 20, 14, "是否该改变造型？"),
            ("ji-xiang", 11, 11, 8, "书店"),
            ("murong-hexi", 13, 15, 9, "去林荫小径好了。"),
            ("shen-weizhen", 22, 22, 12, "这不是我的弱点"),
            ("shi-difen", 10, 10, 6, "啊！好可爱！"),
            ("wei-ya", 20, 23, 10, "当然不会"),
            ("yao-ziqi", 42, 45, 13, "不太习惯"),
        ):
            blocks = nodes[slug]["blocks"]
            start = next(i for i, b in enumerate(blocks) if b["text"] == "普通约会对话选项提示")
            date = blocks[start:]
            pairs = [b for b in date if b["kind"] == "qa"]
            self.assertEqual(len(pairs), questions, slug)
            self.assertEqual(sum(len(b["answer"].split("\n")) for b in pairs), answers, slug)
            self.assertEqual(len([b for b in date if b["kind"] == "heading"]), places, slug)
            # 问题按地点从 1 重新编号；回答挂在各自的问题上。
            self.assertEqual((pairs[0]["label"], pairs[0]["answer"]), ("1", first_answer), slug)
            self.assertTrue(all(b.get("answer") for b in pairs), slug)
            # 「Q：」「A：」这类源文本标记已经变成编号 / 答 徽标，正文里不再带。
            self.assertFalse(any(b["text"].startswith("Q：") for b in pairs), slug)

        # 一个问题两个都能过关的回答：源文本两行 A，存成一个换行分隔的 answer。
        multi = next(b for b in cheng if b["kind"] == "qa" and b["text"] == "今天想去什么地方？")
        self.assertEqual(multi["answer"], "唱片行\n服饰店")
        # 地点名照原文写「咚门商店街」——游戏里就是咚门，不是东门的 OCR 错字（用户裁决）。
        self.assertTrue(any(b["text"] == "咚门商店街" for b in cheng))
        self.assertFalse(any("东门" in b["text"] for b in cheng))

        # 八页的邀约门槛措辞各不相同（「开启约会条件 / 开启邀约条件」、「可连续约会上限
        # 周数 / 可连续约会周数」、「达上限后无法邀约周数 / …无法邀约的周数」），
        # 都按「四行一组接在基础信息后面」处理，不靠字面匹配。
        invite = re.compile(r"^(开启约会|开启邀约|无法邀约|可连续约会|达上限后)")
        for slug in nodes:
            blocks = nodes[slug]["blocks"]
            head = [b for b in blocks if b["group"] == blocks[0]["group"]]
            if not any("普通约会对话选项提示" in str(b.get("text")) for b in blocks):
                continue
            self.assertEqual(len([b for b in head if invite.match(b["text"])]), 4, slug)

        # 小节名后面带不带冒号各页不一致（卫亚全角、姚子奇半角），入库时统一去掉。
        for slug in ("wei-ya", "yao-ziqi"):
            self.assertEqual(
                [b["text"] for b in nodes[slug]["blocks"] if b["kind"] == "section"][-2:],
                ["普通约会对话选项提示", "亲密约会对话选项提示"],
                slug,
            )

        # 「提示：…」是挂在某个地点下面的附加门槛（慕容和希购物中心那条），走 note 不走地点。
        notes = [b["text"] for b in nodes["murong-hexi"]["blocks"] if b["kind"] == "note"]
        self.assertIn("提示：杜云芊歌唱、才智、体力总和400以上，好感才会上升。", notes)
        self.assertFalse(
            any(b["text"].startswith("提示：") for b in nodes["murong-hexi"]["blocks"] if b["kind"] == "heading")
        )

        # 姚子奇的疑问句被 OCR 成书名号「好，先到哪去》」，已按问号出。
        yao = nodes["yao-ziqi"]["blocks"]
        self.assertTrue(any(b["text"] == "好，先到哪去？" for b in yao))
        self.assertFalse(any("》" in b["text"] for b in yao if b["kind"] == "qa"))

    def test_side_stories(self) -> None:
        # 支线六页：目录标题去掉「关于」，正文是「章节 / 编号步骤 / 条件附注」三层。
        category = next(c for c in self.data["categories"] if c["id"] == "sweet-side")
        self.assertEqual(
            [n["title"] for n in category["children"]],
            ["舞台秘影", "天晴", "夏以军", "徐世杰", "杜司臣", "金皓薰"],
        )
        self.assertTrue(all(n["status"] == "ready" for n in category["children"]))
        nodes = {n["id"].split("/")[-1]: n["blocks"] for n in category["children"]}

        def kinds(blocks: list[dict], kind: str) -> list[dict]:
            return [b for b in blocks if b["kind"] == kind]

        # 章 / 步骤 / 说明三层，各页数量固定。
        expected = {
            "stage-shadow": (0, 15),
            "tian-qing": (5, 37),
            "xia-yijun": (4, 40),
            "xu-shijie": (3, 37),
            "du-sichen": (1, 5),
            "jin-haoxun": (3, 15),
        }
        for slug, (sections, events) in expected.items():
            self.assertEqual(len(kinds(nodes[slug], "section")), sections, slug)
            self.assertEqual(len(kinds(nodes[slug], "event")), events, slug)

        # 金皓薰的章是「1.变身」，靠下一行是 1-1. 认出来；条件清单里的「1.…」不能当章。
        self.assertEqual(
            [b["text"] for b in kinds(nodes["jin-haoxun"], "section")], ["变身", "夺爱", "金皓薰"]
        )
        self.assertEqual(
            [b["text"] for b in kinds(nodes["xia-yijun"], "section")],
            ["条件", "豪门爱恋", "紫罗兰之恋", "附注"],
        )
        self.assertTrue(
            any(b["text"] == "1.要有古典晚礼服，CG必要" for b in nodes["xia-yijun"])
        )

        # 夏以军 18 条流程提示 + 页首注记挂到 19 个事件块，不插块；
        # 原文 2-13/2-14 编号重复，避开它们免得同一份备注挂到两张卡上。
        xia = kinds(nodes["xia-yijun"], "event")
        xia_notes = {b["label"]: b.get("eventNotes", []) for b in xia if b.get("eventNotes")}
        self.assertEqual(
            list(xia_notes),
            ["1-1", "1-2", "1-3", "1-4", "1-7", "1-8", "1-11", "1-12", "1-16", "1-17", "1-18",
             "2-2", "2-3", "2-5", "2-6", "2-8", "2-11", "2-16", "2-17"],
        )
        self.assertEqual(
            [b["label"] for b in xia if b["label"] in ("2-13", "2-14")],
            ["2-13", "2-14", "2-13", "2-14"],
        )
        self.assertTrue(all(not b.get("eventNotes") for b in xia if b["label"] in ("2-13", "2-14")))

        def xia_text(label: str) -> str:
            return "\n".join(
                item["label"] + item["text"] for group in xia_notes[label] for item in group["items"]
            )

        self.assertIn("需同时完成落日主线", xia_text("1-1"))
        for label, token in (
            ("2-2", "体能>300"), ("2-3", "每周的2、4、6可以过去"),
            ("2-5", "8-9月间维也纳有紫罗兰玫瑰花"), ("2-6", "她女儿生前喜欢的花"),
            ("2-8", "穿着古典晚礼服"), ("1-2", "2月底去接"),
            ("1-3", "王导告知云芊演技有问题"), ("1-4", "强尼戴慷慨出借刘铮以前的DVD"),
            ("1-7", "王导称赞云芊进步很多"), ("1-8", "照片背面写着几个花名"),
            ("1-12", "陶醉喉糖"), ("1-11", "花150万买下另两组"),
            ("1-16", "结婚纪念日（1/31）"), ("1-17", "必须花费100万"),
            ("2-11", "3月前他不会回维也纳"), ("1-18", "1/31前往蔷薇花园"),
            ("2-16", "前往维也纳鼓励他面对人生"), ("2-17", "12月28日"),
        ):
            self.assertIn(token, xia_text(label), label)
        self.assertEqual(
            [item["label"] for item in xia_notes["2-17"][0]["items"]],
            ["时间：", "概要：", "提示：", "12月27日：", "12月28日：", "12月29日：", "装扮提示："],
        )

        # 天晴是「（1）～（37）」连续编号，跨章节也不重来。
        tian = kinds(nodes["tian-qing"], "event")
        self.assertEqual([b["label"] for b in tian], [str(n) for n in range(1, 38)])
        # ※ 行是便签，挂在上面那一步里。
        self.assertEqual(len(kinds(nodes["tian-qing"], "note")), 2)

        # 天晴 32 条流程提示挂到 30 个事件块上（前 7 条是舞台秘影共用前置），不插块。
        tian_notes = {b["label"]: b.get("eventNotes", []) for b in tian if b.get("eventNotes")}
        self.assertEqual(
            list(tian_notes),
            [str(n) for n in (1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 14, 16, 17, 18, 19,
                              20, 21, 22, 23, 24, 27, 28, 29, 31, 32, 33, 34, 35, 36)],
        )

        def tian_text(label: str) -> str:
            return "\n".join(
                item["label"] + item["text"] for group in tian_notes[label] for item in group["items"]
            )

        self.assertIn("需先解过舞台秘影支线并存档", tian_text("1"))
        for label, token in (
            ("1", "2008/1"), ("2", "2发生当周日"), ("3", "育幼院志工>3"),
            ("4", "每周六可到医院探访老人"), ("5", "则新闻主角为云芊"),
            ("6", "云芊EAMI唱片录制>1"), ("7", "天晴捉老鼠"),
            ("8", "映彤姊约云芊去酒吧庆功"), ("10", "不能飞翔的天使是天晴的创作"),
            ("11", "11发生后2个月内"), ("12", "歌艺会增加"), ("14", "公园练功>3次"),
            ("16", "凌玮翎吵架"), ("17", "2008/12"), ("18", "无法专心工作"),
            ("19", "云芊自言自语凌玮翎的事"), ("20", "路敏向云芊询问天晴的事"),
            ("21", "2009/1-2010/4"), ("22", "对天晴的感觉"), ("23", "穿着春夏洋装"),
            ("24", "天晴主动跟云芊说已开始认真工作"), ("27", "世界环保组织3个月"),
            ("28", "天晴参加世界环保组织的新闻"), ("29", "2010/6"),
            ("31", "路风跟路敏在看天晴寄的信"), ("32", "下定决心自己要坚强"),
            ("33", "治愈系单曲"), ("34", "映彤姊给云芊1个大红包"),
            ("35", "寄错地址的信"), ("36", "天晴出现，并告白了"),
        ):
            self.assertIn(token, tian_text(label), label)
        # 酒吧聊心事按次数拆开，每一条选项各有唯一标签。
        self.assertEqual(
            [item["label"] for group in tian_notes["12"] for item in group["items"]],
            ["时间：", "概要：", "提示：", "第一次：", "第二次：", "第三次：", "之后每次：", "好感后："],
        )

        # 徐世杰有两步漏了点号（`1-11与…` / `1-12十一月…`），照样是步骤而不是正文。
        shijie = kinds(nodes["xu-shijie"], "event")
        self.assertIn("1-11", [b["label"] for b in shijie])
        self.assertTrue(
            next(b for b in shijie if b["label"] == "1-11")["text"].startswith("与徐世杰第二次遇袭")
        )

        # 性骚扰疑云 2-1～2-11 的时间/概要/提示挂在事件块上，不新增块。
        notes = {b["label"]: b.get("eventNotes", []) for b in shijie if b["label"].startswith("2-")}
        self.assertEqual(list(notes), [f"2-{n}" for n in range(1, 12)])
        self.assertTrue(all(notes.values()))

        def note_text(label: str) -> str:
            return "\n".join(item["text"] for group in notes[label] for item in group["items"])

        self.assertIn("2008/6-8", note_text("2-1"))
        self.assertIn("花50万买消息", note_text("2-8"))
        self.assertIn("得到自信粉底", note_text("2-10"))
        self.assertIn("得到机智唇膏", note_text("2-11"))
        self.assertEqual(len(kinds(nodes["xu-shijie"], "note")), 0)

        # 舞台秘影 1-12 下面是六个送礼地点的续行，归在同一步里当细节。
        stage = nodes["stage-shadow"]
        star = next(i for i, b in enumerate(stage) if b.get("label") == "1-12")
        self.assertEqual(
            [b["text"] for b in stage[star + 1 : star + 7]],
            ["纪翔 酒吧", "丹尼斯 全球制片", "姚子莹 日月光唱片", "关古威&克烈斯 SOSA电视台",
             "天晴&原少纬 EAMI唱片公司二楼", "姚子奇 永振电视台"],
        )

        # 舞台秘影 16 条流程提示挂到 14 个事件块上（1-4 三段、1-10/1-12 各两段共用块），
        # 不插块：事件数仍是 15，老存档的追踪下标不变。
        stage_notes = {b["label"]: b.get("eventNotes", []) for b in stage if b.get("eventNotes")}
        self.assertEqual(
            list(stage_notes),
            ["1-1", "1-2", "1-3", "1-4", "1-5", "1-6", "1-8", "1-9",
             "1-10", "1-11", "1-12", "1-13", "1-14", "1-15"],
        )

        def stage_text(label: str) -> str:
            return "\n".join(
                item["label"] + item["text"] for group in stage_notes[label] for item in group["items"]
            )

        for label, token in (
            ("1-1", "新闻自动发生"),
            ("1-2", "2008/2"),
            ("1-3", "2发生当周日"),
            ("1-4", "育幼院志工>3"),
            ("1-5", "则新闻主角为云芊"),
            ("1-6", "若选择「回头」则走天晴支线"),
            ("1-8", "8发生1周后"),
            ("1-9", "9发生后1个月内"),
            ("1-10", "姚子莹被附身"),
            ("1-11", "每条10万，共买8条"),
            ("1-12", "SOSA边间"),
            ("1-13", "体能<600云芊会昏倒"),
            ("1-14", "高明权师弟会苏醒"),
            ("1-15", "嫚君登门拜访，并赠送在永振拍的照片"),
        ):
            self.assertIn(token, stage_text(label), label)

        # 八位收礼人与八处出现地点都在；末条附「舞台秘影」CG 提示。
        for name in ("姚子奇", "纪翔", "姚子莹", "关古威", "克烈斯", "天晴", "原少纬", "丹尼斯"):
            self.assertIn(name, stage_text("1-11"))
            self.assertIn(name, stage_text("1-12"))
        self.assertIn("舞台秘影", stage_text("1-15"))
        self.assertEqual(
            [g["title"] for g in stage_notes["1-4"]], ["志工团", "到医院探访老人", "探访老人"]
        )
        self.assertEqual(
            [g["title"] for g in stage_notes["1-10"]], ["拜访活动（永振）", "姚子莹被附身"]
        )

        # 杜司臣的事件带 时间 / 概要 / 提示，尾号（CG）走徽标。
        self.assertEqual([b["label"] for b in nodes["du-sichen"] if b.get("cg")], ["4-5"])
        self.assertTrue(any(b["text"].startswith("时间：第3年8月") for b in nodes["du-sichen"]))

        # 杜司臣 12 条核对表挂到 5 个事件块：六个节日前置合在 4-1，新闻与拜访合在 4-4。
        du = nodes["du-sichen"]
        du_notes = {b["label"]: b.get("eventNotes", []) for b in du if b.get("eventNotes")}
        self.assertEqual(list(du_notes), ["4-1", "4-2", "4-3", "4-4", "4-5"])
        self.assertEqual(
            [g["title"] for g in du_notes["4-1"]],
            ["2008年圣诞节", "2009年生日", "2009年情人节", "2009年圣诞节", "2010年生日",
             "2010年情人节", "杜云芊不是杜家亲骨肉"],
        )
        self.assertEqual(
            [g["title"] for g in du_notes["4-4"]], ["杜司臣极力否认一切", "宁愿不是兄妹"]
        )

        def du_text(label: str) -> str:
            return "\n".join(
                item["label"] + item["text"] for group in du_notes[label] for item in group["items"]
            )

        for label, token in (
            ("4-1", "2008/12/24"), ("4-1", "2009/4/1"), ("4-1", "2009/2/14"),
            ("4-1", "2009/12/24"), ("4-1", "2010/4/1"), ("4-1", "2010/2/14"),
            ("4-1", "想当哥哥的新娘"), ("4-1", "云芊名气>500"),
            ("4-2", "杜司臣前来澄清"), ("4-3", "城仲瑄主动前来"),
            ("4-4", "新闻「杜司臣极力否认一切」"), ("4-4", "真的要一直听哥哥的话吗？"),
            ("4-5", "公司金钱>3亿"), ("4-5", "云芊得奖>10"), ("4-5", "穿着古典晚礼服"),
        ):
            self.assertIn(token, du_text(label), (label, token))

        # 金皓薰的（友好度上升）走 tag，不进标题。
        jin = nodes["jin-haoxun"]
        self.assertEqual(
            [b["label"] for b in jin if b.get("tag")], ["1-2", "1-3", "2-2", "2-3", "2-4"]
        )
        self.assertFalse(any("（友好度上升）" in b["text"] for b in jin))

        # 金皓薰 15 条核对表挂到全部 15 个事件块，不插块（原文本就带时间/概要段落）。
        jin_notes = {b["label"]: b.get("eventNotes", []) for b in jin if b.get("eventNotes")}
        self.assertEqual(
            list(jin_notes),
            ["1-1", "1-2", "1-3"] + [f"2-{n}" for n in range(1, 7)] + [f"3-{n}" for n in range(1, 7)],
        )

        def jin_text(label: str) -> str:
            return "\n".join(
                item["label"] + item["text"] for group in jin_notes[label] for item in group["items"]
            )

        for label, token in (
            ("1-1", "2009/1-2010/12"), ("1-2", "左为改造前，右为改造后"),
            ("1-3", "此事件可重复3次（每次间隔1个月）"), ("2-1", "可以和我去植物园吗"),
            ("2-2", "4中约定的日期"), ("2-3", "2010/2/14"),
            ("2-4", "杨安妤前来与云芊确认此事"), ("2-5", "纪翔&金皓薰只能2择1"),
            ("2-6", "称号都在实力派以上才会触发"), ("3-1", "事件7、8都要表示喜欢金皓薰"),
            ("3-2", "公司知名度>300才看得到完整剧情"), ("3-3", "2010/10"),
            ("3-4", "事件12新闻发生后，云芊自言自语"), ("3-5", "到翱翔天际探望金皓薰"),
            ("3-6", "请不要跟随纪翔"),
        ):
            self.assertIn(token, jin_text(label), label)

        # 原文错字 / 错名按本仓统一写法补正。
        joined = "\n".join(b["text"] for blocks in nodes.values() for b in blocks)
        for bad in ("溷溷", "遇刺桉", "项炼", "萤幕", "苏曼君", "原少伟", "郭秘术", "天睛"):
            self.assertNotIn(bad, joined, bad)
        self.assertIn("小混混", joined)
        self.assertIn("苏嫚君", joined)
        # 全角字母（ＥAＭＩ）已归一。
        self.assertFalse(any("Ｅ" in b["text"] or "Ｍ" in b["text"] for blocks in nodes.values() for b in blocks))

    def test_award_dates(self) -> None:
        node = next(
            n for c in self.data["categories"] for n in c["children"]
            if n["id"] == "sweet-guide/award-dates"
        )
        blocks = node["blocks"]
        self.assertEqual(node["title"], "各类奖项颁奖日期及内容")
        # 首行与页面标题同名，不写副标题；资料页没有事件，追踪器下标不受影响。
        self.assertNotIn("description", node)
        self.assertFalse(any(b["kind"] == "event" for b in blocks))
        self.assertEqual(
            [b["text"] for b in blocks if b["kind"] == "section"],
            ["金星奖 － 广告", "金钟奖 － 电视剧、主持", "金曲奖 － 唱片", "金像奖 － 电影"],
        )
        self.assertEqual([b["text"] for b in blocks if b["kind"] == "heading"], ["奖项"] * 4)

        dated = [b for b in blocks if b.get("label") in ("2008", "2009", "2010")]
        self.assertEqual(len(dated), 12)
        self.assertEqual(
            [(b["label"], b["text"]) for b in dated[:3]],
            [
                ("2008", "入围名单 08/02/04（一） 颁奖 08/02/29（五）"),
                ("2009", "入围名单 09/02/02（一） 颁奖 09/02/27（五）"),
                ("2010", "入围名单 10/02/01（一） 颁奖 10/02/26（五）"),
            ],
        )
        self.assertEqual(
            dated[-1]["text"], "入围名单 10/11/01（一） 颁奖 10/11/26（五）"
        )
        texts = [b["text"] for b in blocks]
        for token in (
            "公布时间：2月以前完成的通告", "颁奖时间：2月最后一个星期",
            "公布时间：5月以前完成的通告", "颁奖时间：5月最后一个星期",
            "公布时间：8月以前完成的通告", "颁奖时间：8月最后一个星期",
            "公布时间：11月以前完成的通告", "颁奖时间：11月最后一个星期",
            "入围名单 08/05/05（一） 颁奖 08/05/30（五）",
            "入围名单 09/08/03（一） 颁奖 09/08/28（五）",
        ):
            self.assertIn(token, texts, token)
        awards = [b["text"] for b in blocks if b.get("bullet")]
        self.assertEqual(len(awards), 15)
        self.assertEqual(awards[:3], ["最上镜头奖", "最佳模特儿奖", "最佳代言人奖"])
        self.assertEqual(
            awards[-4:], ["最佳女配角奖", "最佳男配角奖", "最佳女主角奖", "最佳男主角奖"]
        )

    def test_romance_endings(self) -> None:
        node = next(
            n for c in self.data["categories"] for n in c["children"]
            if n["id"] == "sweet-guide/romance-endings"
        )
        blocks = node["blocks"]
        self.assertEqual(node["title"], "感情结局（结婚图取得条件）")
        self.assertNotIn("description", node)
        # 资料页没有事件块，不进追踪器。
        self.assertFalse(any(b["kind"] == "event" for b in blocks))
        self.assertEqual(
            [b["text"] for b in blocks if b["kind"] == "section"],
            ["沈惟真结婚", "丹尼斯结婚", "史蒂芬结婚", "姚子奇结婚",
             "慕容和希结婚", "卫亚结婚", "纪翔结婚", "城仲瑄结婚"],
        )
        self.assertEqual(
            [b["text"] for b in blocks if b.get("label") == "角色"],
            ["沈惟真", "丹尼斯", "史蒂芬", "姚子奇", "慕容和希", "卫亚", "纪翔", "城仲瑄"],
        )
        notes = [b["text"] for b in blocks if b["kind"] == "note"]
        self.assertEqual(len(notes), 3)
        self.assertIn("开启感情结局", notes[0])
        self.assertIn("艺人不在旗下就不会有结婚图", notes[-1])

        conditions = [b["text"] for b in blocks if b.get("bullet")]
        self.assertEqual(len(conditions), 28)
        for token in (
            "收到喜欢的礼物10个以上", "沈惟真称号在实力派以上",
            "沈惟真曾以愉快的心情坦承与杜云芊在交往",
            "SD从来没解散过", "丹尼斯的称号为天王巨星", "杜云芊得过戏剧类的个人奖",
            "SD已经解散了", "收到喜欢的礼物20个以上", "杜云芊得过音乐类的个人奖项",
            "跟杜云芊度过情人节，并有看到事件图", "跟杜云芊度过圣诞节",
            "杜云芊出过3张以上唱片", "杜云芊得过音乐类的奖项（团体可）",
            "慕容和希得过音乐类的奖项（团体可）", "杜云芊举办过个人巡回演唱会",
            "杜云芊录制自创的唱片通告并上市", "杜云芊的才智900以上",
            "跟杜云芊合作过舞台剧并公开演出", "约会次数40次以上", "杜云芊称号为超级天后",
            "公司结局为顶尖国际经纪公司或迈向国际的经纪公司", "公司自制作品10个以上",
        ):
            self.assertIn(token, conditions, token)
        self.assertNotIn("慕蓉", " ".join(b["text"] for b in blocks))

    def test_murong_hexi_guide(self) -> None:
        nodes = {
            n["id"].split("/")[-1]: n
            for c in self.data["categories"] for n in c["children"]
        }
        blocks = nodes["murong-hexi"]["blocks"]
        # 只加备注字段，不插块、不改事件编号（追踪器按原始下标存进度）。
        self.assertEqual(len(blocks), 207)
        events = [b for b in blocks if b["kind"] == "event"]
        self.assertEqual(len(events), 44)
        annotated = {b["label"]: b["eventNotes"] for b in events if b.get("eventNotes")}
        self.assertEqual(
            list(annotated), ["3-1", "4-1", "4-4", "5-8", "6-3", "7-4", "8-1", "9-5"]
        )
        self.assertTrue(all(g["title"] == "艺人攻略补充" for gs in annotated.values() for g in gs))

        def note_text(label: str) -> str:
            return "\n".join(
                item["label"] + item["text"]
                for group in annotated[label] for item in group["items"]
            )

        self.assertIn("约会开启条件：和慕容和希约会>5次", note_text("3-1"))
        self.assertIn("事件图：慕容和希02", note_text("4-1"))
        self.assertIn("事件图：慕容和希03", note_text("4-4"))
        self.assertIn("告白分支：回答「因为我喜欢你」后，接下来3个月", note_text("5-8"))
        self.assertIn("触发条件：邀约被拒>6次", note_text("6-3"))
        self.assertIn("事件图：慕容和希04", note_text("7-4"))
        self.assertIn("支线门槛：公司金钱>300万", note_text("8-1"))
        self.assertIn("剧本取得：取得剧本后指定希奇拍摄才会触发", note_text("8-1"))
        self.assertIn("暧昧事件（2-6）", note_text("8-1"))
        self.assertIn("假戏真做（7-13）", note_text("8-1"))
        self.assertIn("完成奖励：完成本支线可得创作", note_text("8-1"))
        self.assertIn("事件图：慕容和希07", note_text("9-5"))
        self.assertIn("事业结局：撮合希奇（事业结局《腐女大本营》必要条件）", note_text("9-5"))

        texts = [b["text"] for b in blocks]
        self.assertIn("提示：电影票房30万以上才会触发。", texts)
        self.assertFalse(any("30亿" in t for t in texts))
        # 角色页都读同一份备注表，目前只有这八页有条目。
        others = [
            slug for slug, node in nodes.items()
            if slug not in ("murong-hexi", "wei-ya", "ji-xiang", "cheng-zhongxuan",
                            "shi-difen", "yao-ziqi", "danisi", "shen-weizhen")
            and node["id"].startswith("sweet-characters/")
            and any(b.get("eventNotes") for b in node["blocks"])
        ]
        self.assertEqual(others, [])

    def test_wei_ya_guide(self) -> None:
        nodes = {
            n["id"].split("/")[-1]: n
            for c in self.data["categories"] for n in c["children"]
        }
        blocks = nodes["wei-ya"]["blocks"]
        # 只加备注字段，不插块、不改事件编号（追踪器按原始下标存进度）。
        self.assertEqual(len(blocks), 206)
        self.assertEqual(sum(b["kind"] == "event" for b in blocks), 40)
        annotated = {b["label"]: b["eventNotes"] for b in blocks
                     if b["kind"] == "event" and b.get("eventNotes")}
        self.assertEqual(
            list(annotated), ["3-1", "4-1", "4-4", "5-1", "6-3", "6-5", "8-2"]
        )
        self.assertTrue(all(g["title"] == "艺人攻略补充" for gs in annotated.values() for g in gs))

        def note_text(label: str) -> str:
            return "\n".join(
                item["label"] + item["text"]
                for group in annotated[label] for item in group["items"]
            )

        self.assertIn("约会开启条件：和卫亚约会>5且颇有好感", note_text("3-1"))
        self.assertIn("分支提示：选择以工作为主，会走退出支线", note_text("4-1"))
        self.assertIn("事件图：卫亚03", note_text("4-4"))
        self.assertIn("分支提示：选择给卫亚多一点时间，则走书卷奖支线", note_text("5-1"))
        self.assertIn("事件图：卫亚04", note_text("6-3"))
        self.assertIn("剧情提示：表现太小气，将来可是拿不到纱雪的创作", note_text("6-5"))
        self.assertIn("事件图：卫亚05", note_text("8-2"))

    def test_ji_xiang_guide(self) -> None:
        nodes = {
            n["id"].split("/")[-1]: n
            for c in self.data["categories"] for n in c["children"]
        }
        blocks = nodes["ji-xiang"]["blocks"]
        # 只加备注字段，不插块、不改事件编号（追踪器按原始下标存进度）。
        self.assertEqual(len(blocks), 201)
        self.assertEqual(sum(b["kind"] == "event" for b in blocks), 43)
        annotated = {b["label"]: b["eventNotes"] for b in blocks
                     if b["kind"] == "event" and b.get("eventNotes")}
        self.assertEqual(
            list(annotated), ["2-1", "2-4", "5-2", "6-5", "7-6", "8-2", "9-1"]
        )
        self.assertTrue(all(g["title"] == "艺人攻略补充" for gs in annotated.values() for g in gs))

        def note_text(label: str) -> str:
            return "\n".join(
                item["label"] + item["text"]
                for group in annotated[label] for item in group["items"]
            )

        self.assertIn("约会开启条件：和纪翔约会>6且很有好感", note_text("2-1"))
        self.assertIn("交给金皓薰处理（2-2～2-5）", note_text("2-1"))
        self.assertIn("都不处理（4-1～4-3）", note_text("2-1"))
        self.assertIn("选「还是很介意」进入第二轮", note_text("2-4"))
        self.assertIn("事件图：纪翔02", note_text("5-2"))
        self.assertIn("第二轮会出现「还有机会」", note_text("6-5"))
        self.assertIn("事件图：纪翔06", note_text("7-6"))
        self.assertIn("事件图：纪翔05", note_text("8-2"))
        self.assertIn("事件图：纪翔07", note_text("9-1"))

    def test_cheng_zhongxuan_guide(self) -> None:
        nodes = {
            n["id"].split("/")[-1]: n
            for c in self.data["categories"] for n in c["children"]
        }
        blocks = nodes["cheng-zhongxuan"]["blocks"]
        # 只加备注字段，不插块、不改事件编号（追踪器按原始下标存进度）。
        self.assertEqual(len(blocks), 186)
        self.assertEqual(sum(b["kind"] == "event" for b in blocks), 37)
        annotated = {b["label"]: b["eventNotes"] for b in blocks
                     if b["kind"] == "event" and b.get("eventNotes")}
        self.assertEqual(list(annotated), ["4-1", "6-2", "8-2"])
        self.assertTrue(all(g["title"] == "艺人攻略补充" for gs in annotated.values() for g in gs))

        def note_text(label: str) -> str:
            return "\n".join(
                item["label"] + item["text"]
                for group in annotated[label] for item in group["items"]
            )

        self.assertIn("约会开启条件：和城仲瑄约会>10", note_text("4-1"))
        self.assertIn("后续影响：此事件触发后，接下来1-2月对城仲瑄邀约皆会失败", note_text("4-1"))
        self.assertIn("事件图：城仲瑄02", note_text("6-2"))
        self.assertIn("事件图：城仲瑄05", note_text("8-2"))

    def test_shi_difen_guide(self) -> None:
        nodes = {
            n["id"].split("/")[-1]: n
            for c in self.data["categories"] for n in c["children"]
        }
        blocks = nodes["shi-difen"]["blocks"]
        # 只加备注字段，不插块、不改事件编号（追踪器按原始下标存进度）。
        self.assertEqual(len(blocks), 189)
        self.assertEqual(sum(b["kind"] == "event" for b in blocks), 43)
        annotated = {b["label"]: b["eventNotes"] for b in blocks
                     if b["kind"] == "event" and b.get("eventNotes")}
        self.assertEqual(list(annotated), ["2-7", "4-2", "4-3", "5-1", "5-3"])
        self.assertTrue(all(g["title"] == "艺人攻略补充" for gs in annotated.values() for g in gs))

        def note_text(label: str) -> str:
            return "\n".join(
                item["label"] + item["text"]
                for group in annotated[label] for item in group["items"]
            )

        self.assertIn("触发方式：探班（在电视或电影公司）", note_text("2-7"))
        self.assertIn("约会条件：和史蒂芬约会>10且很有好感", note_text("4-2"))
        self.assertIn("后续触发：本事件触发>3次才会有后续事件", note_text("4-2"))
        self.assertIn("事件图：史蒂芬02", note_text("4-3"))
        self.assertIn("团体举办海外巡回演唱会才会触发，个人巡回演唱会不会触发", note_text("5-1"))
        self.assertIn("事件图：史蒂芬04", note_text("5-3"))

    def test_yao_ziqi_guide(self) -> None:
        nodes = {
            n["id"].split("/")[-1]: n
            for c in self.data["categories"] for n in c["children"]
        }
        blocks = nodes["yao-ziqi"]["blocks"]
        # 只加备注字段，不插块、不改事件编号（追踪器按原始下标存进度）。
        self.assertEqual(len(blocks), 228)
        self.assertEqual(sum(b["kind"] == "event" for b in blocks), 40)
        annotated = {b["label"]: b["eventNotes"] for b in blocks
                     if b["kind"] == "event" and b.get("eventNotes")}
        self.assertEqual(list(annotated), ["4-1", "5-8", "8-1", "8-5", "9-2"])
        self.assertTrue(all(g["title"] == "艺人攻略补充" for gs in annotated.values() for g in gs))

        def note_text(label: str) -> str:
            return "\n".join(
                item["label"] + item["text"]
                for group in annotated[label] for item in group["items"]
            )

        self.assertIn("约会开启条件：和姚子奇约会>5且颇有好感", note_text("4-1"))
        self.assertIn("和慕容和希约会>15次", note_text("5-8"))
        self.assertIn("2008/8/1-8/30", note_text("8-1"))
        self.assertIn("2010/8/10-9/7", note_text("8-1"))
        self.assertIn("2009/8/20-9/18", note_text("8-5"))
        self.assertIn("事件图：姚子奇03", note_text("8-5"))
        self.assertIn("事件图：姚子奇05", note_text("9-2"))
        self.assertIn("邀约其他人都失败", note_text("9-2"))

    def test_danisi_guide_notes(self) -> None:
        nodes = {
            n["id"].split("/")[-1]: n
            for c in self.data["categories"] for n in c["children"]
        }
        blocks = nodes["danisi"]["blocks"]
        # 只加备注字段，不插块、不改事件编号（追踪器按原始下标存进度）。
        self.assertEqual(len(blocks), 236)
        self.assertEqual(sum(b["kind"] == "event" for b in blocks), 51)
        annotated = {b["label"]: b["eventNotes"] for b in blocks
                     if b["kind"] == "event" and b.get("eventNotes")}
        self.assertEqual(list(annotated), ["2-4", "3-2", "7-3", "7-6", "8-4", "8-5"])
        self.assertTrue(all(g["title"] == "艺人攻略补充" for gs in annotated.values() for g in gs))

        def note_text(label: str) -> str:
            return "\n".join(
                item["label"] + item["text"]
                for group in annotated[label] for item in group["items"]
            )

        self.assertIn("林芬芬还没分手前是无法邀约", note_text("2-4"))
        self.assertIn("约会开启条件：和丹尼斯约会>10", note_text("3-2"))
        self.assertIn("事件图：丹尼斯05", note_text("7-3"))
        self.assertIn("触发事件14", note_text("7-6"))
        self.assertIn("没去探病则走8-2", note_text("8-4"))
        self.assertIn("事件图：丹尼斯03", note_text("8-5"))

    def test_shen_weizhen_guide_notes(self) -> None:
        nodes = {
            n["id"].split("/")[-1]: n
            for c in self.data["categories"] for n in c["children"]
        }
        blocks = nodes["shen-weizhen"]["blocks"]
        self.assertEqual(len(blocks), 190)
        self.assertEqual(sum(b["kind"] == "event" for b in blocks), 36)
        annotated = {b["label"]: b["eventNotes"] for b in blocks
                     if b["kind"] == "event" and b.get("eventNotes")}
        self.assertEqual(list(annotated), ["2-1", "3-5", "4-1", "4-6", "5-2", "6-3", "7-4"])
        self.assertTrue(all(g["title"] == "艺人攻略补充" for gs in annotated.values() for g in gs))

        def note_text(label: str) -> str:
            return "\n".join(
                item["label"] + item["text"]
                for group in annotated[label] for item in group["items"]
            )

        self.assertIn("事件图：沈惟真03", note_text("2-1"))
        self.assertIn("触发方式：探班", note_text("3-5"))
        self.assertIn("约会开启条件：和沈惟真约会>5且云芊才智>550", note_text("4-1"))
        self.assertIn("事件图：沈惟真06", note_text("4-6"))
        self.assertIn("连续两周邀约失败", note_text("4-6"))
        self.assertIn("事件图：沈惟真04", note_text("5-2"))
        self.assertIn("八卦记者质问", note_text("5-2"))
        self.assertIn("触发方式：探班", note_text("6-3"))
        self.assertIn("事件图：沈惟真05", note_text("7-4"))

    def test_reference_pages_updates(self) -> None:
        nodes = {
            n["id"].split("/")[-1]: n
            for c in self.data["categories"] for n in c["children"]
        }

        def texts(slug: str) -> list[str]:
            return [b["text"] for b in nodes[slug]["blocks"]]

        # 约会页：总则与地点素质 + 八位艺人守则 + 圣诞真值。
        date_blocks = nodes["dating-guide"]["blocks"]
        self.assertEqual(len(date_blocks), 129)
        self.assertEqual(nodes["dating-guide"]["description"], "艺人约会教战守则")
        self.assertIn("约会地点素质相关", texts("dating-guide"))
        self.assertIn("植物园：压力↓、疲劳↓", texts("dating-guide"))
        self.assertIn("海生馆：压力↓、动感↑", texts("dating-guide"))
        for artist in ("沈惟真", "丹尼斯", "史蒂芬", "姚子奇", "慕容和希", "卫亚", "纪翔", "城仲瑄"):
            self.assertIn(artist, texts("dating-guide"), artist)
        self.assertTrue(any("特殊约会不受连续约会的限制（原文标注??）" in t
                            for t in texts("dating-guide")))
        self.assertIn("2.该艺人12月24日当天没有特殊行程和约会", texts("dating-guide"))
        self.assertTrue(any("旗下艺人之中最高的" in t for t in texts("dating-guide")))

        # 签约页：补齐签约事件流程，史蒂芬合约特殊要求为「无」。
        self.assertEqual(len(nodes["signing"]["blocks"]), 133)
        for name in ("雨中重逢", "我们看错了贺总", "姚子奇02", "城仲瑄04", "子奇交给你我就放心了"):
            self.assertTrue(any(name in t for t in texts("signing")), name)
        self.assertTrue(any("史蒂芬无" in t for t in texts("signing")))

        # 称号真值修正：国际名模需时装秀1、戏剧天王奖项正确、顶级称号条件完整。
        self.assertTrue(any("国际名模－广告15、时装秀1" in t for t in texts("titles")))
        self.assertTrue(any("电视剧7、总数10" in t and "金像奖最佳主角或金钟奖最佳演员" in t
                            for t in texts("titles")))
        self.assertTrue(any("超级天后、超级天王（1）" in t for t in texts("titles")))
        self.assertTrue(any("大型演唱会2、国外舞台剧1、时装秀1" in t for t in texts("titles")))

        # 公司改建 / 主线：金额单位与八卦讨论地点按用户真值。
        self.assertTrue(any("公司金钱1500万以上才会触发" in t for t in texts("company")))
        self.assertTrue(any("永振主持通告旁四人组、SOSA孙小美旁四人组会讨论" in t
                            for t in texts("main-story")))
        # 主线是事件页，正文改字不插块，追踪下标不变。
        self.assertEqual(len(nodes["main-story"]["blocks"]), 80)

    def test_creation_and_profile_pages(self) -> None:
        nodes = {
            n["id"].split("/")[-1]: n
            for c in self.data["categories"] for n in c["children"]
        }

        # 创作总表：每位艺人一节 + 一张四列表，85 条创作都保留取得条件。
        creation = nodes["creations"]["blocks"]
        self.assertEqual(len(creation), 18)
        tables = [b for b in creation if b["kind"] == "table"]
        self.assertEqual(len(tables), 9)
        self.assertEqual([c["label"] for c in tables[0]["table"]["columns"]],
                         ["种类", "名称", "模式", "取得条件"])
        rows = [row for t in tables for row in t["table"]["rows"]]
        self.assertEqual(len(rows), 85)
        self.assertTrue(all(len(row) == 4 for row in rows))
        names = {row["name"] for row in rows}
        for name in ("晴天娃娃", "温柔时刻", "没有雪的耶诞节", "寂寞国度",
                     "秋草旧长营", "异世界神话", "烟花下的你"):
            self.assertIn(name, names)

        # 特殊创作：10 组作品 / 78 个事件，末尾事件与关键门槛都在。
        special = nodes["special-creations"]["blocks"]
        self.assertEqual(len(special), 272)
        self.assertEqual(sum(b["kind"] == "section" for b in special), 10)
        self.assertEqual(sum(b["kind"] == "event" for b in special), 78)
        texts = [b["text"] for b in special]
        for name in ("温柔时刻（丹尼斯·林芬芬）", "从接吻开始（丹尼斯）",
                     "寂寞微光（卫亚·新名纱雪）", "烟花下的你（纪翔）"):
            self.assertIn(name, texts)
        self.assertIn("一切都是你的功劳", texts)
        self.assertTrue(any("和纪翔约会>5次且颇有好感" in t for t in texts))
        self.assertTrue(any("票房>30万才会触发" in t for t in texts))

        # 艺人资料并入各艺人攻略页头部（profile 字段），不再单独成页。
        self.assertNotIn("artist-profiles", nodes)
        by_name = {
            ("杜云芊" if slug == "main-story" else n["title"]): n["profile"]
            for slug, n in nodes.items() if n.get("profile")
        }
        self.assertEqual(
            set(by_name),
            {"杜云芊", "沈惟真", "丹尼斯", "史蒂芬", "姚子奇",
             "慕容和希", "卫亚", "纪翔", "城仲瑄"},
        )
        shen = by_name["沈惟真"]
        self.assertEqual(
            [(r["label"], r["value"]) for r in shen["rows"]],
            [("年龄", "22"), ("生日", "2/1"), ("星座", "水瓶"),
             ("身高", "176"), ("体重", "67"), ("演唱会", "沈惟真演唱会")],
        )
        self.assertIn("大学学长", shen["intro"]["value"])
        self.assertEqual(shen["contract"]["title"], "合约内容（第一年签约时）")
        self.assertEqual(
            {r["label"]: r["value"] for r in shen["contract"]["rows"]},
            {"签约金": "50万", "艺人分红": "20%", "特殊要求": "跟欣赏的艺人合作",
             "目标": "当个全方位艺人、接下国际时装秀的通告"},
        )
        self.assertEqual(by_name["史蒂芬"]["contract"]["rows"][2]["value"], "无")
        self.assertEqual(
            {r["label"]: r["value"] for r in by_name["城仲瑄"]["contract"]["rows"]}["签约金"],
            "0",
        )
        self.assertTrue(any(
            r["value"] == "不要跟慕容和希合作、有更多时间从事创作"
            for r in by_name["姚子奇"]["contract"]["rows"]
        ))
        self.assertNotIn("contract", by_name["杜云芊"])
        # 资料卡在 blocks 之外：角色页与主线的事件锚点、追踪下标不变。
        for slug, count in (("shen-weizhen", 190), ("danisi", 236), ("main-story", 80)):
            self.assertEqual(len(nodes[slug]["blocks"]), count, slug)

    def test_ids_unique(self) -> None:
        ids: list[str] = []

        def walk(node: dict) -> None:
            ids.append(node["id"])
            for child in node["children"]:
                walk(child)

        for category in self.data["categories"]:
            walk(category)
        self.assertEqual(len(ids), len(set(ids)), f"重复的节点 id：{ids}")


if __name__ == "__main__":
    unittest.main(verbosity=2)
