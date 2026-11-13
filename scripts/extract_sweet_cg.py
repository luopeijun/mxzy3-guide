"""Build the 甜蜜乐章 CG gallery from the organised source folder.

The source images arrive one by one with **no name and no unlock condition**;
the user sorts them into one folder per character::

    E:/Pictures/mxzy3/甜蜜乐章/cg/<人物名>/<原编号>.<bmp|png|jpg|webp>
        -> public/images/sweet-cg/<slug>/<原编号>.webp   (每个角色独立)
        -> public/images/sweet-cg/_shared/<md5前8位>.webp  (两人共用的同一张)
        -> public/data/sweet/cg.json

``<人物名>`` 是中文（杜云芊、丹尼斯…），脚本用 ``FOLDER_MAP`` 翻译成
攻略节点 slug（protagonist、danisi…）。``<原编号>`` 只是文件名，不参与展示——
展示用的「全新序号」由脚本按文件名**自然序**给每个角色重新从 1 编，所以图片文件名
用的是稳定的「原编号」而不是序号，以后调顺序只动 json 里的 order/code，不搬家图片。

**共用 CG**：整批文件按 MD5 去重。同一张图若出现在两个角色文件夹里（已确认只有
丹尼斯 / 史蒂芬 的 ``561-1``），只生成一张 webp（落在 ``_shared/``），两个角色的条目
共享同一个 ``collectionId``，于是「收集」只点一次就两边同时点亮。单纯游戏编号撞了、
但字节不同（杜云芊 / 沈 的 83-1、杜云芊 / 纪翔 的 125~128）不算共用，各自保留。

分组、圆形头像、guideId 全部来自 ``public/data/sweet/guide.json`` 的角色节点，和
``extract_cg.py`` 处理主站一样。条目带 id / group / order / code / image /
collectionId；``name`` 取「这张图对应的攻略事件标题」（见 ``cg_names()``，来源是
``guide.json`` 里挂了该 ``cgId`` 的块）；结局这类没有对应事件的 CG，名字手写在
``sources/sweet/cg-names.tsv``（见 ``apply_manual_names()``，手填优先），两边都没有
时留空；``condition`` 留空。
``width`` / ``height`` 恒为 0：画廊不消费它们，也避免 ``test_sweet_cg.py`` 依赖 Pillow。

**与攻略的映射**：``sources/sweet/cg-links.tsv`` 是唯一真源（由
``scripts/build_sweet_cg_links.py`` 从核对表 xlsx 生成）。正向（事件 → CG）由
``extract_sweet_guide.py`` 写到事件块的 ``cgIds``；这里只反向取事件标题当 CG 名，
所以**先跑 guide 抽取再跑本脚本**，否则名字会缺。
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
# 用户整理好的源目录；不存在时退化到仓库内（gitignored）的副本，保证脚本可移植。
PICTURES_SOURCE = Path(r"E:/Pictures/mxzy3/甜蜜乐章/cg")
FALLBACK_SOURCE = ROOT / "outputs" / "sweet-cg"
SRC = PICTURES_SOURCE if PICTURES_SOURCE.is_dir() else FALLBACK_SOURCE
OUT_IMAGES = ROOT / "public" / "images" / "sweet-cg"
OUT_GROUPS = ROOT / "public" / "data" / "sweet" / "cg.json"
GUIDE_DATA = ROOT / "public" / "data" / "sweet" / "guide.json"
# 用户导出的「人物内 CG 顺序」——由应用里「导出顺序」下载，是顺序的唯一真源。
# 脚本生成 cg.json 时按它重排每个分组内的 order/code，使手动微调写死进数据；
# 之后重跑管线也不会把顺序冲掉。缺省（文件不存在）时退回自然序。
ORDER_OVERRIDE = ROOT / "public" / "data" / "sweet" / "sweet-cg-order.json"
# 没有对应攻略事件的 CG（结局类）的名字，手写在这张表里：cgId / 源图编号 / 名称。
# 源图编号就是 `public/images/sweet-cg/<人物>/<原编号>.webp` 的文件名，应用时核对，
# 顺序或编号漂移会直接报错而不是把名字贴到别的图上。
MANUAL_NAMES = ROOT / "sources" / "sweet" / "cg-names.tsv"
CHARACTER_CATEGORY = "sweet-characters"
IMAGE_EXTS = {".bmp", ".png", ".jpg", ".jpeg", ".webp", ".gif"}
MAX_EDGE = 1400
QUALITY = 82

# 源文件夹的中文名 -> 攻略节点 slug。杜云芊没有攻略节点，单独固定为 protagonist。
FOLDER_MAP = {
    "杜云芊": "protagonist",
    "丹尼斯": "danisi",
    "卫亚": "wei-ya",
    "史蒂芬": "shi-difen",
    "城仲瑄": "cheng-zhongxuan",
    "姚子奇": "yao-ziqi",
    "慕容": "murong-hexi",
    "沈": "shen-weizhen",
    "纪翔": "ji-xiang",
}

# 主角没有攻略节点，头像固定（620-1.bmp 转出来的那张，不是卫亚）。
PROTAGONIST = {
    "id": "protagonist",
    "name": "杜云芊",
    "kind": "agent",
    "avatar": "images/sweet/protagonist-logo.png",
    "guideId": "",
}

# 支线五位也有圆圈头像；确认她们有 CG 后把开关翻成 True，分组就会一起出现。
ENABLE_EXTRA_GROUPS = False
EXTRA_GROUPS = [
    ("tian-qing", "天晴"),
    ("xia-yijun", "夏以军"),
    ("du-sichen", "杜司臣"),
    ("xu-shijie", "徐世杰"),
    ("jin-haoxun", "金皓薰"),
]


def read_text(path: Path) -> str:
    return path.read_bytes().decode("utf-8-sig")


def md5_hex(path: Path) -> str:
    digest = hashlib.md5()
    digest.update(path.read_bytes())
    return digest.hexdigest()


def natural_key(code: str) -> list[object]:
    """`1`, `2`, `10` 而非 `1`, `10`, `2`；且对「1」与「561-1」这种混合型也能比较。

    每一项统一成 ``(类型, 数字, 文本)`` 三元组：纯数字段 type=0，文本段 type=1，
    因此任意两个 key 都可比，不会在 ``10-1``（首段空串）与 ``1``（首段 1）之间崩 TypeError。
    """
    parts: list[object] = []
    for token in re.split(r"(\d+)", code):
        if not token:
            continue
        if token.isdigit():
            parts.append((0, int(token), ""))
        else:
            parts.append((1, 0, token.lower()))
    return parts


def cg_names() -> dict[str, str]:
    """``cgId -> 事件标题``：从 ``guide.json`` 里挂了该 ``cgId`` 的块取正文。

    一张 CG 对应多个事件时取第一个（``setdefault``）；攻略还没生成 / 没做映射时
    返回空表，CG 名称就留空，画廊退化成只有编号。
    """
    if not GUIDE_DATA.is_file():
        return {}
    try:
        guide = json.loads(read_text(GUIDE_DATA))
    except (ValueError, OSError):
        return {}
    names: dict[str, str] = {}

    def walk(node: dict) -> None:
        for block in node.get("blocks") or []:
            for cg_id in block.get("cgIds") or []:
                names.setdefault(cg_id, block["text"])
        for child in node.get("children") or []:
            walk(child)

    for category in guide.get("categories") or []:
        walk(category)
    return names


def manual_names() -> dict[str, tuple[str, str]]:
    """``cgId -> (源图编号, 名称)``：结局这类没有对应事件的 CG 的手填名称。

    文件缺失时返回空表（画廊退回只有事件标题 + 编号）。``源图编号`` 是
    ``images/sweet-cg/<人物>/<原编号>.webp`` 的文件名，用来在应用时核对名字有没有
    贴错图；``shared-`` 开头的共用图没有人物目录下的原编号，本表不收。
    """
    if not MANUAL_NAMES.is_file():
        return {}
    table: dict[str, tuple[str, str]] = {}
    for raw in read_text(MANUAL_NAMES).splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split("\t")
        if len(parts) != 3:
            raise SystemExit(f"cg-names.tsv 格式错误（需要 3 列）：{line!r}")
        cg_id, source, name = (part.strip() for part in parts)
        if not cg_id or not source or not name:
            raise SystemExit(f"cg-names.tsv 有空列：{line!r}")
        if cg_id in table:
            raise SystemExit(f"cg-names.tsv 重复的 cgId：{cg_id}")
        table[cg_id] = (source, name)
    return table


def apply_manual_names(items: list[dict]) -> None:
    """把手填名称写进条目（手填优先于事件标题），并核对每行的源图编号。"""
    table = manual_names()
    if not table:
        return
    by_id = {item["id"]: item for item in items}
    for cg_id, (source, name) in table.items():
        item = by_id.get(cg_id)
        if item is None:
            raise SystemExit(f"cg-names.tsv 指向了不存在的 CG：{cg_id}")
        actual = Path(item["image"]).stem
        if item["collectionId"].startswith("shared-") or actual != source:
            raise SystemExit(
                f"cg-names.tsv 源图编号对不上：{cg_id} 期望 {source}，实际 {actual}"
            )
        item["name"] = name


def build_groups() -> list[dict]:
    guide = json.loads(read_text(GUIDE_DATA))
    category = next(
        (entry for entry in guide["categories"] if entry["id"] == CHARACTER_CATEGORY),
        None,
    )
    if category is None:
        raise SystemExit(f"missing category {CHARACTER_CATEGORY!r} in {GUIDE_DATA}")

    groups = [dict(PROTAGONIST)]
    for node in category.get("children", []):
        avatar = node.get("avatar")
        if not avatar:
            continue
        if not (ROOT / "public" / avatar).is_file():
            raise SystemExit(f"missing avatar for {node['id']}: {avatar}")
        groups.append({
            "id": node["id"].rsplit("/", 1)[-1],
            "name": node["title"],
            "kind": "artist",
            "avatar": avatar,
            "guideId": node["id"],
        })

    if ENABLE_EXTRA_GROUPS:
        for slug, name in EXTRA_GROUPS:
            avatar = f"images/sweet/{slug}-logo.png"
            if not (ROOT / "public" / avatar).is_file():
                raise SystemExit(f"missing avatar for extra group {slug}: {avatar}")
            groups.append({
                "id": slug,
                "name": name,
                "kind": "artist",
                "avatar": avatar,
                "guideId": f"sweet-side/{slug}",
            })

    if len({group["id"] for group in groups}) != len(groups):
        raise SystemExit("duplicate CG group ids")
    return groups


def scan_sources(groups: list[dict]) -> tuple[list[dict], dict[str, Path]]:
    """Return (items, image_jobs).

    ``items`` 已按「分组优先、组内按自然序」排好，可直接写进 cg.json。
    ``image_jobs`` 是 webp 路径 -> 源文件，共享图只出现一次。
    """
    known = {group["id"]: group for group in groups}
    folder_entries: dict[str, list[tuple[str, Path, str]]] = {}

    for folder in sorted(SRC.iterdir()) if SRC.is_dir() else []:
        if not folder.is_dir() or folder.name.startswith("."):
            continue
        if folder.name not in FOLDER_MAP:
            raise SystemExit(
                f"unknown CG group folder {folder.name!r}; expected one of "
                + ", ".join(FOLDER_MAP)
            )
        slug = FOLDER_MAP[folder.name]
        if slug not in known:
            raise SystemExit(f"folder {folder.name!r} maps to unknown group {slug!r}")

        by_code: dict[str, Path] = {}
        for source in folder.iterdir():
            if not source.is_file() or source.suffix.lower() not in IMAGE_EXTS:
                continue
            code = source.stem.strip()
            if not code:
                raise SystemExit(f"empty CG code: {source}")
            if code in by_code:
                raise SystemExit(
                    f"two images share the code {code!r} in {folder}: "
                    f"{by_code[code].name} and {source.name}"
                )
            by_code[code] = source

        # 同角色内若同一张图出现两次（不同扩展名等），按自然序保第一个、其余丢弃。
        entries: list[tuple[str, Path, str]] = []
        seen_md5: set[str] = set()
        for code in sorted(by_code, key=natural_key):
            source = by_code[code]
            digest = md5_hex(source)
            if digest in seen_md5:
                continue
            seen_md5.add(digest)
            entries.append((code, source, digest))
        folder_entries[slug] = entries

    # 全局 MD5 -> 出现于哪些角色；>1 个角色即「共用 CG」，共享一个收集位。
    md5_slugs: dict[str, set[str]] = defaultdict(set)
    for slug, entries in folder_entries.items():
        for _code, _source, digest in entries:
            md5_slugs[digest].add(slug)

    items: list[dict] = []
    image_jobs: dict[str, Path] = {}
    seen_ids: set[str] = set()

    for slug, entries in folder_entries.items():
        for seq, (code, source, digest) in enumerate(entries, start=1):
            slugs = sorted(md5_slugs[digest])
            shared = len(slugs) > 1
            if shared:
                collection_id = f"shared-{digest[:8]}"
                image = f"images/sweet-cg/_shared/{digest[:8]}.webp"
            else:
                collection_id = f"{slug}-{seq}"
                image = f"images/sweet-cg/{slug}/{code}.webp"
            item_id = f"{slug}-{seq}"
            if item_id in seen_ids:
                raise SystemExit(f"duplicate CG id {item_id!r}")
            seen_ids.add(item_id)
            items.append({
                "id": item_id,
                "groupId": slug,
                "order": seq,
                "code": f"CG {seq:02d}",
                "name": "",
                "condition": "",
                "image": image,
                "collectionId": collection_id,
                "width": 0,
                "height": 0,
            })
            image_jobs.setdefault(image, source)

    # 重新按「分组优先、组内按序号」排，画廊按数组顺序渲染。
    items = apply_order_override(items, groups)
    names = cg_names()
    for item in items:
        item["name"] = names.get(item["id"], "")
    # 手填的结局名称排在后面：与事件标题冲突时以手填为准（本表就是为「没有事件可取名」
    # 的条目准备的，显式写下的一定是想要的）。
    apply_manual_names(items)
    ordered: list[dict] = []
    for group in groups:
        ordered.extend(sorted(
            (it for it in items if it["groupId"] == group["id"]),
            key=lambda it: it["order"],
        ))
    return ordered, image_jobs


def apply_order_override(items: list[dict], groups: list[dict]) -> list[dict]:
    """把 ``sweet-cg-order.json`` 里的顺序写死进 items 的 ``order`` / ``code``。

    覆盖文件按 ``groupId -> [itemId...]`` 给出期望序列；命中覆盖的条目按该序列重排
    并连续编号 ``CG 01..``，未被点名（理论上不应出现）的条目按原自然序追加在末尾。
    ``id`` 保持 ``slug-{自然序号}`` 不变（稳定、调顺序不搬家），只有 ``order`` /
    ``code`` 变。文件缺失或损坏时原样返回，退回自然序。
    """
    if not ORDER_OVERRIDE.is_file():
        return items
    try:
        override = json.loads(read_text(ORDER_OVERRIDE)).get("order", {})
    except (ValueError, OSError):
        return items
    overrides = {k: v for k, v in override.items() if isinstance(v, list)}
    if not overrides:
        return items

    by_id = {it["id"]: it for it in items}
    out: list[dict] = []
    for group in groups:
        gid = group["id"]
        wanted = overrides.get(gid, [])
        seen: set[str] = set()
        seq = 0
        for mid in wanted:
            it = by_id.get(mid)
            if it is None or it["groupId"] != gid or mid in seen:
                continue
            seq += 1
            patched = dict(it)
            patched["order"] = seq
            patched["code"] = f"CG {seq:02d}"
            seen.add(mid)
            out.append(patched)
        for it in sorted(
            (x for x in items if x["groupId"] == gid and x["id"] not in seen),
            key=lambda x: x["order"],
        ):
            seq += 1
            patched = dict(it)
            patched["order"] = seq
            patched["code"] = f"CG {seq:02d}"
            out.append(patched)
    return out


def build_payload(groups: list[dict], items: list[dict]) -> dict:
    """Pure metadata — 单测无需 Pillow 即可重算。"""
    counts = {group["id"]: 0 for group in groups}
    for item in items:
        counts[item["groupId"]] += 1
    ordered_groups = [{**group, "count": counts[group["id"]]} for group in groups]
    unique_collectibles = {item["collectionId"] for item in items}
    return {
        "version": 1,
        "meta": {
            "itemCount": len(unique_collectibles),
            "groupCount": len(ordered_groups),
            "missingImageCount": sum(1 for item in items if item["image"] is None),
        },
        "groups": ordered_groups,
        "items": items,
    }


def write_images(image_jobs: dict[str, Path]) -> int:
    """Full rebuild: drop the old webp tree, then convert every source image."""
    from PIL import Image

    if OUT_IMAGES.is_dir():
        import shutil
        shutil.rmtree(OUT_IMAGES)
    total = 0
    for image, source in image_jobs.items():
        target = ROOT / "public" / image
        target.parent.mkdir(parents=True, exist_ok=True)
        with Image.open(source) as opened:
            picture = opened.convert("RGB")
            picture.thumbnail((MAX_EDGE, MAX_EDGE), Image.LANCZOS)
            picture.save(target, "WEBP", quality=QUALITY, method=6)
        total += target.stat().st_size
    return total


def main(argv: list[str] | None = None) -> None:
    """``--skip-images``：只重建 cg.json，跳过 webp 全量重转。

    图片字节没变（只改了名称 / 顺序这类元数据）时用它可以省掉一次几百张图的
    解码编码；正常发版前的重建不要带这个开关。
    """
    args = sys.argv[1:] if argv is None else argv
    skip_images = "--skip-images" in args
    groups = build_groups()
    items, image_jobs = scan_sources(groups)
    payload = build_payload(groups, items)
    total_bytes = 0 if skip_images else write_images(image_jobs)
    if skip_images:
        print("(--skip-images：图片保持原样)")
    elif total_bytes:
        print(f"图片总量 {total_bytes / 1024 / 1024:.1f} MB")
    OUT_GROUPS.parent.mkdir(parents=True, exist_ok=True)
    # 与 public/data/*.json 的现有写法一致：按字节写、固定 LF，避免 Windows 上
    # 写出的 CRLF 让单测比对时漂。
    OUT_GROUPS.write_bytes(
        (json.dumps(payload, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    )
    per_group = ", ".join(f"{g['name']} {g['count']}" for g in payload["groups"] if g["count"])
    shared = sorted({it["collectionId"] for it in items if it["collectionId"].startswith("shared-")})
    print(
        f"wrote {OUT_GROUPS.relative_to(ROOT)}: {len(payload['items'])} 条条目 / "
        f"{len(payload['groups'])} 组 / {payload['meta']['itemCount']} 张唯一图"
        + (f"，共用 {len(shared)} 张" if shared else "")
    )
    print(f"分组张数：{per_group or '(none yet)'}")


if __name__ == "__main__":
    main()
