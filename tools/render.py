"""Pixel-accurate mockup of the One Minute Weather layout at 200x228 (Pebble Time 2 / emery).
Uses the real PebbleOS Gothic bitmaps and Lato rasterised exactly like Pebble's fontgen.
Phase-2 design mockup. The C code is validated directly by check_c.py."""
import math, glob
from PIL import Image, ImageDraw
from pbf import PBF, TTF

W, H = 200, 228
CX, CY = 100, 102            # same centre as One Minute Hand on emery (radius 100, +2 offset)
R_OUT = 100

import os
HERE = os.path.dirname(os.path.abspath(__file__))
def pf(n): return PBF(os.path.join(HERE, 'fonts', n + '.pbf'))   # PebbleOS system fonts (Apache-2.0)
G14B, G18B, G28 = pf('GOTHIC_14_BOLD'), pf('GOTHIC_18_BOLD'), pf('GOTHIC_28')

# Pebble 64-colour palette names used by the themes
C = dict(black=(0,0,0), white=(255,255,255), lgray=(170,170,170), dgray=(85,85,85),
         picton=(85,170,255), cobalt=(0,85,170), cerulean=(0,170,255), chrome=(255,170,0),
         orange=(255,85,0), yellow=(255,255,0), elecblue=(85,255,255), red=(255,0,0))

THEME = dict(bg='black', hour='white', hand='picton', hand_in='cobalt', tick0='white',
             tick5='white', tick1='white', wday='white', mdate='white', wtext='white',
             tmax='chrome', tmin='picton', pop='white', mm='cerulean', icon='lgray')

LAYOUT = dict(
    hour_px=32, hour_clear=5, hand_len=40, hand_w=10,
    tick0=(5, 13), tick15=(5, 10), tick5=(3, 9), tick1=(1, 5),   # (width, length)
    # small blocks: (x, y) top-left; 40 x 33; order = days +1..+5 clockwise from top
    blocks=[(145, 62), (145, 109), (80, 152), (15, 109), (15, 62)],
    bw=40, top_y=17,
)

def polar(r, deg, c=(CX, CY)):
    a = math.radians(deg)
    return (c[0] + math.sin(a) * r, c[1] - math.cos(a) * r)

def text_w(f, s): return f.width(s)

def draw_text_c(img, f, cx, y, s, col):     # centred horizontally on cx
    f.draw(img, int(round(cx - text_w(f, s) / 2)), y, s, col)

def ink_box(f, s):
    top, bot = 99, -99
    for ch in s:
        w, h, l, t, a, b = f.glyph(ord(ch))
        if h: top, bot = min(top, t), max(bot, t + h)
    return top, bot

# ---------- weather icons (14 x 11), built from primitives available in Pebble GContext ----------
def cloud(d, x, y, col):
    d.ellipse([x+1, y+3, x+7, y+9], fill=col); d.ellipse([x+4, y+0, x+11, y+7], fill=col)
    d.ellipse([x+8, y+3, x+13, y+8], fill=col); d.rectangle([x+3, y+5, x+11, y+8], fill=col)

def icon(d, x, y, kind, col, accent_rain, accent_sun):
    if kind == 'sun':
        d.ellipse([x+4, y+2, x+10, y+8], fill=accent_sun)
        for k in range(8):
            a = math.radians(k * 45); cx, cy = x+7, y+5
            d.line([cx+math.sin(a)*4.5, cy-math.cos(a)*4.5, cx+math.sin(a)*6, cy-math.cos(a)*6], fill=accent_sun)
    elif kind == 'partly':
        d.ellipse([x+1, y+0, x+7, y+6], fill=accent_sun)
        d.ellipse([x+3, y+4, x+8, y+9], fill=col); d.ellipse([x+6, y+2, x+12, y+8], fill=col)
        d.rectangle([x+4, y+7, x+12, y+9], fill=col)
    elif kind == 'cloud':
        cloud(d, x, y+1, col)
    elif kind in ('rain', 'drizzle', 'snow', 'storm'):
        cloud(d, x, y-1, col)
        if kind == 'rain':
            for k in (3, 6, 9): d.line([x+k+1, y+9, x+k, y+11], fill=accent_rain)
        elif kind == 'drizzle':
            for k in (3, 6, 9): d.point([x+k, y+10], fill=accent_rain)
        elif kind == 'snow':
            for k in (3, 7, 11): d.point([(x+k, y+10), (x+k-1, y+10), (x+k+1, y+10), (x+k, y+9), (x+k, y+11)], fill=C['white'])
        else:
            d.line([x+8, y+7, x+6, y+10, x+9, y+10, x+7, y+13], fill=C['yellow'])
    elif kind == 'fog':
        for k, (a, b) in enumerate([(1, 12), (3, 13), (1, 11)]): d.line([x+a, y+2+k*3, x+b, y+2+k*3], fill=col)

def drop(d, x, y, col):  # 5x7 raindrop
    d.polygon([(x+2, y), (x+4, y+4), (x+2, y+6), (x, y+4)], fill=col)
    d.ellipse([x, y+2, x+4, y+6], fill=col)

def tfmt(v): return '--' if v is None else '%d' % v

# ---------- layers ----------
def layer_ticks(img, th, L):
    d = ImageDraw.Draw(img)
    for m in range(60):
        if m == 0: w, ln, col = *L['tick0'], th['tick0']
        elif m % 15 == 0: w, ln, col = *L['tick15'], th['tick5']
        elif m % 5 == 0: w, ln, col = *L['tick5'], th['tick5']
        else: w, ln, col = *L['tick1'], th['tick1']
        d.line([polar(R_OUT - ln, m * 6), polar(R_OUT, m * 6)], fill=C[col], width=w)

HOUR_FONT = {}
def hour_font(px):
    if px not in HOUR_FONT: HOUR_FONT[px] = TTF(os.path.join(HERE, '..', 'resources', 'fonts', 'Lato-Bold.ttf'), px)
    return HOUR_FONT[px]

def layer_hour(img, th, L, hour, minute):
    f = hour_font(L['hour_px']); s = str(hour)
    t, b = ink_box(f, s)
    hw, hh = f.width(s) / 2, (b - t) / 2
    a = math.radians(minute * 6 + 180); ux, uy = math.sin(a), -math.cos(a)
    # place the hour directly behind the pivot: box edge keeps a fixed clearance from the centre
    dist = L['hour_clear'] + abs(ux) * hw + abs(uy) * hh
    px, py = CX + ux * dist, CY + uy * dist
    f.draw(img, int(round(px - f.width(s) / 2)), int(round(py - (t + b) / 2)), s, C[th['hour']])

def layer_hand(img, th, L, minute):
    d = ImageDraw.Draw(img); ln, w = L['hand_len'], L['hand_w']
    a = math.radians(minute * 6)
    def rot(x, y): return (CX + x*math.cos(a) - y*math.sin(a), CY + x*math.sin(a) + y*math.cos(a))
    pts = [rot(0, 0), rot(w/2, -ln*0.3), rot(0, -ln), rot(-w/2, -ln*0.3)]
    d.polygon(pts, fill=C[th['hand_in']], outline=C[th['hand']], width=2)
    d.ellipse([CX-3, CY-3, CX+3, CY+3], fill=C[th['hand']])

def layer_calendar(img, th, wday, mdate):
    G28.draw(img, 3, 192, wday, C[th['wday']])
    G28.draw(img, W - 3 - G28.width(mdate), 192, mdate, C[th['mdate']])

def block(img, d, th, x, y, bw, day, F=None):
    if F is G18B: return block18(img, d, th, x, y, bw, day)
    # row 1: weekday + icon ; row 2: max min ; row 3: precipitation probability
    lab = day['lab']; lw = G14B.width(lab)
    gap = 2; tot = lw + gap + 14; x0 = x + (bw - tot) // 2
    G14B.draw(img, x0, y - 5, lab, C[th['wtext']])           # Gothic14: ink starts 5px below origin
    icon(d, x0 + lw + gap, y - 1, day['ic'], C[th['icon']], C[th['mm']], C['chrome'])
    mx, mn = tfmt(day['max']), tfmt(day['min'])
    tw = G14B.width(mx) + 4 + G14B.width(mn); tx = x + (bw - tw) // 2
    G14B.draw(img, tx, y + 7, mx, C[th['tmax']]); G14B.draw(img, tx + G14B.width(mx) + 4, y + 7, mn, C[th['tmin']])
    p = '--' if day['pop'] is None else '%d%%' % day['pop']
    pw = 6 + G14B.width(p); px = x + (bw - pw) // 2
    drop(d, px, y + 25, C[th['mm']]); G14B.draw(img, px + 6, y + 19, p, C[th['pop']])

def block18(img, d, th, x, y, bw, day):
    lab = day['lab']; lw = G18B.width(lab); tot = lw + 3 + 14; x0 = x + (bw - tot) // 2
    G18B.draw(img, x0, y - 7, lab, C[th['wtext']]); icon(d, x0 + lw + 3, y, day['ic'], C[th['icon']], C[th['mm']], C['chrome'])
    mx, mn = tfmt(day['max']), tfmt(day['min'])
    tw = G18B.width(mx) + 5 + G18B.width(mn); tx = x + (bw - tw) // 2
    G18B.draw(img, tx, y + 8, mx, C[th['tmax']]); G18B.draw(img, tx + G18B.width(mx) + 5, y + 8, mn, C[th['tmin']])
    p = '--' if day['pop'] is None else '%d%%' % day['pop']
    pw = 7 + G18B.width(p); px = x + (bw - pw) // 2
    drop(d, px, y + 31, C[th['mm']]); G18B.draw(img, px + 7, y + 23, p, C[th['pop']])

def top_block(img, d, th, L, today, lang):
    y = L['top_y']
    lab = today['lab']; lw = G14B.width(lab); x0 = CX - (lw + 2 + 14) // 2
    G14B.draw(img, x0, y - 5, lab, C[th['wtext']]); icon(d, x0 + lw + 2, y - 1, today['ic'], C[th['icon']], C[th['mm']], C['chrome'])
    mm = today['mm_s']; mw = 7 + G18B.width(mm); mx = CX - mw // 2
    drop(d, mx, y + 14, C[th['mm']]); G18B.draw(img, mx + 7, y + 6, mm, C[th['mm']])
    a, b = tfmt(today['max']) + '°', tfmt(today['min']) + '°'
    p = '--' if today['pop'] is None else '%d%%' % today['pop']
    parts = [(a, th['tmax']), ('/', th['wtext']), (b, th['tmin'])]
    ws = [G18B.width(s) for s, _ in parts]; pw = G18B.width(p) + 6
    tot = sum(ws) + 4 + 8 + pw; x = CX - tot // 2
    for (s, c), w in zip(parts, ws): G18B.draw(img, x, y + 20, s, C[c]); x += w + 2
    x += 6; drop(d, x, y + 28, C[th['mm']]); G18B.draw(img, x + 6, y + 20, p, C[th['pop']])

def render(hour=13, minute=20, data=None, th=THEME, L=LAYOUT, wday='Sáb', mdate='21 Nov', lang='pt',
           layers=('ticks', 'weather', 'hour', 'hand', 'cal')):
    img = Image.new('RGB', (W, H), C[th['bg']]); d = ImageDraw.Draw(img)
    if 'ticks' in layers: layer_ticks(img, th, L)
    if 'weather' in layers and data:
        top_block(img, d, th, L, data[0], lang)
        for (x, y), day in zip(L['blocks'], data[1:]): block(img, d, th, x, y, L['bw'], day, L.get('font'))
    if 'hour' in layers: layer_hour(img, th, L, hour, minute)
    if 'hand' in layers: layer_hand(img, th, L, minute)
    if 'cal' in layers: layer_calendar(img, th, wday, mdate)
    return img

PT = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB']
EN = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

def sample(lang='pt', kind='normal'):
    names = PT if lang == 'pt' else EN
    today = 6  # Saturday 21 Nov 2026
    base = [('rain', 18, 9, 80, '5,4 mm'), ('partly', 19, 11, 20, None), ('storm', 18, 12, 60, None),
            ('rain', 16, 10, 90, None), ('sun', 20, 13, 10, None), ('cloud', 17, 12, 80, None)]
    if kind == 'extreme':
        base = [('snow', -12, -18, 100, '123,4 mm'), ('rain', -8, -15, 100, None), ('storm', 45, 38, 100, None),
                ('fog', -10, -10, 0, None), ('drizzle', 104, 88, 5, None), ('sun', 115, 99, 0, None)]
    if kind == 'nodata':
        base = [('cloud', None, None, None, '-- mm')] + [('cloud', None, None, None, None)] * 5
    out = []
    for i, (ic, a, b, p, mm) in enumerate(base):
        lab = (('HOJE' if lang == 'pt' else 'TODAY') if i == 0 else names[(today + i) % 7])
        out.append(dict(lab=lab, ic=ic, max=a, min=b, pop=p, mm_s=mm))
    if lang == 'en' and out[0]['mm_s']: out[0]['mm_s'] = out[0]['mm_s'].replace(',', '.')
    return out

LAYOUT4 = dict(LAYOUT, blocks=[(143, 82), (76, 150), (11, 82)], bw=46, font=G18B)

THEMES = {
 'Original': dict(THEME, tmax='white', tmin='picton', mm='picton', icon='lgray', pop='white'),
 'Meteo colorida': dict(THEME, tmax='chrome', tmin='picton', mm='cerulean', icon='lgray', pop='white', hand='chrome', hand_in='orange', tick0='chrome'),
 'Monocromático': dict(THEME, hand='white', hand_in='black', tmax='white', tmin='lgray', mm='white', icon='white', pop='lgray'),
 'Alto contraste': dict(bg='white', hour='black', hand='black', hand_in='black', tick0='black', tick5='black', tick1='black',
                        wday='black', mdate='black', wtext='black', tmax='black', tmin='black', pop='black', mm='black', icon='black'),
}
