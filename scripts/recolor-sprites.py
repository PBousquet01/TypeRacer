"""Makes one sprite per rider colour from public/chocobo.png.

Only the four feather colours are swapped; the eye, beak, feet, pink accents
and the black outline are left exactly as drawn, so every bird keeps its face.
Tweak VARIANTS and run:  python3 scripts/recolor-sprites.py
"""

from PIL import Image

# The sprite's real palette (everything else in the JPEG was compression noise).
OUTLINE, DARK = (0, 0, 0), (31, 18, 28)
BODY, HILITE, SHADE1, SHADE2 = (251, 192, 0), (240, 227, 0), (138, 91, 35), (131, 99, 61)
RED, PINK, WHITE, BLUE = (234, 74, 48), (214, 73, 149), (254, 254, 254), (28, 66, 175)
CORE = [OUTLINE, DARK, BODY, HILITE, SHADE1, SHADE2, RED, PINK, WHITE, BLUE]

# body, highlight, shadow, mid-shadow
VARIANTS = {
    "yellow": (BODY, HILITE, SHADE1, SHADE2),
    "red":    ((198, 48, 38),  (240, 122, 92),  (110, 28, 22),  (140, 52, 40)),
    "blue":   ((58, 124, 214), (126, 199, 245), (28, 62, 122),  (48, 92, 156)),
    "green":  ((70, 163, 62),  (150, 214, 90),  (34, 84, 32),   (58, 116, 48)),
    "black":  ((58, 58, 70),   (110, 110, 126), (30, 30, 38),   (44, 44, 54)),
    "gold":   ((226, 176, 58), (255, 240, 176), (126, 88, 18),  (168, 128, 56)),
}


def nearest(pixel):
    return min(CORE, key=lambda c: sum((a - b) ** 2 for a, b in zip(c, pixel)))


def main():
    src = Image.open("public/chocobo.png").convert("RGBA")
    w, h = src.size

    # Snap every pixel to the core palette once (removes JPEG speckle).
    snapped = Image.new("RGBA", (w, h))
    sp, dp = src.load(), snapped.load()
    for x in range(w):
        for y in range(h):
            r, g, b, a = sp[x, y]
            dp[x, y] = (0, 0, 0, 0) if a < 128 else (*nearest((r, g, b)), 255)

    for name, (body, hi, s1, s2) in VARIANTS.items():
        out = snapped.copy()
        op = out.load()
        table = {BODY: body, HILITE: hi, SHADE1: s1, SHADE2: s2}
        for x in range(w):
            for y in range(h):
                r, g, b, a = op[x, y]
                if a and (r, g, b) in table:
                    op[x, y] = (*table[(r, g, b)], 255)
        out.save(f"public/chocobo-{name}.png")
        print("wrote", f"public/chocobo-{name}.png")


if __name__ == "__main__":
    main()
