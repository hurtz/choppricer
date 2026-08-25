#!/usr/bin/env python3
"""Is the public URL actually serving the current source?

Three things must agree, and they drift silently:
  src/*.js  ->  docs/index.html  ->  https://hurtz.github.io/choppricer/
The dev build at /index.html is always current; the shipped one is only as
current as the last `tools/bundle.py` + push. A broken build has already
reached the player once this way.

  python3 tools/check-live.py
"""
import glob, hashlib, os, subprocess, sys, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
URL = "https://hurtz.github.io/choppricer/"
ok = True

srcs = glob.glob("src/**/*.js", recursive=True) + ["index.html"]
newest = max(srcs, key=os.path.getmtime)
bundle_t = os.path.getmtime("docs/index.html")
if bundle_t < os.path.getmtime(newest):
    print(f"STALE BUNDLE — {newest} is newer than docs/index.html")
    print("  fix: python3 tools/bundle.py docs/index.html")
    ok = False
else:
    print(f"bundle is current with source (newest: {newest})")

local = hashlib.md5(open("docs/index.html", "rb").read()).hexdigest()
head = subprocess.run(["git", "show", "HEAD:docs/index.html"], capture_output=True)
if head.returncode == 0 and hashlib.md5(head.stdout).hexdigest() != local:
    print("UNCOMMITTED BUNDLE — docs/index.html differs from HEAD")
    print("  fix: git add docs/index.html && git commit && git push")
    ok = False

try:
    remote = hashlib.md5(urllib.request.urlopen(URL, timeout=25).read()).hexdigest()
    if remote == local:
        print(f"live matches local bundle  {URL}")
    else:
        print(f"LIVE IS BEHIND — {URL} is serving a different build")
        print("  fix: git push, then wait ~30s for Pages, then re-run")
        ok = False
except Exception as e:
    print(f"could not reach {URL}: {e}")
    ok = False

sys.exit(0 if ok else 1)
