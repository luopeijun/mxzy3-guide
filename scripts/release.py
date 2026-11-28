#!/usr/bin/env python3
"""把当前版本的桌面版发布到 GitHub Release（只做 Release 段）。

前置步骤仍由人手动完成：改版本号、打包、打 annotated tag（中文要点）、push main + tag。
本脚本不 bump 版本、不打包、不 push、不删改远端资产，只做：

  读版本 → 校验 tag / zip → 创建 release → 上传 zip → 回读核验

Release 正文直接取 annotated tag 的 message（中文要点真源），脚本不自拟文案。
token 走 `git credential fill`，不落盘、不打印。全程幂等：release / 资产已存在就跳过。

用法：
  python scripts/release.py --dry-run   # 只校验前置条件并打印计划，不碰远端
  python scripts/release.py             # 正式发布
  python scripts/release.py --tag v1.18.0
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REPO = 'luopeijun/mxzy3-guide'
API = 'https://api.github.com'
UPLOADS = 'https://uploads.github.com'
USER_AGENT = 'mxzy3-release-script'


class ReleaseError(RuntimeError):
    pass


def git(*args: str) -> str:
    proc = subprocess.run(
        ['git', *args], cwd=ROOT, check=False, capture_output=True, text=True,
    )
    if proc.returncode != 0:
        raise ReleaseError(f'git {" ".join(args)} 失败：{proc.stderr.strip()[:200]}')
    return proc.stdout.strip()


def current_version() -> str:
    data = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))
    return data['version']


def credential_token() -> str:
    proc = subprocess.run(
        ['git', 'credential', 'fill'],
        input='protocol=https\nhost=github.com\n\n',
        cwd=ROOT, capture_output=True, text=True,
    )
    if proc.returncode != 0:
        raise ReleaseError('git credential fill 失败')
    cred: dict[str, str] = {}
    for line in proc.stdout.splitlines():
        if '=' in line:
            key, value = line.split('=', 1)
            cred[key.strip()] = value.strip()
    token = cred.get('password') or cred.get('token')
    if not token:
        raise ReleaseError('git credential fill 未返回 token，请检查凭据管理器')
    return token


def api(url: str, token: str, *, payload=None, content_type='application/json',
        method=None, timeout=600):
    headers = {
        'Accept': 'application/vnd.github+json',
        'Authorization': f'Bearer {token}',
        'User-Agent': USER_AGENT,
        'X-GitHub-Api-Version': '2022-11-28',
    }
    body = None
    if payload is not None:
        body = payload if isinstance(payload, bytes) else json.dumps(payload).encode('utf-8')
        headers['Content-Type'] = content_type
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode('utf-8', 'replace')[:400]
        raise ReleaseError(f'GitHub API {exc.code} {exc.reason}: {detail}') from None


def find_release(tag: str, token: str):
    url = f'{API}/repos/{REPO}/releases/tags/{tag}'
    try:
        _status, data = api(url, token, timeout=60)
        return data
    except ReleaseError as exc:
        if '404' in str(exc):
            return None
        raise


def main() -> int:
    parser = argparse.ArgumentParser(description='发布桌面版到 GitHub Release')
    parser.add_argument('--dry-run', action='store_true', help='只校验并打印计划，不碰远端')
    parser.add_argument('--tag', default=None, help='默认取 package.json 版本对应的 v 标签')
    args = parser.parse_args()

    version = current_version()
    tag = args.tag or f'v{version}'
    ver = tag[1:] if tag.startswith('v') else tag
    zip_path = ROOT / 'release' / f'mxzy3-desktop-{ver}-win-x64.zip'

    # 前置校验：tag 必须存在且是 annotated（正文真源），zip 必须在本地
    git('rev-parse', '-q', '--verify', f'refs/tags/{tag}')
    if git('cat-file', '-t', f'refs/tags/{tag}') != 'tag':
        raise ReleaseError(f'{tag} 不是 annotated tag，请重新打标（release 正文取自 tag message）')
    body = git('for-each-ref', f'refs/tags/{tag}', '--format=%(contents)')
    if not body.strip():
        raise ReleaseError(f'{tag} 的 message 为空，请先写中文要点')
    if not git('ls-remote', '--tags', 'origin', f'refs/tags/{tag}'):
        raise ReleaseError(f'远端还没有 {tag}，请先 git push origin {tag}')
    if not zip_path.is_file():
        raise ReleaseError(f'找不到 {zip_path}，请先重新打包桌面版')

    print(f'版本     {version}')
    print(f'标签     {tag}')
    print(f'资产     {zip_path.relative_to(ROOT)} ({zip_path.stat().st_size} bytes)')
    print(f'正文来源 {tag} 的 annotated tag message')
    print('正文预览：')
    for line in body.splitlines()[:6]:
        print(f'  {line}')
    if args.dry_run:
        print('--dry-run：仅校验，不访问 GitHub 写接口')
        return 0

    token = credential_token()
    release = find_release(tag, token)
    if release is None:
        _status, release = api(
            f'{API}/repos/{REPO}/releases',
            {
                'tag_name': tag,
                'name': tag,
                'body': body,
                'draft': False,
                'prerelease': True,
            },
            method='POST',
        )
        print(f'已创建 Release {release["html_url"]}')
    else:
        print(f'复用已有 Release {release["html_url"]}')

    assets = {asset['name']: asset for asset in release.get('assets', [])}
    existing = assets.get(zip_path.name)
    if existing:
        print(f'资产已存在，跳过上传：{zip_path.name} ({existing["size"]} bytes)')
        if existing['size'] != zip_path.stat().st_size:
            print('警告：本地 zip 与远端资产大小不一致；脚本不覆盖，如需替换请手动删资产后重跑')
    else:
        print(f'上传 {zip_path.name} …')
        _status, asset = api(
            f'{UPLOADS}/repos/{REPO}/releases/{release["id"]}/assets?name={zip_path.name}',
            zip_path.read_bytes(), content_type='application/zip', method='POST',
        )
        print(f'已上传 {asset["name"]} ({asset["size"]} bytes)')

    # 回读核验
    _status, final = api(f'{API}/repos/{REPO}/releases/tags/{tag}', token, timeout=60)
    print('核验：')
    print(f'  tag={final["tag_name"]} name={final["name"]} prerelease={final["prerelease"]}')
    print(f'  assets={[(a["name"], a["size"], a["state"]) for a in final["assets"]]}')
    print(f'  {final["html_url"]}')
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except ReleaseError as exc:
        print(f'错误：{exc}', file=sys.stderr)
        sys.exit(1)
