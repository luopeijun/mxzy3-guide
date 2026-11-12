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
        self.assertEqual(stats["readyItems"], 10)
        self.assertEqual(stats["missingItems"], 14)

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

    def test_career_endings(self) -> None:
        node = _node(self.data, "career-endings")
        blocks = node["blocks"]
        self.assertNotIn("description", node)  # 首行与页面标题同名

        # 前 11 条事业结局：结局名进卡头，条件单列一行。
        cards = [b["text"] for b in blocks if b["kind"] == "event"]
        self.assertEqual(len(cards), 11)
        self.assertEqual((cards[0], cards[-1]), ("天王巨星", "公司倒闭"))

        # 「巨星条件」之后是四个块，各自一个小标题。
        self.assertEqual([b["text"] for b in blocks if b["kind"] == "section"], ["巨星条件"])
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

        # 结婚清单：一个角色一张卡，续行留在同一张卡里。
        self.assertEqual(
            [b["text"] for b in blocks if b["kind"] == "event" and "label" not in b],
            ["沈惟真", "丹尼斯", "史蒂芬", "姚子奇", "慕容和希", "卫亚", "纪翔", "城仲瑄"],
        )
        by_group: dict[int, list[dict]] = {}
        for block in blocks:
            by_group.setdefault(block["group"], []).append(block)
        first = next(b for b in blocks if b["kind"] == "event" and b["text"] == "沈惟真")
        self.assertEqual(
            [b["text"] for b in by_group[first["group"]] if b["kind"] == "paragraph"],
            ["收到喜欢的礼物5个以上。", "邀约25次以上。", "沈惟真跟记者坦承与女主角交往"],
        )

        # 告白清单：角色当小标题，攻略本的事件编号进 pill。
        self.assertEqual(
            [b["text"] for b in blocks if b["kind"] == "heading"][:2], ["沈惟真", "丹尼斯"]
        )
        labels = [b["label"] for b in blocks if b["kind"] == "event" and "label" in b]
        self.assertEqual(len(labels), 22)
        self.assertEqual(labels[:3], ["4-1", "4-3", "4-5"])
        self.assertIn("7-10", labels)

        # d./e./f. 是「影响」的条目，不能并进上一张角色卡里。
        for prefix in ("d.告白相关事件门槛降低", "e.情人节邀约门槛降低。"):
            group = by_group[next(b for b in blocks if b["text"] == prefix)["group"]]
            self.assertEqual(group[0]["text"], prefix)
            self.assertNotIn("event", [b["kind"] for b in group])

    def test_favorite_gifts(self) -> None:
        node = _node(self.data, "favorite-gifts")
        blocks = node["blocks"]
        self.assertNotIn("description", node)
        self.assertEqual(
            [b["text"] for b in blocks if b["kind"] == "event"],
            ["沈惟真", "城仲瑄", "卫亚", "慕容和希", "姚子奇", "纪翔", "史蒂芬", "丹尼斯"],
        )
        self.assertEqual(len(blocks), 16)  # 8 个角色 ×（卡头 + 一行物品）

        by_group: dict[int, list[dict]] = {}
        for block in blocks:
            by_group.setdefault(block["group"], []).append(block)
        danisi = next(b for b in blocks if b["kind"] == "event" and b["text"] == "丹尼斯")
        items = by_group[danisi["group"]][1]["text"]
        # 原文写成「蓝色咖啡额」，多出来的「额」是错字，已补正。
        self.assertTrue(items.startswith("大宇啤酒、蓝色咖啡、海蓝色休闲头巾"), items[:24])
        self.assertNotIn("蓝色咖啡额", "".join(b["text"] for b in blocks))

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
