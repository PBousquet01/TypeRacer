"""Makes a flat-background sprite transparent.

Floods the background away starting from the image edges, so colours that
also appear *inside* the artwork (white on a mask, say) are never touched —
they're enclosed by the outline and can't be reached from outside. Then it
clears the pale halo JPEG compression leaves along the edges and crops.

Run:  python3 scripts/remove-background.py ~/Desktop/joker.jpeg joker
"""

import sys
from collections import deque
from PIL import Image

source, name = sys.argv[1], sys.argv[2]
TOLERANCE = 42      # how far from the corner colour still counts as background
HALO_PASSES = 2

img = Image.open(source).convert("RGBA")
w, h = img.size
px = img.load()

# Assume the background is whatever colour sits in the corners.
corner = px[0, 0][:3]
print("background colour taken from the corner:", corner)


def is_background(p):
    return p[3] > 0 and max(abs(a - b) for a, b in zip(p[:3], corner)) <= TOLERANCE


queue = deque([(x, y) for x in range(w) for y in (0, h - 1)])
queue.extend((x, y) for y in range(h) for x in (0, w - 1))
seen = [[False] * h for _ in range(w)]
cleared = 0
while queue:
    x, y = queue.popleft()
    if x < 0 or y < 0 or x >= w or y >= h or seen[x][y]:
        continue
    seen[x][y] = True
    if not is_background(px[x, y]):
        continue
    px[x, y] = (0, 0, 0, 0)
    cleared += 1
    queue.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))

# Soften the compression fringe: pixels close to the background colour that
# still touch transparency are part of the fade, not the art.
for _ in range(HALO_PASSES):
    fringe = []
    for x in range(w):
        for y in range(h):
            p = px[x, y]
            if p[3] == 0:
                continue
            near = max(abs(a - b) for a, b in zip(p[:3], corner)) <= TOLERANCE + 45
            if near and any(
                0 <= x + dx < w and 0 <= y + dy < h and px[x + dx, y + dy][3] == 0
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))
            ):
                fringe.append((x, y))
    for x, y in fringe:
        px[x, y] = (0, 0, 0, 0)
    cleared += len(fringe)

art = img.crop(img.getbbox())
art.save(f"public/{name}.png")
print(f"cleared {cleared} px | wrote public/{name}.png {art.size} | aspect {art.width / art.height:.4f}")
