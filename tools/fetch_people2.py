#!/usr/bin/env python3
"""Fetch CC-licensed photos of people shopping -- HTML path.

The Commons *API* rate-limits this host hard (429 through a 16s backoff), so
this reads the ordinary category pages and pulls files through
Special:FilePath, which is the file server rather than the API. Licence is read
off each file's own description page.

Attribution lands in reference/people/CREDITS.md. Nothing here is shipped in
the game -- these are the bar the character rounds are judged against.
"""
import html, os, re, sys, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT  = os.path.join(ROOT, 'reference', 'people')
UA   = 'choppricer-reference/1.0 (local game dev; github.com/hurtz)'
WANT = 24

CATS = ['Shopping_in_supermarkets', 'People_shopping', 'Supermarket_customers',
        'Grocery_shopping', 'Cashiers', 'Shoppers', 'Shopping_carts',
        'Customers', 'Supermarkets_in_the_United_States',
        'Checkout_counters', 'Retail_workers', 'Shopping_baskets']

def get(url, tries=4):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    for a in range(tries):
        try:
            with urllib.request.urlopen(req, timeout=40) as r: return r.read()
        except Exception as e:
            if a == tries - 1: raise
            time.sleep(2.5 * (a + 1))

FILE_RE = re.compile(r'href="/wiki/(File:[^"#?]+\.(?:jpg|jpeg|JPG|JPEG|png))"')
LIC_RE  = re.compile(r'(CC BY-SA [\d.]+|CC BY [\d.]+|CC0|Public domain|CC-BY-SA-[\d.]+)', re.I)
AUT_RE  = re.compile(r'id="fileinfotpl_aut".*?</td>\s*<td[^>]*>(.*?)</td>', re.S)

def titles():
    seen, out = set(), []
    for c in CATS:
        try:
            page = get(f'https://commons.wikimedia.org/wiki/Category:{c}').decode('utf8','replace')
        except Exception as e:
            print(f'  cat miss {c}: {e}', file=sys.stderr); continue
        found = 0
        for m in FILE_RE.finditer(page):
            t = urllib.parse.unquote(m.group(1))
            if t in seen: continue
            seen.add(t); out.append(t); found += 1
        print(f'  {c}: {found}')
        time.sleep(0.8)
    return out

def main():
    os.makedirs(OUT, exist_ok=True)
    n = len([f for f in os.listdir(OUT) if f.lower().endswith(('.jpg','.jpeg','.png'))])
    ts = titles()
    print(f'{len(ts)} candidates, {n} already local')
    creds = []
    for t in ts:
        if n >= WANT: break
        base = t.split(':',1)[1]
        try:
            desc = get('https://commons.wikimedia.org/wiki/' + urllib.parse.quote(t)).decode('utf8','replace')
        except Exception as e:
            print(f'  desc miss {base}: {e}', file=sys.stderr); continue
        lm = LIC_RE.search(desc)
        if not lm:
            time.sleep(0.4); continue
        lic = lm.group(1)
        am = AUT_RE.search(desc)
        art = html.unescape(re.sub(r'<[^>]+>', ' ', am.group(1))).strip()[:80] if am else 'see file page'
        art = re.sub(r'\s+', ' ', art)
        safe = re.sub(r'[^A-Za-z0-9_.-]', '_', base)[:64]
        dest = os.path.join(OUT, f'ppl_{n:02d}_{safe}')
        if os.path.exists(dest): continue
        url = 'https://commons.wikimedia.org/wiki/Special:FilePath/' + urllib.parse.quote(base) + '?width=1500'
        try:
            data = get(url)
        except Exception as e:
            print(f'  dl miss {base}: {e}', file=sys.stderr); continue
        if len(data) < 45000:
            print(f'  too small {base}'); continue
        open(dest,'wb').write(data)
        creds.append(f"- `{os.path.basename(dest)}` — {art} — {lic} — "
                     f"https://commons.wikimedia.org/wiki/{urllib.parse.quote(t)}")
        n += 1
        print(f'  [{n}] {os.path.basename(dest)}  {len(data)//1024}kB  {lic}')
        time.sleep(0.6)
    with open(os.path.join(OUT,'CREDITS.md'),'a') as f:
        f.write('\n'.join(creds) + '\n')
    print(f'done: {n} files')

main()
