#!/usr/bin/env python3
"""Regenerate CampusOS binary image assets from the base64-encoded master icon.

Why this exists: the GitHub snapshot-push connector only accepts UTF-8 text
files, so PNGs cannot be pushed directly. The master icon (white graduation
cap on transparent background) is stored as tools/icon-512.png.b64, and this
script regenerates every derived PNG at build time (CI) from it.

Outputs (matching the layout Capacitor expects):
- public/icons/icon-512.png, icon-192.png (PWA manifest icons)
- android/app/src/main/res/mipmap-*/ic_launcher.png,
  ic_launcher_round.png (direct resize of the master icon)
- android/app/src/main/res/mipmap-*/ic_launcher_foreground.png
  (white graduation cap extracted from the master icon, scaled so the cap is
  57.4% of the canvas width and centred on transparency, matching the
  adaptive-icon foreground generated for the local build)
- android/app/src/main/res/drawable*/splash.png (solid white, 11 sizes)

Requires: Pillow (pip install pillow). Run from the repo root.
"""

import base64
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# density -> (launcher px, foreground px)
DENSITIES = {
    "mdpi": (48, 108),
    "hdpi": (72, 162),
    "xhdpi": (96, 216),
    "xxhdpi": (144, 324),
    "xxxhdpi": (192, 432),
}

# splash drawable dir -> (width, height); all solid white
SPLASHES = {
    "drawable": (480, 320),
    "drawable-land-hdpi": (800, 480),
    "drawable-land-mdpi": (480, 320),
    "drawable-land-xhdpi": (1280, 720),
    "drawable-land-xxhdpi": (1600, 960),
    "drawable-land-xxxhdpi": (1920, 1280),
    "drawable-port-hdpi": (480, 800),
    "drawable-port-mdpi": (320, 480),
    "drawable-port-xhdpi": (720, 1280),
    "drawable-port-xxhdpi": (960, 1600),
    "drawable-port-xxxhdpi": (1280, 1920),
}

FOREGROUND_SCALE = 0.574  # icon width relative to the foreground canvas


def main() -> int:
    b64_path = os.path.join(ROOT, "tools", "icon-512.png.b64")
    with open(b64_path, "r", encoding="utf-8") as f:
        master = Image.open(__import__("io").BytesIO(base64.b64decode(f.read()))).convert("RGBA")

    # PWA icons
    icons_dir = os.path.join(ROOT, "public", "icons")
    os.makedirs(icons_dir, exist_ok=True)
    master.save(os.path.join(icons_dir, "icon-512.png"))
    master.resize((192, 192), Image.LANCZOS).save(os.path.join(icons_dir, "icon-192.png"))

    # The adaptive-icon foreground is the white graduation cap alone (no blue
    # square — the blue comes from the adaptive background). Extract the white
    # pixels and crop to them.
    white = Image.new("RGBA", master.size, (0, 0, 0, 0))
    px = master.load()
    wpx = white.load()
    for y in range(master.height):
        for x in range(master.width):
            r, g, b, a = px[x, y]
            if a == 255 and r == 255 and g == 255 and b == 255:
                wpx[x, y] = (255, 255, 255, 255)
    cap = white.crop(white.getchannel("A").getbbox())

    # Launcher icons
    res_dir = os.path.join(ROOT, "android", "app", "src", "main", "res")
    for density, (launcher_px, fg_px) in DENSITIES.items():
        d = os.path.join(res_dir, f"mipmap-{density}")
        os.makedirs(d, exist_ok=True)
        resized = master.resize((launcher_px, launcher_px), Image.LANCZOS)
        resized.save(os.path.join(d, "ic_launcher.png"))
        resized.save(os.path.join(d, "ic_launcher_round.png"))
        fg_w = max(1, round(fg_px * FOREGROUND_SCALE))
        fg_h = max(1, round(fg_w * cap.height / cap.width))
        fg = cap.resize((fg_w, fg_h), Image.LANCZOS)
        canvas = Image.new("RGBA", (fg_px, fg_px), (0, 0, 0, 0))
        canvas.paste(fg, ((fg_px - fg_w) // 2, (fg_px - fg_h) // 2), fg)
        canvas.save(os.path.join(d, "ic_launcher_foreground.png"))

    # Splash screens (solid white)
    for dirname, (w, h) in SPLASHES.items():
        d = os.path.join(res_dir, dirname)
        os.makedirs(d, exist_ok=True)
        Image.new("RGBA", (w, h), (255, 255, 255, 255)).save(os.path.join(d, "splash.png"))

    print("icons regenerated OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
