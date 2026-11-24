"""Replay the drawing log of tools/host/host (the real watchface C code) at 200x228
with the real Pebble fonts, approximating Pebble's primitives (round-capped thick lines)."""
import os, subprocess, sys
from PIL import Image, ImageDraw
sys.path.insert(0, os.path.dirname(__file__))
from render import G14B, G18B, G28, hour_font

HERE = os.path.dirname(os.path.abspath(__file__))
HOST = os.path.join(HERE, 'host', 'host')
FONTS = {'G14B': G14B, 'G18B': G18B, 'G28': G28}

def _hour_px():
    import re
    t = open(os.path.join(HERE, '..', 'src', 'c', 'hour_gen.h')).read()
    return {'HOURS': int(re.search(r'HOUR_S_PX (\d+)', t).group(1)), 'HOURL': int(re.search(r'HOUR_L_PX (\d+)', t).group(1))}
HOUR_PX = _hour_px()

def run_host(layers, hour, minute, wday=6, mday=21, mon=10, lang=1, theme=0, ndays=6, blob='normal',
             date_fmt=0, time_fmt=2, nowutc=1795268580, precip=0):
    b = '-' if blob is None else os.path.join(HERE, 'fixtures', blob + '.bin')
    args = [HOST, layers, str(hour), str(minute), str(wday), str(mday), str(mon), str(lang), str(theme),
            str(ndays), b, str(date_fmt), str(time_fmt), str(nowutc), str(precip)]
    return subprocess.run(args, capture_output=True, text=True, check=True).stdout

def rgb(h): v = int(h, 16); return (v >> 16, (v >> 8) & 255, v & 255)

def replay(log, bg=True):
    lines = log.splitlines()
    bgc = rgb(lines[0].split()[1]) if bg else (0, 0, 0)
    img = Image.new('RGB', (200, 228), bgc); d = ImageDraw.Draw(img)
    for ln in lines[1:]:
        if ln.startswith('#'): continue
        p = ln.split(' ')
        k = p[0]
        if k == 'L':
            x0, y0, x1, y1, w = map(int, p[1:6]); c = rgb(p[6])
            d.line([x0, y0, x1, y1], fill=c, width=w)
            if w > 1:
                r = w / 2 - 0.5
                for (x, y) in ((x0, y0), (x1, y1)): d.ellipse([x - r, y - r, x + r, y + r], fill=c)
        elif k == 'P':
            d.point((int(p[1]), int(p[2])), fill=rgb(p[3]))
        elif k == 'FC':
            x, y, r = map(int, p[1:4]); d.ellipse([x - r, y - r, x + r, y + r], fill=rgb(p[4]))
        elif k == 'DC':
            x, y, r = map(int, p[1:4]); d.ellipse([x - r, y - r, x + r, y + r], outline=rgb(p[4]))
        elif k == 'FR':
            x, y, w, h = map(int, p[1:5])
            if w > 0 and h > 0: d.rectangle([x, y, x + w - 1, y + h - 1], fill=rgb(p[5]))
        elif k == 'DR':
            x, y, w, h = map(int, p[1:5]); d.rectangle([x, y, x + w - 1, y + h - 1], outline=rgb(p[5]))
        elif k in ('PF', 'PO'):
            w = int(p[1]); c = rgb(p[2]); pts = list(zip(map(int, p[3::2]), map(int, p[4::2])))
            if k == 'PF': d.polygon(pts, fill=c)
            else: d.polygon(pts, outline=c, width=w)
        elif k == 'BM':
            fn, x, y, c = p[1], int(p[2]), int(p[3]), rgb(p[4])
            bm = Image.open(os.path.join(HERE, '..', 'resources', fn)).convert('RGBA')
            solid = Image.new('RGB', bm.size, c)
            img.paste(solid, (x, y), bm.split()[3])
        elif k == 'T':
            font, x, y, c = p[1], int(p[2]), int(p[3]), rgb(p[4]); s = ' '.join(p[5:])
            if font in ('HOURS', 'HOURL'):
                f = hour_font(HOUR_PX[font])
            else:
                f = FONTS[font]
            f.draw(img, x, y, s, c)
    return img

def frame(*a, **kw):
    return replay(run_host(*a, **kw))
