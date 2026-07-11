#!/usr/bin/env python3
"""Generate Friday Decider app icons.

A calm PNW mark: a warm sunset disc over layered ridgelines, on the
brand pine background. No transparency on the apple-touch icon (iOS
composites white behind transparent pixels). Maskable variants keep
the mark inside the central 80% safe zone.
"""
import os
import math
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(__file__), "..", "icons")
os.makedirs(OUT, exist_ok=True)

PINE = (46, 94, 78)          # brand green background
PINE_DK = (32, 66, 55)
RIDGE_1 = (26, 54, 45)
RIDGE_2 = (20, 44, 37)
SUN = (226, 138, 78)         # warm terracotta-gold disc
SUN_HI = (240, 176, 120)
PAPER = (251, 247, 240)


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def draw_icon(size, scale=1.0):
    """scale<1 shrinks the artwork toward the center (maskable safe zone)."""
    S = 1024
    img = Image.new("RGB", (S, S), PINE)
    d = ImageDraw.Draw(img)

    # vertical sky gradient
    for y in range(S):
        t = y / S
        d.line([(0, y), (S, y)], fill=lerp(PINE, PINE_DK, t))

    cx = S / 2
    # sun disc
    sun_r = S * 0.17
    sun_cy = S * 0.40
    for i in range(int(sun_r), 0, -1):
        t = 1 - i / sun_r
        col = lerp(SUN, SUN_HI, t * 0.6)
        d.ellipse([cx - i, sun_cy - i, cx + i, sun_cy + i], fill=col)

    # back ridge
    def ridge(base_y, amp, color, points=7, phase=0.0):
        pts = [(0, S)]
        for k in range(points + 1):
            x = S * k / points
            y = base_y + math.sin(k * 1.3 + phase) * amp - (amp if k % 2 else 0)
            pts.append((x, y))
        pts.append((S, S))
        d.polygon(pts, fill=color)

    ridge(S * 0.56, S * 0.06, RIDGE_1, points=6, phase=0.4)
    # front twin peaks (the hero)
    peak_y = S * 0.62
    d.polygon([(S * 0.06, S), (cx - S * 0.02, peak_y), (S * 0.40, S)], fill=RIDGE_2)
    d.polygon([(S * 0.34, S), (cx + S * 0.16, peak_y + S * 0.03), (S * 0.96, S)], fill=RIDGE_2)
    # snow cap on hero peak
    d.polygon([(cx - S * 0.055, peak_y + S * 0.05), (cx - S * 0.02, peak_y),
               (cx + S * 0.015, peak_y + S * 0.045), (cx - S * 0.005, peak_y + S * 0.05),
               (cx - S * 0.03, peak_y + S * 0.035)], fill=PAPER)

    if scale < 1.0:
        # composite shrunk artwork onto a full pine background (maskable)
        bg = Image.new("RGB", (S, S), PINE)
        small = img.resize((int(S * scale), int(S * scale)), Image.LANCZOS)
        off = (S - small.width) // 2
        bg.paste(small, (off, off))
        img = bg

    return img.resize((size, size), Image.LANCZOS)


def rounded(img, radius_frac=0.22):
    """Apple-touch icon: iOS rounds corners itself, so ship a full square."""
    return img  # keep square/opaque; iOS applies the squircle mask


# Standard (square, opaque)
draw_icon(180).save(os.path.join(OUT, "apple-touch-icon-180.png"))
draw_icon(192).save(os.path.join(OUT, "icon-192.png"))
draw_icon(512).save(os.path.join(OUT, "icon-512.png"))
# Maskable (artwork within central 80% safe zone)
draw_icon(192, scale=0.78).save(os.path.join(OUT, "maskable-192.png"))
draw_icon(512, scale=0.78).save(os.path.join(OUT, "maskable-512.png"))

print("icons written to", os.path.abspath(OUT))
for f in sorted(os.listdir(OUT)):
    print("  ", f)
