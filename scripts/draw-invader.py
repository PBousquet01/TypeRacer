"""Draws the classic arcade invader.

The supplied space.jpeg was a watermarked stock preview (a repeating diagonal
word across the artwork, and its "eyes" were a transparency checkerboard
baked into the JPEG), so this draws the shape from scratch instead.

Run:  python3 scripts/draw-invader.py
"""

from PIL import Image

SCALE = 40
INK = (74, 214, 96)  # arcade green: readable on the dark track and on cream panels

GRID = [
    "..#.....#..",
    "...#...#...",
    "..#######..",
    ".##.###.##.",
    "###########",
    "#.#######.#",
    "#.#.....#.#",
    "...##.##...",
]

width, height = len(GRID[0]), len(GRID)
img = Image.new("RGBA", (width, height), (0, 0, 0, 0))
px = img.load()
for y, row in enumerate(GRID):
    for x, ch in enumerate(row):
        if ch == "#":
            px[x, y] = (*INK, 255)

img = img.resize((width * SCALE, height * SCALE), Image.NEAREST)
img.save("public/invader.png")
print(f"wrote public/invader.png {img.size} | aspect {img.width / img.height:.4f}")
