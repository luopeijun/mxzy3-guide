"""Build the CG gallery data + thumbnails from the local CG archive.

Two source files are kept in sync by index (both 204 rows):

* ``CG清单.csv``  — the renamed, human-readable image files and their labels
* ``manifest.json`` — stable ids (``main-1``, ``lin-2`` …) and group ordering

Both are byte-read and decoded here; never retype the Chinese labels, the
original file contains full-width punctuation that must survive untouched.

Group names, portraits and ordering come from ``guide.json``'s character nodes,
not from the CG archive: the archive has four misspelled artist names and a
different group order, and the guide is the authority for both.

Output: ``public/images/cg/<id>.webp`` (one file per CG, also used by the
lightbox) and ``public/data/cg.json`` (metadata loaded at runtime).
"""

from __future__ import annotations

import csv
import io
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "outputs" / "明星志愿3_CG图鉴"
OUT_IMAGES = ROOT / "public" / "images" / "cg"
OUT_DATA = ROOT / "public" / "data" / "cg.json"
GUIDE_DATA = ROOT / "public" / "data" / "guide.json"
# CG → 攻略页面（不带锚点）的手写映射，见文件头的说明。
NODE_LINKS = ROOT / "sources" / "cg-node-links.tsv"

MAX_EDGE = 1100
QUALITY = 76

# 「主线」是玩家扮演的经纪人本人的 CG，不是剧情线；画廊里按人物分组显示成「经纪人」。
GROUP_LABELS = {"主线": "经纪人"}

# 经纪人不是可签约艺人，攻略里没有对应的角色节点，所以头像不在 guide.json 里。
# 由用户提供的头像框素材裁成与其他角色一致的 145×145 后单独放这里。
AGENT_AVATAR = "images/characters/agent-logo.png"

# CG 原表有 4 个人名与攻略写法不同；分组名、头像、顺序一律以 guide.json
# 的角色节点为准，这里只做「原表名 → 攻略名」的桥接。
NAME_FIXES = {
    "萧伊莉": "萧依莉",
    "陈亦夫": "陈奕夫",
    "关谷威": "关古威",
    "原少伟": "原少纬",
}

# 原表除了上面 4 个整名，昵称与个别笔误也和攻略不一致；攻略（guide.json）里
# 这些错法都是零次、正字是唯一写法。只纠正输出文案（名称 / 获得条件），
# 不改源文件，也不影响 CSV / manifest 之间逐行一致性的校验。
#
# 顺序有意义：「萧伊莉」必须先于「伊莉」，否则简称规则会把整名改成「萧依莉」以外的样子。
TEXT_FIXES = {
    **NAME_FIXES,
    "伊莉": "依莉",       # xiao-1 / xiao-9 行首简写
    "少伟": "少纬",       # 原少纬的简称也被写错
    "克列斯": "克烈斯",   # ji-10 的「克列斯攻略」
    "莉玲": "莉铃",       # 秘书莉铃
    "郝有乾": "郝友乾",   # chen-4「嫚君和郝有乾的绯闻」，攻略统一「郝友乾」
}


def fix_text(value: str) -> str:
    for wrong, right in TEXT_FIXES.items():
        value = value.replace(wrong, right)
    return value


def read_text(path: Path) -> str:
    return path.read_bytes().decode("utf-8-sig")


def guide_characters() -> list[dict]:
    """Authoritative artist roster (name / portrait / node id) from guide.json."""
    guide = json.loads(read_text(GUIDE_DATA))
    found: list[dict] = []

    def walk(value: object) -> None:
        if isinstance(value, dict):
            if value.get("avatar") and value.get("id"):
                found.append({
                    "name": value["title"],
                    "avatar": value["avatar"],
                    "guideId": value["id"],
                })
            for child in value.values():
                walk(child)
        elif isinstance(value, list):
            for child in value:
                walk(child)

    walk(guide)
    return found


def guide_node_titles() -> dict[str, str]:
    """全部攻略节点 id → 标题，用来校验 / 展开 CG 的页面级跳转。"""
    titles: dict[str, str] = {}
    for node_id, node in guide_nodes().items():
        titles[node_id] = node["title"]
    return titles


def guide_nodes() -> dict[str, dict]:
    """全部攻略节点 id → 节点（带 blocks），用来把「事件号 + 章节」解析成锚点。"""
    nodes: dict[str, dict] = {}
    guide = json.loads(read_text(GUIDE_DATA))

    def walk(value: object) -> None:
        if isinstance(value, dict):
            if value.get("id") and value.get("blocks") is not None:
                nodes[value["id"]] = value
            for child in value.values():
                walk(child)
        elif isinstance(value, list):
            for child in value:
                walk(child)

    walk(guide)
    return nodes


def event_anchor(node: dict, label: str, chapter: str, where: str) -> str:
    """按「事件号 + 章节」定位事件块，返回 `ev<块下标>`。

    章节取**最内层标题**（section / heading，含 ☆ 子标题）：同一个事件号在一个节点里
    会重号（纱雪「事件5」在「签约方法」和「与律师的事件」各有一个），不写章节就没法定位。
    """
    chapter_now = ""
    hits: list[int] = []
    for index, block in enumerate(node["blocks"]):
        if block["kind"] in ("section", "heading"):
            chapter_now = block["text"]
        if block["kind"] != "event" or block.get("label") != label:
            continue
        if chapter and chapter_now != chapter:
            continue
        hits.append(index)
    if not hits:
        raise SystemExit(f"{where}: no such event #{label}" + (f" @ {chapter}" if chapter else ""))
    if len(hits) > 1:
        raise SystemExit(f"{where}: ambiguous #{label}, add the chapter column")
    return f"ev{hits[0]}"


def apply_node_links(items: list[dict], titles: dict[str, str]) -> int:
    """把 ``sources/cg-node-links.tsv`` 的「CG → 攻略页面」写进 items。

    默认整组跳页面、不带事件锚点：路欧桑剧情整理把同一段感情线按情况1~5 各写了一遍，
    一张 CG 往往对应三四个分支里的同一个事件，锚到哪个都不对。

    但「美丽之星写真集」这类是 18 张不同的图共用**同一个**事件（#14），落点唯一，
    所以第 4、5 列可以写事件号 + 章节（章节可省），锚到那个事件上。
    """
    by_id = {item["id"]: item for item in items}
    nodes = guide_nodes()
    count = 0
    if not NODE_LINKS.is_file():
        return count
    for number, raw in enumerate(read_text(NODE_LINKS).splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        fields = [field.strip() for field in line.split("\t")]
        if len(fields) < 2 or not fields[0] or not fields[1]:
            raise SystemExit(f"cg-node-links.tsv:{number}: expected cg id + node id")
        cg_id, node_id = fields[0], fields[1]
        label = fields[3] if len(fields) > 3 else ""
        chapter = fields[4] if len(fields) > 4 else ""
        where = f"cg-node-links.tsv:{number}"
        if cg_id not in by_id:
            raise SystemExit(f"{where}: unknown cg {cg_id}")
        if node_id not in titles:
            raise SystemExit(f"{where}: unknown guide node {node_id}")
        link: dict[str, str] = {"nodeId": node_id, "title": titles[node_id]}
        if label:
            link["anchor"] = event_anchor(nodes[node_id], label, chapter, where)
        by_id[cg_id]["guide"] = link
        count += 1
    return count


def main() -> None:
    manifest = json.loads(read_text(SRC / "manifest.json"))
    rows = list(csv.DictReader(io.StringIO(read_text(SRC / "CG清单.csv"))))
    if len(manifest) != len(rows):
        raise SystemExit(f"manifest {len(manifest)} rows != csv {len(rows)} rows")
    if not (ROOT / "public" / AGENT_AVATAR).is_file():
        raise SystemExit(f"missing agent portrait: {AGENT_AVATAR}")

    characters = guide_characters()
    by_name = {entry["name"]: entry for entry in characters}
    if len(by_name) != len(characters):
        raise SystemExit("duplicate artist names in guide.json")

    OUT_IMAGES.mkdir(parents=True, exist_ok=True)
    for stale in OUT_IMAGES.glob("*.webp"):
        stale.unlink()

    groups: dict[str, dict] = {}
    items: list[dict] = []
    total_bytes = 0

    for index, (meta, row) in enumerate(zip(manifest, rows), start=1):
        # Guard against the two files ever drifting out of order.
        for csv_key, meta_key in (
            ("人物", "group"),
            ("编号", "title"),
            ("CG名称", "desc"),
            ("获得条件", "condition"),
        ):
            if row[csv_key] != meta[meta_key]:
                raise SystemExit(
                    f"row {index}: {csv_key}={row[csv_key]!r} != {meta_key}={meta[meta_key]!r}"
                )

        item_id: str = meta["id"]
        group_id = item_id.rsplit("-", 1)[0]
        group_name = meta["group"]
        if group_id not in groups:
            if group_name == "主线":
                group = {
                    "id": group_id,
                    "name": GROUP_LABELS[group_name],
                    "kind": "agent",
                    "avatar": AGENT_AVATAR,
                    "count": 0,
                }
            else:
                display = NAME_FIXES.get(group_name, group_name)
                reference = by_name.get(display)
                if reference is None:
                    raise SystemExit(
                        f"row {index}: CG group {group_name!r} -> {display!r} "
                        "not found in guide.json"
                    )
                group = {
                    "id": group_id,
                    "name": reference["name"],
                    "kind": "artist",
                    "avatar": reference["avatar"],
                    "guideId": reference["guideId"],
                    "count": 0,
                }
            groups[group_id] = group
        groups[group_id]["count"] += 1

        saved_path = row["保存路径"].strip()
        if saved_path:
            image_path = SRC / saved_path
            if not image_path.is_file():
                raise SystemExit(f"row {index}: missing image {image_path}")
            with Image.open(image_path) as opened:
                image = opened.convert("RGB")
                image.thumbnail((MAX_EDGE, MAX_EDGE), Image.LANCZOS)
                width, height = image.size
                target = OUT_IMAGES / f"{item_id}.webp"
                image.save(target, "WEBP", quality=QUALITY, method=6)
            total_bytes += target.stat().st_size
            image_url: str | None = f"images/cg/{item_id}.webp"
        else:
            # 「站点未提供图片」：保留编号 / 名称 / 获得条件，画廊里显示占位格，
            # 这样图鉴的 204 个位置和收集进度仍然完整。
            if row["状态"] != "站点未提供图片":
                raise SystemExit(f"row {index}: empty image path but status={row['状态']!r}")
            width = height = 0
            image_url = None

        items.append(
            {
                "id": item_id,
                "groupId": group_id,
                "order": meta["order"],
                "code": meta["title"],
                "name": fix_text(meta["desc"]),
                "condition": fix_text(meta["condition"]),
                "image": image_url,
                "width": width,
                "height": height,
            }
        )

    # 分组顺序跟随攻略角色顺序（经纪人在最前），items 也按同一套次序排，
    # 侧栏与「全部」网格才不会是两套人物次序。
    rank = {entry["guideId"]: index for index, entry in enumerate(characters)}
    ordered = sorted(
        groups.values(),
        key=lambda group: -1 if group["kind"] == "agent" else rank[group["guideId"]],
    )
    group_rank = {group["id"]: index for index, group in enumerate(ordered)}
    items.sort(key=lambda item: (group_rank[item["groupId"]], item["order"]))

    covered = {group["guideId"] for group in ordered if group["kind"] == "artist"}
    missing = [entry["name"] for entry in characters if entry["guideId"] not in covered]
    if missing:
        raise SystemExit(f"guide artists without a CG group: {missing}")

    node_links = apply_node_links(items, guide_node_titles())

    payload = {
        "version": 1,
        "meta": {
            "itemCount": len(items),
            "groupCount": len(groups),
            "missingImageCount": sum(1 for item in items if item["image"] is None),
        },
        "groups": ordered,
        "items": items,
    }
    OUT_DATA.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(
        f"wrote {OUT_DATA.relative_to(ROOT)}: {len(items)} items / {len(groups)} groups, "
        f"images {total_bytes / 1024 / 1024:.1f} MB"
    )
    print(f"cg -> guide node links: {node_links}")


if __name__ == "__main__":
    main()
