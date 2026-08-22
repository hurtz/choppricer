#!/usr/bin/env python3
"""Bundle the ESM game into ONE self-contained HTML file for Artifact hosting.

Each module is wrapped in an IIFE returning its export object, so identically
named locals in different modules can never collide. Imports become
destructuring assignments off those objects.
"""
import os, re, sys, json

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "dist", "chop-pricer.html")

VENDOR = {"three": "vendor/three.module.js",
          "three/addons/postprocessing/Pass.js": "vendor/Pass.js"}

IMPORT_RE = re.compile(
    r"^[ \t]*import\s+(?:(?P<ns>\*\s*as\s+\w+)|(?P<named>\{[^}]*\})|(?P<def>\w+))?\s*"
    r"(?:from\s*)?['\"](?P<spec>[^'\"]+)['\"]\s*;?[ \t]*$",
    re.M | re.S)

def resolve(spec, frm):
    if spec in VENDOR: return VENDOR[spec]
    if spec.startswith("."):
        return os.path.normpath(os.path.join(os.path.dirname(frm), spec)).replace("\\", "/")
    raise SystemExit(f"unresolved import {spec!r} in {frm}")

def var(path): return "M_" + re.sub(r"[^A-Za-z0-9]", "_", path)

def exports_of(src):
    """Collect exported names, and rewrite `export X` -> `X`."""
    names = []
    for m in re.finditer(r"^[ \t]*export\s+(?:async\s+)?(?:function\*?|class|const|let|var)\s+(\w+)", src, re.M):
        names.append(m.group(1))
    # `export { a, b as c };`
    for m in re.finditer(r"^[ \t]*export\s*\{([^}]*)\}\s*;?", src, re.M):
        for part in m.group(1).split(","):
            part = part.strip()
            if not part: continue
            names.append(part.split(" as ")[-1].strip() if " as " in part else part)
    src = re.sub(r"^([ \t]*)export\s+(?=(?:async\s+)?(?:function|class|const|let|var)\s)", r"\1", src, flags=re.M)
    src = re.sub(r"^[ \t]*export\s*\{[^}]*\}\s*;?[ \t]*$", "", src, flags=re.M)
    seen, uniq = set(), []
    for n in names:
        if n not in seen: seen.add(n); uniq.append(n)
    return src, uniq

mods, order, building = {}, [], set()

def load(path):
    if path in mods: return
    if path in building: raise SystemExit(f"import cycle at {path}")
    building.add(path)
    src = open(os.path.join(ROOT, path), encoding="utf-8").read()
    prelude = []
    def strip(m):
        spec = m.group("spec"); dep = resolve(spec, path)
        load(dep)
        if m.group("ns"):
            prelude.append(f'const {m.group("ns").split("as")[-1].strip()} = {var(dep)};')
        elif m.group("named"):
            inner = m.group("named")[1:-1]
            pieces = []
            for p in (x.strip() for x in inner.split(",")):
                if not p: continue
                pieces.append(f'{p.split(" as ")[0].strip()}: {p.split(" as ")[-1].strip()}' if " as " in p else p)
            if pieces: prelude.append(f'const {{ {", ".join(pieces)} }} = {var(dep)};')
        elif m.group("def"):
            prelude.append(f'const {m.group("def")} = {var(dep)}.default;')
        return ""
    src = IMPORT_RE.sub(strip, src)
    src, names = exports_of(src)
    mods[path] = {"src": src, "names": names, "prelude": prelude}
    building.discard(path)
    order.append(path)

load("src/main.js")

chunks = []
for path in order:
    m = mods[path]
    ret = "{ " + ", ".join(m["names"]) + " }" if m["names"] else "{}"
    chunks.append(
        f'/* ==== {path} ==== */\nconst {var(path)} = (() => {{\n'
        + ("\n".join(m["prelude"]) + "\n" if m["prelude"] else "")
        + m["src"] + f"\nreturn {ret};\n}})();\n")

html = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
html = re.sub(r'<script type="importmap">.*?</script>', "", html, flags=re.S)
html = re.sub(r'<script type="module" src="[^"]*"></script>', "", html)
html = html.replace("</body>", '<script type="module">\n' + "\n".join(chunks) + "\n</script>\n</body>")

if "--artifact" in sys.argv:
    # Artifact wraps content in its own <!doctype><head><body> skeleton, so emit
    # the page CONTENT only: title first (scanned from the first 8KB), then style,
    # then markup, then the bundle.
    title = re.search(r"<title>(.*?)</title>", html, re.S)
    style = re.search(r"<style>(.*?)</style>", html, re.S)
    body  = re.search(r"<body>(.*?)</body>", html, re.S)
    html = (f"<title>{title.group(1) if title else 'Chop Pricer'}</title>\n"
            f"<style>{style.group(1) if style else ''}</style>\n"
            f"{body.group(1) if body else ''}\n")

os.makedirs(os.path.dirname(OUT), exist_ok=True)
open(OUT, "w", encoding="utf-8").write(html)
print(f"{len(order)} modules -> {OUT}  ({len(html)/1e6:.2f} MB)")
for p in order: print(f"   {len(mods[p]['names']):3d} exports  {p}")
