# -*- coding: utf-8 -*-
"""烘焙甜蜜乐章「自制通告一览」：攻略正文 → public/data/sweet/selfmade.json

真源：
  - sources/sweet/self-notices.txt（攻略整理的自制通告一览，按唱片 / 电视剧 / 电影分节，
    每位艺人名下若干条，写上特殊 / 一般、累积多少天自由活动、类型星级，部分条目标了属性门槛）
  - public/data/sweet/notices.json（游戏 Data/*.dat 烘出来的通告表，用来把作品名对成通告码）

攻略里的名字与游戏内译名有 7 处出入（简繁 / 译名不同），统一走 ALIASES 归一；
游戏里另有 13 条出品方为「纯真年代」的自制品攻略没有收录（舞台剧 12 + 电视剧 1），
这些条目照样输出，但 guide=False、不编造条件与门槛。

这 13 条的归属与获得方式来自存档里的「每艺人自制清单」：任何一份甜蜜乐章存档
都有一段 9 连编码簇（80 条），每簇对应一位艺人，三份不同存档读出来完全一致，
且与攻略的艺人归属零冲突。落在簇里的走「累积自由活动」；落在簇外的 6 条里面，
攻略明确写「触发剧情获得」的三条（红花 / 温柔时刻 / 从来不曾爱过）全在簇外，
所以簇外按「剧情直接获得」处理。天数与属性门槛游戏数据里没有，不编。
"""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'sources' / 'sweet' / 'self-notices.txt'
NOTICES = ROOT / 'public' / 'data' / 'sweet' / 'notices.json'
OUTPUT = ROOT / 'public' / 'data' / 'sweet' / 'selfmade.json'

# 攻略写法与游戏内译名的差异，逐条手动核对过，别用模糊匹配代替。
ALIASES = {
    '没有雪的耶诞夜': '没有雪的耶诞节',
    '公元2025年': '西元2050年',
    '学院的王子们': '学园的王子们',
    '刑事侦查一周间': '刑事侦察一周间',
    '从来不曾爱你': '从来不曾爱过',
    '异世界童话': '异世界神话',
    '校园怪谈': '校园怪谭',
}

ATTRS = ['演技', '口才', '歌艺', '名气', '仪态', '动感', '体能', '才智', '自信']
SECTION_RE = re.compile(r'^●\s*(唱片|电视剧|电影)\s*●$')
ARTIST_RE = re.compile(r'^\d+、\s*(\S+?)\s*$')
ENTRY_RE = re.compile(r'^(?:\d+）)?\s*《([^》]+)》(.*)$')
ATTR_LINE_RE = re.compile(r'^(?:演技|口才|歌艺|名气|仪态|动感|体能|才智|自信)\s*\d+')
TAG_TAIL_RE = re.compile(r'[（(]([^（）()]*)[）)]\s*$')
DAYS_RE = re.compile(r'累积\s*(\d+)\s*天')
MONTH_RE = re.compile(r'累积\s*(\d+)\s*个月')
KIND_RE = re.compile(r'^(特殊|一般)')

SECTION_KEYS = {'唱片': 'music', '电视剧': 'tv', '电影': 'movie'}
# 攻略里的艺人群组 → 甜蜜乐章艺人编号（取自 star-roles.json；主角 1 的名字是存档自命名的，
# 攻略按「杜云芊」写）。「其他」是跨艺人的条目，编号记 0。
ARTIST_IDS = {
    '杜云芊': 1, '沈惟真': 11, '丹尼斯': 12, '史蒂芬': 13, '姚子奇': 14,
    '慕容和希': 15, '卫亚': 16, '纪翔': 17, '城仲瑄': 18, '其他': 0,
}
# 攻略把个别条目归在「其他」，但条件原文写明挂在某位艺人身上，按条件改归。
# CD791《温柔时刻》：条件写「林芬芬作品，丹尼斯剧情2-3发生后获得」→ 归丹尼斯。
ARTIST_OVERRIDES = {'CD791': (12, '丹尼斯')}

# 出品方是玩家公司，这些通告就是自制作品；攻略漏掉的靠它兜底。
PLAYER_COMPANY = '纯真年代'
CATEGORY_LABEL = {'music': '唱片', 'tv': '电视剧', 'movie': '电影', 'stage': '舞台剧'}

# 攻略漏掉的 13 条：编号段 + 存档里的每艺人自制清单（9 个簇共 80 条）双向核对过，
# 归属不是猜的。acquire 的 pool = 在清单里、要累积自由活动；story = 不在清单里，
# 按「触发剧情直接获得」处理（池外三条攻略条目全写「触发剧情获得」，口径一致）。
EXTRA_META = {
    'TH711': (11, '沈惟真', 'pool'),
    'TH721': (12, '丹尼斯', 'pool'),
    'TH722': (12, '丹尼斯', 'pool'),
    'TH723': (12, '丹尼斯', 'story'),
    'TH751': (15, '慕容和希', 'pool'),
    'TH761': (16, '卫亚', 'pool'),
    'TH762': (16, '卫亚', 'pool'),
    'TH771': (17, '纪翔', 'pool'),
    'TH781': (18, '城仲瑄', 'pool'),
    'TH782': (18, '城仲瑄', 'pool'),
    'TH783': (18, '城仲瑄', 'pool'),
    'TH791': (0, '其他', 'story'),
    'TV791': (0, '其他', 'story'),
}


def split_condition(text):
    """把「……获得（民歌个人、两星）」拆成正文 + 类型星级标签。"""
    body = text.strip()
    tags = []
    match = TAG_TAIL_RE.search(body)
    if match:
        tags = [part.strip() for part in re.split(r'[、，,]', match.group(1)) if part.strip()]
        body = body[:match.start()].strip()
    body = body.strip('。，,；;：: ')
    return body, tags


def parse_guide():
    lines = SOURCE.read_text(encoding='utf-8').splitlines()
    sections = []
    section = None
    artist = None
    current = None

    def flush():
        nonlocal current
        if current is not None and section is not None:
            section['entries'].append(current)
            current = None

    for raw in lines:
        line = raw.strip()
        if not line:
            continue
        match = SECTION_RE.match(line)
        if match:
            flush()
            section = {'key': SECTION_KEYS[match.group(1)], 'label': match.group(1), 'entries': []}
            sections.append(section)
            artist = None
            continue
        if section is None:
            continue
        match = ARTIST_RE.match(line)
        if match:
            flush()
            artist = match.group(1)
            continue
        match = ENTRY_RE.match(line)
        if match:
            flush()
            current = {
                'artist': artist,
                'name': match.group(1).strip(),
                'prose': match.group(2).strip(),
                'attrLine': '',
            }
            continue
        if current is not None and ATTR_LINE_RE.match(line):
            current['attrLine'] = line
            continue
        if current is not None:
            current['prose'] = (current['prose'] + ' ' + line).strip()
    flush()
    return sections


def main():
    notices = json.loads(NOTICES.read_text(encoding='utf-8'))['notices']
    by_name = {}
    for notice in notices:
        by_name.setdefault(notice['name'], []).append(notice)

    entries = []
    missing = []
    for section in parse_guide():
        for item in section['entries']:
            prose, tags = split_condition(item['prose'])
            kind_match = KIND_RE.match(prose)
            kind = kind_match.group(1) if kind_match else ''
            days = 0
            day_match = DAYS_RE.search(prose)
            if day_match:
                days = int(day_match.group(1))
            else:
                month_match = MONTH_RE.search(prose)
                if month_match:
                    days = int(month_match.group(1)) * 30
            thresholds = []
            for label, value in re.findall(
                r'(演技|口才|歌艺|名气|仪态|动感|体能|才智|自信)\s*(\d+)', item['attrLine']):
                thresholds.append({'label': label, 'value': int(value)})
            target = ALIASES.get(item['name'], item['name'])
            hits = by_name.get(target) or []
            if not hits:
                missing.append(f"{section['label']}/{item['artist']}/{item['name']}")
                code = ''
                category = section['key']
                game_name = item['name']
            else:
                code = hits[0]['id']
                category = hits[0]['cat']
                # 界面上要跟游戏里看到的一致，攻略的写法只在有出入时留在 guideName 里。
                game_name = hits[0]['name']
            entries.append({
                'artist': item['artist'],
                'artistId': ARTIST_IDS.get(item['artist'], 0),
                'section': section['key'],
                'code': code,
                'name': game_name,
                'guideName': item['name'],
                'category': CATEGORY_LABEL.get(category, ''),
                'kind': kind,
                'days': days,
                'condition': prose,
                'tags': tags,
                'thresholds': thresholds,
                'guide': True,
                'acquire': '',
            })

    for entry in entries:
        override = ARTIST_OVERRIDES.get(entry['code'])
        if override:
            entry['artistId'], entry['artist'] = override

    covered = {entry['code'] for entry in entries if entry['code']}
    extras = []
    for notice in notices:
        if notice.get('company') != PLAYER_COMPANY or notice['id'] in covered:
            continue
        artist_id, artist, acquire = EXTRA_META.get(notice['id'], (0, '其他', ''))
        extras.append({
            'artist': artist,
            'artistId': artist_id,
            'section': notice['cat'],
            'code': notice['id'],
            'name': notice['name'],
            'guideName': '',
            'category': CATEGORY_LABEL.get(notice['cat'], ''),
            'kind': '',
            'days': 0,
            'condition': '',
            'tags': [],
            'thresholds': [],
            'guide': False,
            'acquire': acquire,
        })
    unknown = [row['code'] for row in extras if not row['acquire']]
    if unknown:
        raise SystemExit('攻略漏项里有没有归属/获得方式的行：%s' % ', '.join(unknown))

    order = {'music': 0, 'tv': 1, 'movie': 2, 'stage': 3}
    extras.sort(key=lambda row: (order.get(row['section'], 9), row['code']))
    entries.sort(key=lambda row: order.get(row['section'], 9))

    sections = []
    for key in ['music', 'tv', 'movie', 'stage']:
        count = sum(1 for row in entries if row['section'] == key)
        extra = sum(1 for row in extras if row['section'] == key)
        if count + extra == 0:
            continue
        sections.append({
            'key': key,
            'label': CATEGORY_LABEL.get(key, key),
            'count': count,
            'extraCount': extra,
        })

    payload = {
        'meta': {
            'entryCount': len(entries),
            'extraCount': len(extras),
            'artistCount': len({row['artist'] for row in entries if row['artist']}),
            'sources': [
                'sources/sweet/self-notices.txt（攻略整理的自制通告一览）',
                'public/data/sweet/notices.json（Data/*.dat 烘出的通告名与通告码）',
            ],
            'generatedBy': 'scripts/build_sweet_selfmade.py',
        },
        'sections': sections,
        'entries': entries,
        'extras': extras,
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

    print(f"entries {len(entries)} extras {len(extras)} artists {payload['meta']['artistCount']}")
    print('sections', [(s['label'], s['count'], s['extraCount']) for s in sections])
    print('missing codes', len(missing), missing)
    print('thresholds', sum(1 for row in entries if row['thresholds']))
    print('sample', json.dumps(entries[2], ensure_ascii=False))


if __name__ == '__main__':
    main()
