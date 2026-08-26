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

# `export { a, b as c } from './x.js'` — a re-export WITH a from-clause. This form
# binds names AND re-exports them, and it is NOT matched by the plain-export strip
# below (that one anchors at end-of-line). It survived into a shipped bundle as a
# bare `export` keyword and broke the game. Handled first, as an import plus a
# re-export of the same names.
REEXPORT_RE = re.compile(
    r"^[ \t]*export\s*\{(?P<names>[^}]*)\}\s*from\s*['\"](?P<spec>[^'\"]+)['\"]\s*;?[ \t]*$",
    re.M)

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
    bound = set()
    def strip(m):
        spec = m.group("spec"); dep = resolve(spec, path)
        load(dep)
        if m.group("ns"):
            nm = m.group("ns").split("as")[-1].strip()
            if nm not in bound:
                bound.add(nm)
                prelude.append(f'const {nm} = {var(dep)};')
        elif m.group("named"):
            inner = m.group("named")[1:-1]
            pieces = []
            for p in (x.strip() for x in inner.split(",")):
                if not p: continue
                out = p.split(" as ")[-1].strip()
                if out in bound: continue
                bound.add(out)
                pieces.append(f'{p.split(" as ")[0].strip()}: {out}' if " as " in p else p)
            if pieces: prelude.append(f'const {{ {", ".join(pieces)} }} = {var(dep)};')
        elif m.group("def"):
            nm = m.group("def")
            if nm not in bound:
                bound.add(nm)
                prelude.append(f'const {nm} = {var(dep)}.default;')
        return ""
    reexported = []
    def strip_reexport(m):
        dep = resolve(m.group("spec"), path)
        load(dep)
        pieces = []
        for part in (x.strip() for x in m.group("names").split(",")):
            if not part:
                continue
            if " as " in part:
                src_name, out_name = [q.strip() for q in part.split(" as ")]
                pieces.append(f"{src_name}: {out_name}")
                reexported.append(out_name)
            else:
                pieces.append(part)
                reexported.append(part)
        pieces = [q for q in pieces if q.split(":")[-1].strip() not in bound]
        for q in pieces:
            bound.add(q.split(":")[-1].strip())
        if pieces:
            prelude.append(f'const {{ {", ".join(pieces)} }} = {var(dep)};')
        return ""
    src = REEXPORT_RE.sub(strip_reexport, src)
    src = IMPORT_RE.sub(strip, src)
    src, names = exports_of(src)
    for n in reexported:
        if n not in names:
            names.append(n)
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

# SYNTAX GATE. A bundle that does not parse is a black screen for the player, and
# this shipped once already: `export {x} from './y.js'` survived the plain-export
# strip and reached production as a bare `export` keyword. Never again silently.
import subprocess, tempfile
_body = re.search(r'<script type="module">([\s\S]*)</script>', html)
if _body:
    with tempfile.NamedTemporaryFile("w", suffix=".mjs", delete=False, encoding="utf-8") as _f:
        _f.write(_body.group(1)); _tmp = _f.name
    # BOTH FORMS, DELIBERATELY. `node --check FILE` parses .js as a CommonJS
    # script first, and on 2026-08-26 it exited 0 on a src/cctv/shaders.js that
    # the browser flatly refused to load — a stray backtick inside a GLSL
    # template literal took the whole page down while the guard said "good".
    # Two agents and the lead each observed that, and the lead could NOT
    # construct a minimal reproduction of it, so the trigger condition is not
    # understood and must not be assumed away. The tempfile here is .mjs, which
    # in testing did catch every synthetic case — but "the guard I could not
    # break" is worth exactly nothing next to "the guard that already shipped a
    # black screen once" (see the note above this block). So run the explicit
    # module check as well and fail if EITHER complains. Cost: one extra node
    # invocation per bundle.
    _src = _body.group(1)
    for _node in ("/usr/local/bin/node", "node"):
        try:
            _checks = [
                subprocess.run([_node, "--check", _tmp],
                               capture_output=True, text=True, timeout=60),
                subprocess.run([_node, "--input-type=module", "--check"],
                               input=_src, capture_output=True, text=True, timeout=60),
            ]
        except (FileNotFoundError, subprocess.TimeoutExpired):
            continue
        for _r in _checks:
            if _r.returncode != 0:
                os.unlink(_tmp)
                raise SystemExit("BUNDLE DOES NOT PARSE — refusing to write a broken build:\n"
                                 + (_r.stderr or "").strip()[:600])
        break
    os.unlink(_tmp)

print(f"{len(order)} modules -> {OUT}  ({len(html)/1e6:.2f} MB)")
for p in order: print(f"   {len(mods[p]['names']):3d} exports  {p}")
