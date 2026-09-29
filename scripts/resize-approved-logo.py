from pathlib import Path

from PIL import Image


project_root = Path(__file__).resolve().parents[1]
source = project_root / "assets/images/coachora-icon.png"
public = project_root / "public"

with Image.open(source) as original:
    approved_logo = original.convert("RGBA")
    for size, destination in {
        32: public / "favicon-32.png",
        180: public / "apple-touch-icon.png",
        192: public / "icon-192.png",
        512: public / "icon-512.png",
    }.items():
        resized = approved_logo.resize((size, size), Image.Resampling.LANCZOS)
        resized.save(destination, "PNG", optimize=True)
