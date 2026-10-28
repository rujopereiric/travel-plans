#!/usr/bin/env python3
"""Save small copies of the tjalda.is campsite photos in img/camp/, so they work offline.

tjalda.is serves its images without CORS headers, so the service worker can't check them and won't keep them.
Copies inside the app are same-origin and are kept like any other app file. Needs ImageMagick (convert).

Run from the repo root:  python3 iceland-planner/tools/campsite-photos.py DOWNLOAD_DIR
DOWNLOAD_DIR is a scratch folder for the originals. Existing copies are skipped. Then run tools/campsites.py.
"""
import json, os, re, subprocess, sys, time, urllib.request

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(HERE, 'img', 'camp')
dl = os.path.abspath(sys.argv[1]); os.makedirs(dl, exist_ok=True); os.makedirs(OUT, exist_ok=True)
camps = json.load(open(os.path.join(HERE, 'parts', 'campsites-tjalda.json')))['campsites']
done = failed = 0
for c in camps:
    if not c.get('image') or re.search(r'kort|map', c['image'].rsplit('/', 1)[-1], re.I): continue   # site maps aren't used
    out = os.path.join(OUT, c['slug'] + '.jpg')
    if os.path.exists(out): continue
    raw = os.path.join(dl, c['slug'])
    try:
        req = urllib.request.Request(c['image'], headers={'User-Agent': 'travel-plans campsite photos (github.com/rujopereiric/travel-plans)'})
        with urllib.request.urlopen(req, timeout=30) as r:
            if not r.headers.get('content-type', '').startswith('image/'): raise ValueError(r.headers.get('content-type'))
            open(raw, 'wb').write(r.read())
        # 640 px wide, the size the cards show; metadata stripped
        subprocess.run(['convert', raw + '[0]', '-auto-orient', '-resize', '640x480>', '-strip', '-quality', '72', '-interlace', 'JPEG', 'jpeg:' + out],
                       check=True, timeout=60)
        done += 1
    except Exception as e:
        failed += 1; print('failed', c['slug'], e, file=sys.stderr)
    time.sleep(0.2)
print(f'{done} saved, {failed} failed, {len(os.listdir(OUT))} in img/camp/')
