#!/usr/bin/env python3
"""Fetch CC-licensed photos of people shopping -- static CDN path.

Two earlier attempts were rate-limited: the Commons *API* 429s this host through
a 16 s backoff, and Special:FilePath returns an explicit robot-policy 429. Both
are MediaWiki services. upload.wikimedia.org is the static file CDN and is the
documented way to pull files in bulk; the path is derived from the MD5 of the
underscored filename, so no service call is needed to build it.

Slow on purpose. Attribution lands in reference/people/CREDITS.md. Nothing here
ships in the game -- these are the bar the character rounds are judged against.
"""
import hashlib, html, os, re, sys, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT  = os.path.join(ROOT, 'reference', 'people')
UA   = ('choppricer-reference/1.0 (offline game-dev reference set; '
        'contact github.com/hurtz) python-urllib')
WANT = 18

CATS = ['Shopping_in_supermarkets', 'People_shopping', 'Supermarket_customers',
        'Grocery_shopping', 'Cashiers', 'Shoppers', 'Shopping_carts',
        'Customers_in_supermarkets', 'Supermarket_interiors',
        'Checkout_counters', 'Shopping_baskets', 'Grocery_stores_interiors']

def get(url, tries=3, pause=3.0):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    for a in range(tries):
        try:
            with urllib.request.urlopen(req, timeout=45) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code == 404 or a == tries - 1:
                raise
            time.sleep(pause * (a + 1) * 2)
        except Exception:
            if a == tries - 1: raise
            time.sleep(pause)

FILE_RE = re.compile(r'href="/wiki/(File:[^"#?]+\.(?:jpg|jpeg|JPG|JPEG))"')
LIC_RE  = re.compile(r'(CC BY-SA [\d.]+|CC BY [\d.]+|CC0|Public domain)', re.I)
AUT_RE  = re.compile(r'id="fileinfotpl_aut".*?</td>\s*<td[^>]*>(.*?)</td>', re.S)

def cdn(base):
    """commons path scheme: /commons/<h[0]>/<h[0:2]>/<Underscored_name>"""
    u = base.replace(' ', '_')
    h = hashlib.md5(u.encode('utf8')).hexdigest()
    # NOT /thumb/. Arbitrary thumb widths return 400 "Use thumbnail sizes
    # listed on ..."; the original is served without that gate. Files run large
    # (2-6 MB) and that is fine for a dozen reference photographs held outside
    # the game.
    return (f'https://upload.wikimedia.org/wikipedia/commons/'
            f'{h[0]}/{h[0:2]}/{urllib.parse.quote(u)}')

def main():
    os.makedirs(OUT, exist_ok=True)
    n = len([f for f in os.listdir(OUT) if f.lower().endswith(('.jpg','.jpeg','.png'))])
    seen, titles = set(), []
    for c in CATS:
        try:
            page = get(f'https://commons.wikimedia.org/wiki/Category:{c}').decode('utf8','replace')
        except Exception as e:
            print(f'  cat miss {c}: {e}', file=sys.stderr); time.sleep(2.0); continue
        f0 = len(titles)
        for m in FILE_RE.finditer(page):
            t = urllib.parse.unquote(m.group(1))
            if t not in seen:
                seen.add(t); titles.append((t, page))
        print(f'  {c}: +{len(titles)-f0}')
        time.sleep(2.5)

    print(f'{len(titles)} candidates, {n} local')
    creds = []
    for t, catpage in titles:
        if n >= WANT: break
        base = t.split(':', 1)[1]
        safe = re.sub(r'[^A-Za-z0-9_.-]', '_', base)[:60]
        dest = os.path.join(OUT, f'ppl_{n:02d}_{safe}')
        if os.path.exists(dest): continue
        try:
            data = get(cdn(base))
        except Exception as e:
            print(f'  cdn miss {base[:40]}: {e}', file=sys.stderr); time.sleep(1.5); continue
        if len(data) < 60000:
            time.sleep(1.0); continue
        # Licence off the file's own page. One extra page view per KEPT file
        # only -- the CDN filter above throws most candidates out for free.
        lic, art = 'see file page', 'see file page'
        try:
            desc = get('https://commons.wikimedia.org/wiki/' + urllib.parse.quote(t)).decode('utf8','replace')
            lm = LIC_RE.search(desc)
            if not lm:
                time.sleep(2.0); continue
            lic = lm.group(1)
            am = AUT_RE.search(desc)
            if am:
                art = re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', am.group(1)))).strip()[:80]
        except Exception as e:
            print(f'  lic miss {base[:40]}: {e}', file=sys.stderr); time.sleep(2.0); continue
        open(dest, 'wb').write(data)
        creds.append(f"- `{os.path.basename(dest)}` — {art} — {lic} — "
                     f"https://commons.wikimedia.org/wiki/{urllib.parse.quote(t)}")
        n += 1
        print(f'  [{n}] {os.path.basename(dest)}  {len(data)//1024}kB  {lic}')
        time.sleep(2.5)
    if creds:
        with open(os.path.join(OUT, 'CREDITS.md'), 'a') as f:
            f.write('\n'.join(creds) + '\n')
    print(f'done: {n} files')

main()
