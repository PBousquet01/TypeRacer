"""Draws the berry mount: a round kawaii blueberry with a leaf.

Hand-drawn on a grid (one character per pixel), then blown up to sprite size.
Inspired by a pixel-art berry, not traced from it.

Edit GRID / PALETTE and re-run:  python3 scripts/draw-berry.py
"""

from PIL import Image

SCALE = 20

PALETTE = {
    ".": None,                 # transparent
    "K": (26, 22, 34),         # outline
    "C": (86, 92, 158),        # dark cap on top
    "B": (124, 128, 214),      # berry body
    "D": (96, 100, 182),       # shaded side
    "L": (170, 174, 238),      # highlight
    "G": (150, 214, 110),      # leaf
    "S": (112, 178, 78),       # leaf shade
    "P": (244, 124, 124),      # blush
}

GRID = [
    "......................",
    "................KKKK..",
    "..............KKGGGGK.",
    "....KKKKKK...KGGGGGGK.",
    "...KCCCCCCKKKKGGGGSGK.",
    "..KCCCCCCCCKKGGGSSGK..",
    ".KBBLBBBBBBBKKGSSGK...",
    ".KBLLBBBBBBBBKKKKK....",
    "KBLLBBBBBBBBBDDK......",
    "KBBBBBBBBBBBBDDK......",
    "KBBKKBBBBKKBBBDDK.....",
    "KBBKKBBBBKKBBBDDK.....",
    "KBBBBBBBBBBBBBDDK.....",
    "KPPBBBBKKBBBBPPDK.....",
    "KPPBBBBBBBBBBPPDK.....",
    ".KBBBBBBBBBBBBDDK.....",
    ".KBBBBBBBBBBBDDK......",
    "..KBBBBBBBBBDDK.......",
    "...KKBBBBBBDKK........",
    ".....KKKKKKK..........",
    "......................",
    "......................",
]


def main():
    width = max(len(row) for row in GRID)
    rows = [row.ljust(width, ".") for row in GRID]
    img = Image.new("RGBA", (width, len(rows)), (0, 0, 0, 0))
    px = img.load()
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            colour = PALETTE[ch]
            if colour:
                px[x, y] = (*colour, 255)
    img = img.crop(img.getbbox())
    img = img.resize((img.width * SCALE, img.height * SCALE), Image.NEAREST)
    img.save("public/berry.png")
    print(f"wrote public/berry.png {img.size} | aspect {img.width / img.height:.4f}")


if __name__ == "__main__":
    main()
