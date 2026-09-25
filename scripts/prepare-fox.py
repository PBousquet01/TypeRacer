"""Prepares the white fox mount from the downloaded sprite.

The source art (fox_sprite_by_isalealart, drawn on a 10px grid) is cropped at
the bottom of its canvas, so the legs run off the edge. This script trims the
empty canvas, then extends each leg down by two cells and finishes it with a
paw, leaving the rest of the artwork untouched.

Run:  python3 scripts/prepare-fox.py ~/Desktop/fox_sprite_by_isalealart_demera6-fullview.png
"""

import sys
from PIL import Image

CELL = 10
EXTRA_ROWS = 2
MAX_LEG_WIDTH = 4  # wider runs are the tail, not a leg
SOURCE = sys.argv[1] if len(sys.argv) > 1 else "../fox_sprite_by_isalealart_demera6-fullview.png"
PAW = (203, 219, 252, 255)  # the art's pale blue, used as the paw shading


def main():
    src = Image.open(SOURCE).convert("RGBA")
    art = src.crop(src.getbbox())
    cols, rows = art.width // CELL, art.height // CELL

    out = Image.new("RGBA", (art.width, art.height + EXTRA_ROWS * CELL), (0, 0, 0, 0))
    out.paste(art, (0, 0))

    # Find the runs of filled cells along the bottom row.
    bottom = [art.getpixel((c * CELL + CELL // 2, art.height - CELL // 2)) for c in range(cols)]
    runs, start = [], None
    for c, px in enumerate(bottom + [(0, 0, 0, 0)]):
        if px[3] > 0 and start is None:
            start = c
        elif px[3] == 0 and start is not None:
            runs.append((start, c - 1))
            start = None

    legs = [r for r in runs if r[1] - r[0] + 1 <= MAX_LEG_WIDTH]
    print("runs along the bottom:", runs, "\nlegs to extend:", legs)

    for first, last in legs:
        for c in range(first, last + 1):
            colour = bottom[c]
            for extra in range(EXTRA_ROWS):
                y = rows * CELL + extra * CELL
                fill = colour if extra < EXTRA_ROWS - 1 else PAW  # paw tip
                for dy in range(CELL):
                    for dx in range(CELL):
                        out.putpixel((c * CELL + dx, y + dy), fill)

    # Saved tight to the artwork: a fox is long and low, so lib/chocobos.js
    # gives it its own aspect ratio instead of squeezing it into a square.
    out.save("public/fox-white.png")
    print("wrote public/fox-white.png", out.size, "| aspect %.2f" % (out.width / out.height))


if __name__ == "__main__":
    main()
