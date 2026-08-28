#!/usr/bin/env python3
"""Fetch CC-licensed photos of people shopping into reference/people/.

The bar for the character rounds. Wikimedia Commons only, attribution recorded.
"""
import json, os, re, sys, time, urllib.parse, urllib.request

OUT = os.path.join(os.path.dirname(__file__), '..', 'reference', 'people')
API = 'https://commons.wikimedia.org/w/api.php'
UA  = 'choppricer-reference-fetch/1.0 (local game dev; contact via github.com/hurtz)'

CATS = [
    'Category:Shopping in supermarkets',
    'Category:People shopping',
    'Category:Supermarket customers',
    'Category:Shopping carts in supermarkets',
    'Category:Cashiers',
    'Category:Checkout counters',
    'Category:Grocery shopping',
    'Category:Shoppers',
]
SEARCHES = [
    'supermarket shopper aisle',
    'grocery store customer shelf',
    'woman shopping supermarket trolley',
    'man reaching shelf supermarket',
    'supermarket checkout cashier customer',
    'family shopping grocery store',
]
WANT = 26

def api(params, tries=6):
    """Commons rate-limits hard. Back off instead of dying: an aborted fetch
    left the bar at two photographs once already."""
    params = dict(params, format='json', formatversion=2)
    url = API + '?' + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    for a in range(tries):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                time.sleep(1.2)
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code not in (429, 503) or a == tries - 1: raise
            w = 4 * (a + 1)
            print(f'  {e.code}, sleeping {w}s', file=sys.stderr)
            time.sleep(w)

def titles():
    seen, out = set(), []
    for c in CATS:
        try:
            d = api({'action':'query','list':'categorymembers','cmtitle':c,
                     'cmtype':'file','cmlimit':40})
            for m in d.get('query',{}).get('categorymembers',[]):
                t = m['title']
                if t not in seen: seen.add(t); out.append(t)
        except Exception as e:
            print(f'  cat miss {c}: {e}', file=sys.stderr)
        time.sleep(1.0)
    for s in SEARCHES:
        try:
            d = api({'action':'query','list':'search','srsearch':f'filetype:bitmap {s}',
                     'srnamespace':6,'srlimit':25})
            for m in d.get('query',{}).get('search',[]):
                t = m['title']
                if t not in seen: seen.add(t); out.append(t)
        except Exception as e:
            print(f'  search miss {s}: {e}', file=sys.stderr)
    return out

def info(batch):
    d = api({'action':'query','titles':'|'.join(batch),'prop':'imageinfo',
             'iiprop':'url|size|extmetadata','iiurlwidth':1600})
    return d.get('query',{}).get('pages',[])

FREE = re.compile(r'(cc[- ]by|cc0|public domain|pd-)', re.I)

def main():
    os.makedirs(OUT, exist_ok=True)
    have = len([f for f in os.listdir(OUT) if f.lower().endswith(('.jpg','.jpeg','.png'))])
    ts = titles()
    print(f'{len(ts)} candidate titles, {have} already local')
    creds, n = [], have
    for i in range(0, len(ts), 20):
        if n >= WANT: break
        for p in info(ts[i:i+20]):
            if n >= WANT: break
            ii = (p.get('imageinfo') or [None])[0]
            if not ii: continue
            if ii.get('width',0) < 900 or ii.get('height',0) < 600: continue
            em = ii.get('extmetadata', {})
            lic = em.get('LicenseShortName',{}).get('value','')
            if not FREE.search(lic): continue
            url = ii.get('thumburl') or ii.get('url')
            name = re.sub(r'[^A-Za-z0-9_.-]', '_', p['title'].split(':',1)[-1])[:70]
            if not name.lower().endswith(('.jpg','.jpeg','.png')): name += '.jpg'
            dest = os.path.join(OUT, f'ppl_{n:02d}_{name}')
            if os.path.exists(dest): continue
            try:
                req = urllib.request.Request(url, headers={'User-Agent': UA})
                with urllib.request.urlopen(req, timeout=45) as r, open(dest,'wb') as f:
                    f.write(r.read())
            except Exception as e:
                print(f'  dl miss {name}: {e}', file=sys.stderr); continue
            art = re.sub(r'<[^>]+>', '', em.get('Artist',{}).get('value','unknown')).strip()
            creds.append(f"- `{os.path.basename(dest)}` — {art} — {lic} — "
                         f"https://commons.wikimedia.org/wiki/{urllib.parse.quote(p['title'])}")
            n += 1
            print(f'  [{n}] {os.path.basename(dest)}  {ii["width"]}x{ii["height"]}  {lic}')
            time.sleep(0.25)
    with open(os.path.join(OUT,'CREDITS.md'),'a') as f:
        f.write('\n'.join(creds) + '\n')
    print(f'done: {n} files in reference/people/')

main()
