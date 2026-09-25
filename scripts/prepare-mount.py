"""Trims a transparent sprite down to its artwork and drops it in public/.

For sprites that already have real transparency (unlike the chocobo JPEG,
which needed scripts/prepare-sprite.py). Prints the aspect ratio to put in
lib/chocobos.js.

Run:  python3 scripts/prepare-mount.py ~/Downloads/miku.png miku
"""

import sys
from PIL import Image

source, name = sys.argv[1], sys.argv[2]
img = Image.open(source).convert("RGBA")
art = img.crop(img.getbbox())
art.save(f"public/{name}.png")
print(f"wrote public/{name}.png {art.size} | aspect {art.width / art.height:.4f}")
