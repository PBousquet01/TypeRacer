"""Turns a screenshot of a sprite into a clean transparent PNG.

Screenshots come scaled up with smoothing, on a flat background, often inside
page margins. This script:
  1. trims the surrounding page margins;
  2. resamples down to the sprite's logical resolution (averaging away the
     blur), then reduces to a small palette so the pixels are flat again;
  3. floods the background away from the edges inwards, so colours that also
     appear inside the artwork survive;
  4. crops and scales back up with hard pixel edges.

Run:  python3 scripts/prepare-screenshot.py <source> <name> [logical-width]
"""

import sys
from collections import deque
from PIL import Image

source, name = sys.argv[1], sys.argv[2]
LOGICAL_W = int(sys.argv[3]) if len(sys.argv) > 3 else 44
COLOURS = int(sys.argv[4]) if len(sys.argv) > 4 else 32  # keep enough for small accents (red boots, a flute)
SCALE = 8
TOL = 46

img = Image.open(source).convert("RGB")
w, h = img.size
px = img.load()


def whiteish(c):
    return min(c) > 225


def row_white(y):
    return all(whiteish(px[x, y]) for x in range(0, w, 3))


def col_white(x):
    return all(whiteish(px[x, y]) for y in range(0, h, 3))


top = next(y for y in range(h) if not row_white(y))
bottom = next(y for y in range(h - 1, -1, -1) if not row_white(y))
left = next(x for x in range(w) if not col_white(x))
right = next(x for x in range(w - 1, -1, -1) if not col_white(x))
panel = img.crop((left, top, right + 1, bottom + 1))
print("panel:", panel.size)

# Down to logical resolution (area average kills the upscaling blur), then a
# small palette so each pixel is one flat colour again.
logical_h = round(LOGICAL_W * panel.height / panel.width)
small = panel.resize((LOGICAL_W, logical_h), Image.BOX)
small = small.quantize(colors=COLOURS, method=Image.MEDIANCUT).convert("RGBA")
print("logical size:", small.size)

sw, sh = small.size
spx = small.load()
background = spx[0, 0][:3]
print("background colour:", background)

queue = deque([(x, y) for x in range(sw) for y in (0, sh - 1)])
queue.extend((x, y) for y in range(sh) for x in (0, sw - 1))
seen = [[False] * sh for _ in range(sw)]
while queue:
    x, y = queue.popleft()
    if x < 0 or y < 0 or x >= sw or y >= sh or seen[x][y]:
        continue
    seen[x][y] = True
    p = spx[x, y]
    if p[3] == 0 or max(abs(a - b) for a, b in zip(p[:3], background)) > TOL:
        continue
    spx[x, y] = (0, 0, 0, 0)
    queue.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))

art = small.crop(small.getbbox())
art = art.resize((art.width * SCALE, art.height * SCALE), Image.NEAREST)
art.save(f"public/{name}.png")
print(f"wrote public/{name}.png {art.size} | aspect {art.width / art.height:.4f}")
