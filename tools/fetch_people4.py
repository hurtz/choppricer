#!/usr/bin/env python3
"""Targeted search for people-in-a-grocery-store photographs.

Category browsing produced an airliner and two 1955 Amsterdam street scenes --
"Customers" and "Shopping_carts" drag in anything. Search phrasings that name
BOTH a person and a store interior do much better, and the survivors still get
looked at by hand before they join the bar.

The API 429'd this host earlier and has since recovered; pacing here is
deliberately slow (2.5 s between calls) so it stays that way.
"""
import hashlib, html, json, os, re, sys, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT  = os.path.join(ROOT, 'reference', 'people')
UA   = 'choppricer-reference/1.0 (offline game-dev reference set; github.com/hurtz)'
WANT = 20

QUERIES = [
    'supermarket customer shopping cart aisle',
    'grocery store shopper reaching shelf',
    'woman shopping supermarket groceries',
    'man supermarket trolley aisle',
    'supermarket checkout cashier customer queue',
    'family grocery shopping produce',
    'shopper basket supermarket interior',
    'people buying groceries store',
    'customer choosing product shelf store',
    'supermarket employee stocking shelves',
]
# Names that have already cost a curation pass.
BAD = re.compile(r'(aerial|airport|aircraft|ryanair|airlines|street|straat|'
                 r'facade|exterior|storefront|logo|map|diagram|empty|closed|'
                 r'construction|parking|sign(?!age)|building)', re.I)

def api(params):
    p = dict(params, format='json', formatversion=2)
    u = 'https://commons.wikimedia.org/w/api.php?' + urllib.parse.urlencode(p)
    r = urllib.request.Request(u, headers={'User-Agent': UA})
    with urllib.request.urlopen(r, timeout=40) as f:
        time.sleep(2.5)
        return json.load(f)

# No hand-built thumb URLs. Constructing
# thumb/<h0>/<h0:2>/<name>/1024px-<name> looks right and Wikimedia 400s it with
# "Use thumbnail sizes listed on <https://w.wiki/GHai>" for most files -- 34 of
# 34 downloads failed that way. Ask the API for `iiurlwidth` instead and use the
# `thumburl` it hands back: it is the only party that knows which widths exist
# for a given file, and it renders one on demand if it does not.

FREE = re.compile(r'(cc[- ]by|cc0|public domain|pd-|attribution)', re.I)

def main():
    os.makedirs(OUT, exist_ok=True)
    # A file a human moved to _rejected/ must never come back. Without this the
    # fetcher re-downloaded both 1955 Amsterdam street scenes at a higher
    # resolution the round after they were thrown out, and a critic found them
    # sitting in the bar. Curation that the tool undoes is not curation.
    rej = os.path.join(OUT, '_rejected')
    thrown = set()
    if os.path.isdir(rej):
        for f in os.listdir(rej):
            thrown.add(re.sub(r'^ppl_\d+_', '', f).rsplit('.', 1)[0].lower())
    have = {f for f in os.listdir(OUT)}
    n = len([f for f in have if f.lower().endswith(('.jpg', '.jpeg', '.png'))])
    seen, cands = set(), []
    for q in QUERIES:
        try:
            d = api({'action': 'query', 'list': 'search', 'srsearch': 'filetype:bitmap ' + q,
                     'srnamespace': 6, 'srlimit': 30})
        except Exception as e:
            print(f'  search miss "{q}": {e}', file=sys.stderr); time.sleep(6); continue
        hits = d.get('query', {}).get('search', [])
        k = 0
        for h in hits:
            t = h['title']
            if t in seen or BAD.search(t): continue
            seen.add(t); cands.append(t); k += 1
        print(f'  "{q}": {len(hits)} hits, +{k} kept')
    print(f'{len(cands)} candidates, {n} local')

    creds = []
    for i in range(0, len(cands), 25):
        if n >= WANT: break
        try:
            pages = api({'action': 'query', 'titles': '|'.join(cands[i:i+25]),
                         'prop': 'imageinfo', 'iiprop': 'url|size|extmetadata',
                         'iiurlwidth': 1024})
        except Exception as e:
            print(f'  info miss: {e}', file=sys.stderr); time.sleep(8); continue
        for p in pages.get('query', {}).get('pages', []):
            if n >= WANT: break
            ii = (p.get('imageinfo') or [None])[0]
            if not ii or ii.get('width', 0) < 900 or ii.get('height', 0) < 640: continue
            em  = ii.get('extmetadata', {})
            lic = em.get('LicenseShortName', {}).get('value', '')
            if not FREE.search(lic): continue
            base = p['title'].split(':', 1)[1]
            stem, _, ext = base.rpartition('.')
            # Truncate the STEM, never the whole name: [:60] on the full string
            # silently ate the extension on long titles, and an extensionless
            # file is invisible to every *.jpg glob in this repo -- including
            # the one counting how big the bar is. Three files hid that way.
            safe = re.sub(r'[^A-Za-z0-9_.-]', '_', stem)[:52] + '.' + (ext.lower() or 'jpg')
            if re.sub(r'[^A-Za-z0-9_.-]', '_', stem).lower()[:52] in \
               {t[:52] for t in thrown}:
                print(f'  skip (previously rejected) {stem[:40]}')
                continue
            dest = os.path.join(OUT, f'ppl_{n:02d}_{safe}')
            if os.path.exists(dest): continue
            url = ii.get('thumburl') or ii.get('url')
            try:
                req = urllib.request.Request(url, headers={'User-Agent': UA})
                with urllib.request.urlopen(req, timeout=45) as r:
                    data = r.read()
            except Exception as e:
                print(f'  dl miss {base[:38]}: {e}', file=sys.stderr); time.sleep(1.5); continue
            if len(data) < 60000: continue
            open(dest, 'wb').write(data)
            art = re.sub(r'\s+', ' ', html.unescape(
                re.sub(r'<[^>]+>', ' ', em.get('Artist', {}).get('value', 'unknown')))).strip()[:80]
            creds.append(f"- `{os.path.basename(dest)}` — {art} — {lic} — "
                         f"https://commons.wikimedia.org/wiki/{urllib.parse.quote(p['title'])}")
            n += 1
            print(f'  [{n}] {os.path.basename(dest)}  {ii["width"]}x{ii["height"]}  {lic}')
            time.sleep(1.2)
    if creds:
        with open(os.path.join(OUT, 'CREDITS.md'), 'a') as f:
            f.write('\n'.join(creds) + '\n')
    print(f'done: {n} files -- CURATE BY HAND before scoring anything against them')

main()
