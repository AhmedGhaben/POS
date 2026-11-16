"""Render the scoped SVG master with existing Pillow; no downloads/dependencies added.

Only the master's rect/gradient and absolute M/C/Q/Z path subset is supported.
Fail on an unsupported path command instead of silently producing different art.
Run from any directory: python tools/branding/generate-icons.py
"""
from pathlib import Path
import math
import re
import xml.etree.ElementTree as ET
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
MASTER = ROOT / 'apps/web/public/brand/storbit-app-icon.svg'
NS = {'s': 'http://www.w3.org/2000/svg'}


def rgb(value):
    return tuple(int(value[i:i + 2], 16) for i in (1, 3, 5))


def interpolate(stops, position):
    position = min(1, max(0, position))
    for (a, av), (b, bv) in zip(stops, stops[1:]):
        if position <= b:
            factor = (position - a) / (b - a)
            return tuple(x + (y - x) * factor for x, y in zip(av, bv))
    return stops[-1][1]


def path_points(data):
    tokens = iter(re.findall(r'[A-Za-z]|-?\d+(?:\.\d+)?', data))
    points = []
    current = (0, 0)
    for command in tokens:
        if command == 'Z':
            break
        count = {'M': 2, 'C': 6, 'Q': 4}[command]
        values = [float(next(tokens)) for _ in range(count)]
        if command == 'M':
            current = tuple(values)
            points.append(current)
            continue
        start = current
        controls = [tuple(values[i:i + 2]) for i in range(0, count, 2)]
        for step in range(1, 65):
            t = step / 64
            curve = [start] + controls
            while len(curve) > 1:
                curve = [tuple(a + (b - a) * t for a, b in zip(x, y)) for x, y in zip(curve, curve[1:])]
            points.append(curve[0])
        current = controls[-1]
    return points


def render(size=1024):
    svg = ET.parse(MASTER).getroot()
    warm = svg.find('.//s:linearGradient', NS)
    violet = svg.find('.//s:radialGradient', NS)
    warm_stops = [(float(stop.attrib['offset']), rgb(stop.attrib['stop-color'])) for stop in warm]
    violet_stops = [(float(stop.attrib['offset']), (float(stop.attrib['stop-opacity']),)) for stop in violet]
    cool = rgb(violet[0].attrib['stop-color'])
    image = Image.new('RGB', (size, size))
    pixels = []
    for y in range(size):
        for x in range(size):
            sx, sy = (x + .5) * 512 / size, (y + .5) * 512 / size
            base = interpolate(warm_stops, sx / 512)
            distance = math.hypot(sx - float(violet.attrib['cx']), sy - float(violet.attrib['cy'])) / float(violet.attrib['r'])
            alpha = interpolate(violet_stops, distance)[0]
            pixels.append(tuple(round(a * (1 - alpha) + b * alpha) for a, b in zip(base, cool)))
    image.putdata(pixels)
    # Supersample just the vector masks for crisp, antialiased small exports.
    scale = size * 4 / 512
    mask = Image.new('L', (size * 4, size * 4))
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size * 4 - 1, size * 4 - 1), radius=float(svg.find('s:rect', NS).attrib['rx']) * scale, fill=255)
    image = image.convert('RGBA')
    image.putalpha(mask.resize((size, size), Image.Resampling.LANCZOS))
    star = svg.find('s:path', NS)
    mask = Image.new('L', (size * 4, size * 4))
    ImageDraw.Draw(mask).polygon([(x * scale, y * scale) for x, y in path_points(star.attrib['d'])], fill=255)
    image.paste(rgb(star.attrib['fill']) + (255,), mask=mask.resize((size, size), Image.Resampling.LANCZOS))
    return image


if __name__ == '__main__':
    image = render()
    outputs = {
        'apps/web/public/brand/storbit-app-icon.png': 1024,
        'apps/web/public/pwa-192.png': 192,
        'apps/web/public/pwa-512.png': 512,
        'apps/web/public/apple-touch-icon.png': 180,
        'apps/desktop/build/icon.png': 1024,
        'apps/desktop/build/icon-192.png': 192,
        'apps/desktop/build/icon-256.png': 256,
        'apps/desktop/build/icon-512.png': 512,
    }
    for target, size in outputs.items():
        image.resize((size, size), Image.Resampling.LANCZOS).save(ROOT / target)
    for target in ['apps/desktop/build/icon.ico', 'apps/web/public/favicon.ico']:
        image.save(ROOT / target, format='ICO', sizes=[(n, n) for n in [16, 32, 48, 64, 128, 256]])
    # Keep the old URL serving the new artwork for cached icon references.
    (ROOT / 'apps/web/public/pwa-icon.svg').write_bytes(MASTER.read_bytes())
    print('Generated SVG alias, 8 PNG exports and 2 multi-resolution ICO files from the SVG master.')
