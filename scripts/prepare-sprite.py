"""Turns the original JPEG into a clean transparent sprite.

The source was saved as JPEG, so its "transparent" background is really a
faint white/#efefef checkerboard, and compression left a pale halo around the
outline. This script:
  1. floods the background away starting from the image edges, so the bird's
     own white pixels (eye, face, tail) are never touched — they're enclosed
     by the black outline and can't be reached from outside;
  2. snaps every remaining pixel to the sprite's ten real colours, which
     removes JPEG speckle;
  3. crops to the bird.

Run:  python3 scripts/prepare-sprite.py path/to/Chocobo_sprite
"""

import sys
from collections import deque
from PIL import Image

SOURCE = sys.argv[1] if len(sys.argv) > 1 else "../Chocobo_sprite"

OUTLINE, DARK = (0, 0, 0), (31, 18, 28)
BODY, HILITE, SHADE1, SHADE2 = (251, 192, 0), (240, 227, 0), (138, 91, 35), (131, 99, 61)
RED, PINK, WHITE, BLUE = (234, 74, 48), (214, 73, 149), (254, 254, 254), (28, 66, 175)
CORE = [OUTLINE, DARK, BODY, HILITE, SHADE1, SHADE2, RED, PINK, WHITE, BLUE]


def background_ish(p):
    """Pale and unsaturated: the checkerboard, or a JPEG halo fading into it."""
    r, g, b = p[0], p[1], p[2]
    return min(r, g, b) > 150 and (max(r, g, b) - min(r, g, b)) < 45


def main():
    img = Image.open(SOURCE).convert("RGBA")
    w, h = img.size
    px = img.load()

    queue = deque([(x, y) for x in range(w) for y in (0, h - 1)])
    queue.extend((x, y) for y in range(h) for x in (0, w - 1))
    seen = [[False] * h for _ in range(w)]
    while queue:
        x, y = queue.popleft()
        if x < 0 or y < 0 or x >= w or y >= h or seen[x][y]:
            continue
        seen[x][y] = True
        if not background_ish(px[x, y]):
            continue
        px[x, y] = (0, 0, 0, 0)
        queue.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))

    for x in range(w):
        for y in range(h):
            r, g, b, a = px[x, y]
            if a:
                px[x, y] = (*min(CORE, key=lambda c: (c[0]-r)**2 + (c[1]-g)**2 + (c[2]-b)**2), 255)

    img = img.crop(img.getbbox())
    img.save("public/chocobo.png")
    print("wrote public/chocobo.png", img.size)


if __name__ == "__main__":
    main()
