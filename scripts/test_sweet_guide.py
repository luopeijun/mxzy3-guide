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

    def test_committed_json_matches_build(self) -> None:
        committed = json.loads(GUIDE.read_text(encoding="utf-8"))
        self.assertEqual(committed, self.data, "guide.json 与脚本重算不一致，请重新生成")

    def test_category_is_broker_events(self) -> None:
        first = self.data["categories"][0]
        self.assertEqual(first["id"], "sweet-guide")
        self.assertEqual(first["title"], "经纪人事件簿")
        self.assertEqual(len(first["children"]), 10)
        self.assertNotIn("角色介绍", [n["title"] for n in first["children"]])
        self.assertNotIn("sweet-guide/intro", [n["id"] for n in first["children"]])

    def test_three_categories(self) -> None:
        self.assertEqual(
            [c["title"] for c in self.data["categories"]],
            ["经纪人事件簿", "角色攻略", "支线攻略"],
        )
        stats = self.data["meta"]["stats"]
        self.assertEqual(stats["categories"], 3)
        self.assertEqual(stats["items"], 24)
        self.assertEqual(stats["readyItems"], 18)
        self.assertEqual(stats["missingItems"], 6)

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
                    self.assertNotIn("著", text, f"残留「著」：{text}")

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
            [b["kind"] for b in blocks if b["text"].startswith("注：")], ["note"]
        )
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
            ],
        )
        self.assertEqual(
            [b["text"] for b in cheng if b["kind"] == "heading"],
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
        # 告白条件带事件编号：编号进 pill，条件跟在后面。
        self.assertEqual(cheng[-1]["label"], "6-2")
        self.assertTrue(cheng[-1]["text"].startswith("取消友好度检查"))

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
            self.assertEqual(len([b for b in blocks if b["kind"] == "heading"]), heads, slug)
            event_blocks = [b for b in blocks if b["kind"] == "event"]
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
