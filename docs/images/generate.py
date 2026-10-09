#!/usr/bin/env python3
"""Writes overview.svg and icon.svg next to this file.

The image repeats facts that live elsewhere: the default shortcuts (the schema
in the extension directory), the tile grid (TILE_CELLS in rules-format.js), the
wctl command syntax and the supported shell versions. Change them here and run:

    python3 docs/images/generate.py
    gjs -m docs/images/render.js docs/images/overview.svg overview.png 1280 640
    gjs -m docs/images/render.js docs/images/icon.svg icon.png 256 256

The PNG files are what the GitHub social preview and the extensions.gnome.org
listing take; they are uploaded by hand and not kept in the repository.
"""
from html import escape
from pathlib import Path

OUT = Path(__file__).parent

BG, CARD, CARD_EDGE = "#1d1d20", "#2a2a2e", "#3d3d42"
TEXT, MUTED, ACCENT, ACCENT_SOFT = "#ffffff", "#b6b6bd", "#3584e4", "#1c4f8f"
GREEN, YELLOW, CELL = "#8ff0a4", "#f9f06b", "#3a3a40"
SANS = "system-ui, -apple-system, 'Segoe UI', 'Adwaita Sans', Cantarell, 'Helvetica Neue', Arial, sans-serif"
MONO = "ui-monospace, 'SF Mono', 'JetBrains Mono', Menlo, Consolas, 'DejaVu Sans Mono', monospace"

# position -> (first column, column span, first row, row span) on the 4x2 grid
SPANS = {
    "top-left": (0, 1, 0, 1), "top-center": (1, 2, 0, 1), "top-right": (3, 1, 0, 1),
    "left": (0, 1, 0, 2), "center": (1, 2, 0, 2), "right": (3, 1, 0, 2),
    "bottom-left": (0, 1, 1, 1), "bottom-center": (1, 2, 1, 1), "bottom-right": (3, 1, 1, 1),
    "wide-left": (0, 3, 0, 2), "wide-right": (1, 3, 0, 2),
}
NUMPAD = [["7", "top-left"], ["8", "top-center"], ["9", "top-right"],
          ["4", "left"], ["5", "center"], ["6", "right"],
          ["1", "bottom-left"], ["2", "bottom-center"], ["3", "bottom-right"]]


def monitor(x, y, cell, position):
    """A 4x2 mini monitor with one position highlighted."""
    gap = 3
    parts = [f'<rect x="{x - 5}" y="{y - 5}" width="{cell * 4 + gap * 3 + 10}" height="{cell * 2 + gap + 10}" rx="6" fill="{BG}" stroke="{CARD_EDGE}"/>']
    for row in range(2):
        for col in range(4):
            parts.append(f'<rect x="{x + col * (cell + gap)}" y="{y + row * (cell + gap)}" width="{cell}" height="{cell}" rx="2" fill="{CELL}"/>')
    col, cols, row, rows = SPANS[position]
    parts.append(
        f'<rect x="{x + col * (cell + gap)}" y="{y + row * (cell + gap)}" '
        f'width="{cols * cell + (cols - 1) * gap}" height="{rows * cell + (rows - 1) * gap}" rx="3" fill="{ACCENT}"/>')
    return "".join(parts)


def keycap(x, y, label, width=26):
    return (f'<rect x="{x}" y="{y}" width="{width}" height="24" rx="5" fill="{BG}" stroke="{CARD_EDGE}"/>'
            f'<text x="{x + width / 2}" y="{y + 17}" text-anchor="middle" font-family="{MONO}" font-size="14" font-weight="700" fill="{TEXT}">{label}</text>')


def terminal(x, y, width, title, lines):
    """lines: list of lists of (text, colour) spans."""
    height = 44 + len(lines) * 26 + 14
    out = [f'<rect x="{x}" y="{y}" width="{width}" height="{height}" rx="12" fill="{CARD}" stroke="{CARD_EDGE}"/>',
           f'<text x="{x + 20}" y="{y + 28}" font-family="{SANS}" font-size="14" font-weight="600" fill="{MUTED}">{escape(title)}</text>']
    for index, spans in enumerate(lines):
        tspans = "".join(f'<tspan fill="{colour}">{escape(text)}</tspan>' for text, colour in spans)
        out.append(f'<text x="{x + 20}" y="{y + 62 + index * 26}" font-family="{MONO}" font-size="16" xml:space="preserve">{tspans}</text>')
    return "".join(out), height


def overview():
    W, H = 1280, 640
    svg = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" '
           f'aria-label="Window Control: wctl commands, a rules.json rule, and the numpad tile shortcuts on a 4 by 2 grid">',
           f'<rect width="{W}" height="{H}" rx="20" fill="{BG}"/>']

    # Left column: title, commands, a rule.
    svg.append(f'<text x="56" y="92" font-family="{SANS}" font-size="46" font-weight="800" fill="{TEXT}">Window Control</text>')
    svg.append(f'<text x="56" y="130" font-family="{SANS}" font-size="20" fill="{MUTED}">List, move and tile windows on GNOME Wayland.</text>')

    prompt = ("$ ", MUTED)
    commands = [
        [prompt, ("wctl list", TEXT)],
        [prompt, ("wctl tile ", TEXT), ("-c kitty ", GREEN), ("left", YELLOW)],
        [prompt, ("wctl place ", TEXT), ("focused ", GREEN), ("right top 50% 100%", YELLOW)],
        [prompt, ("wctl wait ", TEXT), ("-c kitty ", GREEN), ("--timeout 5", YELLOW)],
    ]
    card, height = terminal(56, 164, 520, "From a script: wctl, or plain D-Bus", commands)
    svg.append(card)

    rule = [
        [("[", MUTED)],
        [("  { ", MUTED), ('"match"', TEXT), (": { ", MUTED), ('"class"', TEXT), (": ", MUTED), ('"kitty"', GREEN), (" },", MUTED)],
        [("    ", MUTED), ('"tile"', TEXT), (": ", MUTED), ('"left"', YELLOW), (" }", MUTED)],
        [("]", MUTED)],
    ]
    card, _ = terminal(56, 164 + height + 24, 520, "On window creation: rules.json", rule)
    svg.append(card)
    svg.append(f'<text x="56" y="588" font-family="{SANS}" font-size="16" fill="{MUTED}">GNOME Shell 45 to 50  ·  a shell extension and the wctl command  ·  MIT</text>')

    # Right column: the numpad.
    left, top, tile_w, tile_h, gap, cell = 640, 164, 188, 118, 12, 30
    svg.append(f'<text x="{left}" y="92" font-family="{SANS}" font-size="14" font-weight="600" fill="{MUTED}" letter-spacing="1.5">FROM THE KEYBOARD</text>')
    x = left
    for label, width in (("Super", 64), ("Ctrl", 52)):
        svg.append(keycap(x, 108, label, width))
        svg.append(f'<text x="{x + width + 8}" y="126" font-family="{SANS}" font-size="16" fill="{MUTED}">+</text>')
        x += width + 26
    svg.append(f'<text x="{x}" y="126" font-family="{SANS}" font-size="16" fill="{MUTED}">a numpad key tiles the focused window</text>')

    for index, (key, position) in enumerate(NUMPAD):
        tx = left + (index % 3) * (tile_w + gap)
        ty = top + (index // 3) * (tile_h + gap)
        svg.append(f'<rect x="{tx}" y="{ty}" width="{tile_w}" height="{tile_h}" rx="12" fill="{CARD}" stroke="{CARD_EDGE}"/>')
        svg.append(monitor(tx + (tile_w - (cell * 4 + 9)) / 2, ty + 14, cell, position))
        svg.append(keycap(tx + 14, ty + tile_h - 34, key))
        svg.append(f'<text x="{tx + 50}" y="{ty + tile_h - 17}" font-family="{MONO}" font-size="14" fill="{MUTED}">{position}</text>')

    # The + key cycles the two wide positions.
    ty = top + 3 * (tile_h + gap)
    wide_w, wide_h, small = 3 * tile_w + 2 * gap, 60, 20
    svg.append(f'<rect x="{left}" y="{ty}" width="{wide_w}" height="{wide_h}" rx="12" fill="{CARD}" stroke="{CARD_EDGE}"/>')
    svg.append(keycap(left + 14, ty + 18, "+"))
    svg.append(f'<text x="{left + 50}" y="{ty + 35}" font-family="{MONO}" font-size="14" fill="{MUTED}">wide-right, then wide-left</text>')
    mx = left + wide_w - 2 * (small * 4 + 9) - 46
    svg.append(monitor(mx, ty + 9, small, "wide-right"))
    svg.append(monitor(mx + small * 4 + 9 + 28, ty + 9, small, "wide-left"))

    svg.append("</svg>")
    return "\n".join(svg)


def icon():
    S = 256
    svg = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {S} {S}" width="{S}" height="{S}" role="img" aria-label="Window Control icon">',
           '<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">'
           '<stop offset="0" stop-color="#3584e4"/><stop offset="1" stop-color="#1a5fb4"/></linearGradient></defs>',
           f'<rect x="12" y="12" width="232" height="232" rx="52" fill="url(#g)"/>',
           # the monitor
           '<rect x="40" y="62" width="176" height="112" rx="14" fill="#ffffff" fill-opacity="0.16" stroke="#ffffff" stroke-width="8"/>']
    cell, gap, x0, y0 = 32, 6, 56, 80
    for row in range(2):
        for col in (0, 3):
            svg.append(f'<rect x="{x0 + col * (cell + gap)}" y="{y0 + row * (cell + gap)}" width="{cell}" height="{cell}" rx="5" '
                       f'fill="#ffffff" fill-opacity="0.28"/>')
    # the tiled window, on the two centre columns
    svg.append(f'<rect x="{x0 + cell + gap}" y="{y0}" width="{2 * cell + gap}" height="{2 * cell + gap}" rx="6" fill="#ffffff"/>')
    # the stand
    svg.append('<rect x="116" y="174" width="24" height="18" fill="#ffffff"/>')
    svg.append('<rect x="84" y="190" width="88" height="10" rx="5" fill="#ffffff"/>')
    svg.append("</svg>")
    return "\n".join(svg)


(OUT / "overview.svg").write_text(overview() + "\n")
(OUT / "icon.svg").write_text(icon() + "\n")
