#!/usr/bin/env python3
"""Syntax preflight for every JS module in the tree. Run before every reload.

    python3 tools/check.py            # all of src/
    python3 tools/check.py src/store  # just one subtree
    python3 tools/check.py --watch    # poll forever, announce breaks in ~1s

RUN THE WATCH IN A BACKGROUND SHELL FOR YOUR WHOLE ROUND. The one-shot form only
helps if you remember to run it, and four page-downs in one day happened with
the correct command sitting in the brief. `--watch` removes the remembering: it
prints the file, line and caret within about a second of the bad save, before
you have reloaded and started debugging the wrong thing.

There is nothing to lint in a CORRECT file, which is why there is no "risky
backtick" warning here and you should not build one: in a file that parses, the
first backtick after the opener IS the closer, so no fragile-but-passing state
exists to detect. The file is either broken or it is fine. That makes fast
detection the only available defence.

WHY THIS EXISTS. `node --check FILE` parses as a CommonJS script and has three
times in one day exited 0 on a file the browser flatly refused to load, taking
the whole page down for every agent working. The failure mode is a stray
backtick inside a GLSL template literal — usually in a COMMENT — which closes
the shader string early. Whether the plain check catches it depends on whether
the wreckage happens to re-parse into another complete template, which you
cannot predict by looking at the comment. See AGENTS_BRIEF.md for the four-line
reproduction.

This runs the MODULE form, which does not have that hole, over everything at
once. Exit code is non-zero if anything fails, so it chains:

    python3 tools/check.py && echo RELOAD OK
"""
import os, re, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NODE = next((n for n in ("/usr/local/bin/node", "/opt/homebrew/bin/node", "node")
             if subprocess.run(["which", n], capture_output=True).returncode == 0
             or os.path.exists(n)), "node")

def check(path):
    with open(path, "rb") as fh:
        src = fh.read()
    r = subprocess.run([NODE, "--input-type=module", "--check"],
                       input=src, capture_output=True, timeout=60)
    if r.returncode == 0:
        return None
    out = r.stderr.decode("utf-8", "replace").strip().splitlines()
    # keep the location line, the caret and the SyntaxError
    keep = [l for l in out[:6] if l.strip()]
    return "\n".join("      " + l for l in keep)

# ---------------------------------------------------------------- exports
# `node --input-type=module --check` validates SYNTAX ONLY. It cleared a
# src/game/sight.js that the browser then refused, because game.js imported a
# name sight.js did not export — a whole-page failure that the syntax gate is
# structurally blind to. This second pass resolves every relative named import
# against the target file's exports.
#
# Deliberately conservative: it stays silent on `import * as ns`, on bare
# specifiers ('three'), and on any target carrying `export *`, because in those
# cases it cannot know. A false alarm here would train people to ignore it.
IMPORT_RE = re.compile(
    r'^\s*import\s+(?P<clause>\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+'
    r'[\'"](?P<spec>[^\'"]+)[\'"]', re.M)
NAMED_RE = re.compile(
    r'^\s*export\s+(?:async\s+)?(?:function\*?|class)\s+(\w+)', re.M)
# `export const CW = 5, CH = 7, ADV = 6;` declares THREE names. Matching only the
# first produced a false alarm on src/cctv/font5x7.js the first time this pass
# ran — and a checker that cries wolf gets ignored, which is worse than not
# having it. Walk the declaration list at bracket depth 0.
# NOT re.S: with DOTALL the greedy `.*` swallows the rest of the file, finditer
# cannot overlap, and only the FIRST `export const` in each module is ever seen.
# That produced a second wave of false alarms claiming config.js exports nothing.
DECL_RE = re.compile(r'^\s*export\s+(?:const|let|var)\s+(.*)$', re.M)


def _decl_names(body):
    names, depth, cur = [], 0, ''
    for ch in body:
        if ch in '([{':
            depth += 1
        elif ch in ')]}':
            depth -= 1
        elif ch == ';' and depth == 0:
            break
        elif ch == ',' and depth == 0:
            names.append(cur); cur = ''; continue
        cur += ch
    names.append(cur)
    out = []
    for n in names:
        n = n.split('=')[0].strip()
        m = re.match(r'^(\w+)$', n)
        if m:
            out.append(m.group(1))
    return out
LIST_RE = re.compile(r'^\s*export\s*\{([^}]*)\}', re.M)


def exports_of(path, _cache={}):
    if path in _cache:
        return _cache[path]
    try:
        src = open(path, encoding="utf-8").read()
    except OSError:
        _cache[path] = None
        return None
    if re.search(r'^\s*export\s*\*', src, re.M):
        _cache[path] = None            # re-export star: cannot resolve, stay quiet
        return None
    names = set(NAMED_RE.findall(src))
    for m in DECL_RE.finditer(src):
        names.update(_decl_names(m.group(1)))
    for body in LIST_RE.findall(src):
        for part in body.split(','):
            part = part.strip()
            if not part:
                continue
            names.add(part.split()[-1])     # `a as b` -> b
    if re.search(r'^\s*export\s+default\b', src, re.M):
        names.add('default')
    _cache[path] = names
    return names


def check_imports(path):
    """Return a list of complaint strings for unresolvable named imports."""
    try:
        src = open(path, encoding="utf-8").read()
    except OSError:
        return []
    out = []
    for m in IMPORT_RE.finditer(src):
        spec, clause = m.group('spec'), m.group('clause').strip()
        if not spec.startswith('.'):
            continue                                   # bare specifier
        if clause.startswith('*'):
            continue                                   # namespace import
        tgt = os.path.normpath(os.path.join(os.path.dirname(path), spec))
        have = exports_of(tgt)
        if have is None:
            continue
        wanted = ['default'] if not clause.startswith('{') else [
            w.strip().split()[0] for w in clause[1:-1].split(',') if w.strip()]
        missing = [w for w in wanted if w not in have]
        if missing:
            line = src[:m.start()].count('\n') + 1
            rel = os.path.relpath(tgt, ROOT)
            out.append(f"      line {line}: {rel} does not export "
                       + ", ".join(missing))
    return out


def scan(roots):
    files = []
    for r in roots:
        r = r if os.path.isabs(r) else os.path.join(ROOT, r)
        if os.path.isfile(r):
            files.append(r); continue
        for dirpath, _, names in os.walk(r):
            files += [os.path.join(dirpath, n) for n in names if n.endswith(".js")]
    return sorted(files)


def watch(roots):
    """Poll mtimes; re-check only what changed. Announce breaks and recoveries."""
    import time
    seen, broken = {}, set()
    print("watching for syntax breaks — ctrl-c to stop", flush=True)
    while True:
        for f in scan(roots):
            try:
                m = os.path.getmtime(f)
            except OSError:
                continue
            if seen.get(f) == m:
                continue
            seen[f] = m
            rel = os.path.relpath(f, ROOT)
            err = check(f) or ("\n".join(check_imports(f)) or None)
            if err:
                broken.add(rel)
                print(f"\n  *** BROKEN  {rel}  — THE PAGE WILL NOT BOOT ***", flush=True)
                print(err, flush=True)
            elif rel in broken:
                broken.discard(rel)
                print(f"  recovered   {rel}", flush=True)
        time.sleep(1.0)


def main():
    argv = [a for a in sys.argv[1:] if a != "--watch"]
    if "--watch" in sys.argv:
        try:
            watch(argv or [os.path.join(ROOT, "src")])
        except KeyboardInterrupt:
            return 0
    roots = argv or [os.path.join(ROOT, "src")]
    files = scan(roots)

    bad = []
    for f in files:
        err = check(f)
        rel = os.path.relpath(f, ROOT)
        if err:
            bad.append(rel)
            print(f"  FAIL  {rel}")
            print(err)
            continue
        imp = check_imports(f)
        if imp:
            bad.append(rel)
            print(f"  FAIL  {rel}  (imports a name that is not exported)")
            for l in imp:
                print(l)

    if bad:
        print(f"\n{len(bad)} of {len(files)} files DO NOT PARSE — the page will not boot.")
        print("Fix these before reloading. Note `node --check` may well say they are fine.")
        return 1
    print(f"  {len(files)} files parse clean")
    return 0

sys.exit(main())
