"""Fetch reviewed product references and create small WebP catalogue assets.

Run with the bundled Python (Pillow) and cwebp. Pixel analysis only calculates
CSS framing; no bottle, packaging, label, or background content is synthesized.
"""
import concurrent.futures
import io
import json
from pathlib import Path
import re
import subprocess
import sys
import urllib.request
from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parent.parent
RESEARCH = ROOT / 'research/maison-alhambra'
ASSETS = ROOT / 'dist/assets'
CACHE = Path('/private/tmp/drip-maison-reference-images')
CACHE.mkdir(exist_ok=True)
old = json.loads((RESEARCH / 'images.json').read_text()) if (RESEARCH / 'images.json').exists() else []
items = []
for filename in sys.argv[1:] or ['research-01-31.json', 'research-32-62.json', 'research-63-92.json']:
    path = RESEARCH / filename
    if not path.exists():
        continue
    data = json.loads(path.read_text())
    items.extend(data if isinstance(data, list) else data['products'])

def fetch(p):
    number = p['number']
    url = p['imageUrl']
    if not url.startswith('https://'):
        raise ValueError(f'Unsafe image URL for {number}')
    cached = CACHE / f'{number:02d}.source'
    if not cached.exists():
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=40) as response:
            data = response.read(12_000_001)
        if len(data) > 12_000_000:
            raise ValueError(f'Image too large: {number}')
        cached.write_bytes(data)
    data = cached.read_bytes()
    im = Image.open(io.BytesIO(data))
    im.load()
    if min(im.size) < 150:
        raise ValueError(f'Image too small: {number}')
    # Read-only background-distance analysis for CSS containment and centering.
    rgba = im.convert('RGBA')
    white = Image.new('RGBA', im.size, 'white')
    white.alpha_composite(rgba)
    rgb = white.convert('RGB')
    sample = rgb.copy()
    sample.thumbnail((500, 500))
    delta = ImageChops.difference(sample, Image.new('RGB', sample.size, 'white')).convert('L')
    bbox = delta.point(lambda v: 255 if v > 28 else 0).getbbox()
    w, h = sample.size
    if bbox:
        left, top, right, bottom = bbox
        longest = max(w, h)
        scale = min(.84 / ((right-left)/longest), .80 / ((bottom-top)/longest), 2.1)
        x = (w/2-(left+right)/2)/longest*100
        y = (h/2-(top+bottom)/2)/longest*100
    else:
        scale, x, y = .95, 0, 0
    name = f'maison-{number:02d}.webp'
    target = ASSETS / name
    # Pillow handles uncommon source formats; encoding changes only resolution/quality.
    intermediate = CACHE / f'{number:02d}.png'
    im.thumbnail((900, 900), Image.Resampling.LANCZOS)
    im.save(intermediate, format='PNG')
    subprocess.run(['/opt/homebrew/bin/cwebp', '-quiet', '-q', '84', '-m', '6', str(intermediate), '-o', str(target)], check=True)
    return {'number': number, 'image': 'assets/'+name, 'scale': round(scale, 3), 'x': round(x, 3), 'y': round(y, 3),
            'width': im.width, 'height': im.height, 'bytes': target.stat().st_size, 'url': url,
            'sourceUrl': p.get('imageSourceUrl') or p.get('source') or p['noteSources'][0]['url']}

results, errors = [], []
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
    futures = {pool.submit(fetch, p): p for p in items}
    for future in concurrent.futures.as_completed(futures):
        try:
            results.append(future.result())
        except Exception as error:
            errors.append({'number': futures[future]['number'], 'error': str(error)})
merged = {p['number']: p for p in old}
merged.update({p['number']: p for p in results})
photos = [merged[k] for k in sorted(merged)]
(RESEARCH / 'images.json').write_text(json.dumps(photos, indent=2)+'\n')
layouts = {p['image']: {'source': p['image'], 'scale': p['scale'], 'x': p['x'], 'y': p['y'], 'clip': [0,0,0,0]} for p in photos}
(ROOT / 'dist/maison-photo-layouts.mjs').write_text('// Generated CSS framing for the reviewed product reference photos.\nexport const maisonPhotoLayouts='+json.dumps(layouts, separators=(',', ':'))+';\n')
print(json.dumps({'downloaded': len(results), 'total': len(photos), 'bytes': sum(p['bytes'] for p in photos), 'errors': errors}, indent=2))
if errors:
    sys.exit(1)
