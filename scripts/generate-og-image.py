#!/usr/bin/env python3
"""
Generate the Resumora social preview card (1200x630) using Pillow.

Reusable template: brand navy gradient, gold accents, Resumora wordmark,
tagline, and destination URL. Output -> public/og-image.png (served by Hosting).
"""
from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630
NAVY = (10, 26, 58)          # #0a1a3a
NAVY_MID = (26, 43, 74)      # #1a2b4a
GOLD = (212, 175, 55)        # #d4af37
GOLD_BRIGHT = (244, 232, 193)  # #f4e8c1
CREAM = (249, 245, 235)      # #f9f5eb

BOLD = "C:/Windows/Fonts/arialbd.ttf"
REGULAR = "C:/Windows/Fonts/arial.ttf"


def load_font(path, size):
    return ImageFont.truetype(path, size)


def vertical_gradient(draw):
    for y in range(H):
        t = y / (H - 1)
        r = int(NAVY[0] + (NAVY_MID[0] - NAVY[0]) * t)
        g = int(NAVY[1] + (NAVY_MID[1] - NAVY[1]) * t)
        b = int(NAVY[2] + (NAVY_MID[2] - NAVY[2]) * t)
        draw.line([(0, y), (W, y)], fill=(r, g, b))


def main():
    img = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(img)
    vertical_gradient(d)

    # Gold accents (top-left)
    d.rounded_rectangle([64, 64, 200, 82], radius=9, fill=GOLD)
    d.rounded_rectangle([64, 96, 140, 114], radius=9, fill=GOLD)

    # Brand wordmark
    d.text((W // 2, 208), "RESUMORA", font=load_font(BOLD, 116), fill=GOLD_BRIGHT, anchor="mm")

    # Tagline
    d.text(
        (W // 2, 332),
        "AI Resume & Interview Masterclass",
        font=load_font(BOLD, 44),
        fill=CREAM,
        anchor="mm",
    )

    # Value props
    d.text(
        (W // 2, 406),
        "ATS-optimized resumes  \u00b7  Cinematic EN / FR interview prep  \u00b7  Luxury PDFs",
        font=load_font(REGULAR, 27),
        fill=CREAM,
        anchor="mm",
    )

    # One-time, no subscription
    d.text(
        (W // 2, 470),
        "One-time payment \u00b7 No subscription",
        font=load_font(REGULAR, 24),
        fill=(212, 175, 55),
        anchor="mm",
    )

    # Destination URL
    d.text((W // 2, 552), "resumora.net", font=load_font(BOLD, 32), fill=GOLD, anchor="mm")

    # Bottom gold rule
    d.rounded_rectangle([W // 2 - 70, 592, W // 2 + 70, 600], radius=4, fill=GOLD)

    img.save("public/og-image.png", "PNG", optimize=True)
    print(f"saved public/og-image.png {img.size[0]}x{img.size[1]}")


if __name__ == "__main__":
    main()
