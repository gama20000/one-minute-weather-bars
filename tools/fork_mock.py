"""Fork experiments (design renders, 200x228, real Pebble fonts):
A - smaller full circle + Dataload-style 6-day row at the bottom
B - current full circle + Dataload-style rain bars in the freed bottom strip
Both: weekday curved over the dial (top left), day of month top right, no month."""
import math, os, sys
from PIL import Image, ImageDraw
sys.path.insert(0, os.path.dirname(__file__))
import render as R
from render import C, G14B, G18B, G28, pf, icon, drop, hour_font

G24B = pf('GOTHIC_24_BOLD') if os.path.exists(os.path.join(R.HERE, 'fonts', 'GOTHIC_24_BOLD.pbf')) else G18B
TH = dict(R.THEMES['Meteo colorida'])

# live Lisbon forecast (Sun 22 Nov 2026): label, icon, max, min, pop, mm
DAYS_PT = [('HOJE', 'cloud', 17, 11, 0, 0.0), ('SEG', 'cloud', 16, 9, 0, 0.0), ('TER', 'rain', 17, 10, 63, 2.1),
           ('QUA', 'cloud', 16, 11, 5, 0.0), ('QUI', 'rain', 16, 9, 4, 0.0), ('SEX', 'fog', 15, 9, 13, 0.0)]
DAYS_PT = [('HOJE', 'rain', 17, 11, 85, 6.2), ('SEG', 'partly', 16, 9, 10, 0.0), ('TER', 'rain', 17, 10, 63, 2.1),
           ('QUA', 'cloud', 16, 11, 25, 0.0), ('QUI', 'rain', 16, 9, 90, 8.4), ('SEX', 'storm', 15, 9, 100, 14.0)]

def glyph_img(font, ch, col):
    w, h, l, t, adv, bits = font.glyph(ord(ch))
    im = Image.new('RGBA', (adv + 4, font.max_h + 8), (0, 0, 0, 0))
    font.draw(im, 2, 2, ch, col + (255,))
    return im, adv

def curved_text(img, font, s, cx, cy, r, mid_deg, col, clockwise=True):
    """Letters standing on an arc of radius r (baseline-ish), centred on mid_deg (0 = 12 o'clock)."""
    total = font.width(s)
    span = math.degrees(total / r)
    a = mid_deg - span / 2
    for ch in s:
        g, adv = glyph_img(font, ch, col)
        da = math.degrees(adv / r)
        ang = a + da / 2
        rot = g.rotate(-ang, resample=Image.NEAREST, expand=True)
        rr = r + font.max_h * 0.45
        x = cx + math.sin(math.radians(ang)) * rr
        y = cy - math.cos(math.radians(ang)) * rr
        img.paste(rot, (int(round(x - rot.width / 2)), int(round(y - rot.height / 2))), rot)
        a += da

def dial(img, cx, cy, r, ticks, minute, hour, hpx, hand_len, hand_w, th):
    d = ImageDraw.Draw(img)
    for m in range(60):
        if m == 0: w, ln, col = *ticks[0], th['tick0']
        elif m % 15 == 0: w, ln, col = *ticks[1], th['tick5']
        elif m % 5 == 0: w, ln, col = *ticks[2], th['tick5']
        else: w, ln, col = *ticks[3], th['tick1']
        if m == minute: ln = max(2, ln * 40 // 100)
        d.line([R.polar(r - ln, m * 6, (cx, cy)), R.polar(r, m * 6, (cx, cy))], fill=C[col], width=w)
    f = hour_font(hpx); s = str(hour); t, b = R.ink_box(f, s)
    hw, hh = f.width(s) / 2, (b - t) / 2
    a = math.radians(minute * 6 + 180); ux, uy = math.sin(a), -math.cos(a)
    dist = 5 + abs(ux) * hw + abs(uy) * hh
    f.draw(img, int(round(cx + ux * dist - hw)), int(round(cy + uy * dist - (t + b) / 2)), s, C[th['hour']])
    a = math.radians(minute * 6)
    def rot(x, y): return (cx + x*math.cos(a) - y*math.sin(a), cy + x*math.sin(a) + y*math.cos(a))
    d.polygon([rot(0, 0), rot(hand_w/2, -hand_len*0.3), rot(0, -hand_len), rot(-hand_w/2, -hand_len*0.3)],
              fill=C[th['hand_in']], outline=C[th['hand']], width=2)
    d.ellipse([cx-3, cy-3, cx+3, cy+3], fill=C[th['hand']])

def today_top(img, d, cx, y, day, th, big=True):
    F = G18B if big else G14B
    mm = ('%.1f mm' % day[5]).replace('.', ',')
    mw = 7 + F.width(mm); mx = cx - mw // 2
    drop(d, mx, y + 8 + (2 if big else 0), C[th['mm']]); F.draw(img, mx + 7, y, mm, C[th['mm']])
    a, b = '%d°' % day[2], '%d°' % day[3]
    parts = [(a, th['tmax']), ('/', th['wtext']), (b, th['tmin'])]
    tw = sum(F.width(p) + 2 for p, _ in parts); x = cx - tw // 2
    for p, c in parts: F.draw(img, x, y + (14 if big else 11), p, C[c]); x += F.width(p) + 2

def mm_txt(mm):
    # compact: one decimal below 10 mm, whole millimetres above (fits a 33 px column)
    if mm is None: return '--'
    return ('%.1f' % mm).replace('.', ',') if mm < 10 else '%d' % round(mm)

def rain_bar(d, x, y_bot, w, hmax, pop, th, track=True):
    if track: d.rectangle([x, y_bot - hmax, x + w - 1, y_bot], outline=C['dgray'])
    h = int(round(hmax * pop / 100))
    if h > 0: d.rectangle([x, y_bot - h, x + w - 1, y_bot], fill=C[th['mm']])

def variant_a(minute=20, hour=13, th=TH, days=DAYS_PT):
    img = Image.new('RGB', (200, 228), C[th['bg']]); d = ImageDraw.Draw(img)
    cx, cy, r = 100, 82, 80
    dial(img, cx, cy, r, [(4, 10), (4, 8), (3, 7), (1, 4)], minute, hour, 30, 32, 9, th)
    today_top(img, d, cx, 22, days[0], th, big=False)
    curved_text(img, G24B, 'Dom', cx, cy, r + 7, -50, C[th['wday']])
    curved_text(img, G24B, '22', cx, cy, r + 7, 47, C[th['mdate']])
    # Dataload row
    y0 = 166; cw = 200 / 6
    for i, (lab, ic, mx, mn, pop, mm) in enumerate(days):
        x = int(i * cw); xm = int(i * cw + cw / 2)
        lab = 'HOJE' if i == 0 else lab
        G14B.draw(img, xm - G14B.width(lab) // 2, y0 - 5, lab, C[th['wtext']])
        icon(d, xm - 7, y0 + 9, ic, C[th['icon']], C[th['mm']], C['chrome'])
        a, b = str(mx), str(mn); tw = G14B.width(a) + 3 + G14B.width(b); tx = xm - tw // 2
        G14B.draw(img, tx, y0 + 18, a, C[th['tmax']]); G14B.draw(img, tx + G14B.width(a) + 3, y0 + 18, b, C[th['tmin']])
        p = mm_txt(mm); G14B.draw(img, xm - G14B.width(p) // 2, y0 + 30, p, C[th['mm']])
        rain_bar(d, x + 5, 226, int(cw) - 9, 14, pop, th)
    return img

def variant_b(minute=20, hour=13, th=TH, days=DAYS_PT):
    img = Image.new('RGB', (200, 228), C[th['bg']]); d = ImageDraw.Draw(img)
    R.layer_ticks(img, th, R.LAYOUT)
    if minute is not None:  # notch
        pass
    # weather inside the circle: same positions, 2 rows (rain % moves to the bars)
    L = R.LAYOUT
    today = dict(lab='HOJE', ic=days[0][1], max=days[0][2], min=days[0][3], pop=None, mm_s=('%.1f mm' % days[0][5]).replace('.', ','))
    y = L['top_y']; lab = 'HOJE'; lw = G14B.width(lab); x0 = 100 - (lw + 2 + 14) // 2
    G14B.draw(img, x0, y - 5, lab, C[th['wtext']]); icon(d, x0 + lw + 2, y - 1, today['ic'], C[th['icon']], C[th['mm']], C['chrome'])
    today_top(img, d, 100, y + 6, days[0], th, big=True)
    for (bx, by), (lab, ic, mx, mn, pop, mm) in zip(L['blocks'], days[1:]):
        lw = G14B.width(lab); x0 = bx + (40 - (lw + 2 + 14)) // 2
        G14B.draw(img, x0, by - 5 + 4, lab, C[th['wtext']]); icon(d, x0 + lw + 2, by + 3, ic, C[th['icon']], C[th['mm']], C['chrome'])
        a, b = str(mx), str(mn); tw = G14B.width(a) + 4 + G14B.width(b); tx = bx + (40 - tw) // 2
        G14B.draw(img, tx, by + 11, a, C[th['tmax']]); G14B.draw(img, tx + G14B.width(a) + 4, by + 11, b, C[th['tmin']])
    R.layer_hour(img, th, L, hour, minute); R.layer_hand(img, th, L, minute)
    curved_text(img, G24B, 'Dom', 100, 102, 103, -42, C[th['wday']])
    curved_text(img, G24B, '22', 100, 102, 103, 40, C[th['mdate']])
    # Dataload-style rain strip under the circle: 6 bars, bottom-aligned, height = probability
    cw = 200 / 6
    for i, (lab, ic, mx, mn, pop, mm) in enumerate(days):
        x = int(i * cw); xm = int(i * cw + cw / 2)
        # room between the dial edge and the bottom of the screen at this column
        hmax = 12                       # same scale for every day (limited by the centre columns)
        rain_bar(d, x + 4, 226, int(cw) - 7, hmax, pop, th)
        p = mm_txt(mm)
        G14B.draw(img, xm - G14B.width(p) // 2, 226 - hmax - 15, p, C[th['mm']])
    return img

def variant_c(minute=20, hour=13, th=TH, days=DAYS_PT):
    """Current layout; the rain % of each block gets a Dataload-style bar."""
    img = Image.new('RGB', (200, 228), C[th['bg']]); d = ImageDraw.Draw(img)
    R.layer_ticks(img, th, R.LAYOUT); L = R.LAYOUT
    y = L['top_y']; lab = 'HOJE'; lw = G14B.width(lab); x0 = 100 - (lw + 2 + 14) // 2
    G14B.draw(img, x0, y - 5, lab, C[th['wtext']]); icon(d, x0 + lw + 2, y - 1, days[0][1], C[th['icon']], C[th['mm']], C['chrome'])
    today_top(img, d, 86, y + 6, days[0], th, big=True)
    for (bx, by), (lab, ic, mx, mn, pop, mm) in zip(L['blocks'], days[1:]):
        lw = G14B.width(lab); x0 = bx + (40 - (lw + 2 + 14)) // 2
        G14B.draw(img, x0, by - 5, lab, C[th['wtext']]); icon(d, x0 + lw + 2, by - 1, ic, C[th['icon']], C[th['mm']], C['chrome'])
        a, b = str(mx), str(mn); tw = G14B.width(a) + 4 + G14B.width(b); tx = bx + (40 - tw) // 2
        G14B.draw(img, tx, by + 7, a, C[th['tmax']]); G14B.draw(img, tx + G14B.width(a) + 4, by + 7, b, C[th['tmin']])
        # bar: track + fill, % number on the right
        p = '%d' % pop; pw = G14B.width(p)
        bw = 36 - pw - 2; bx0 = bx + 2
        d.rectangle([bx0, by + 25, bx0 + bw - 1, by + 32], outline=C['dgray'])
        fw = int(round((bw - 2) * pop / 100))
        if fw > 0: d.rectangle([bx0 + 1, by + 26, bx0 + fw, by + 31], fill=C[th['mm']])
        G14B.draw(img, bx0 + bw + 2, by + 19, p, C[th['pop']])
    # today: probability as text next to the temperatures (no room for a bar above the hour)
    G18B.draw(img, 140, y + 20, '%d%%' % days[0][4], C[th['pop']])
    R.layer_hour(img, th, L, hour, minute); R.layer_hand(img, th, L, minute)
    curved_text(img, G24B, 'Dom', 100, 102, 103, -42, C[th['wday']])
    curved_text(img, G24B, '22', 100, 102, 103, 40, C[th['mdate']])
    return img

if __name__ == '__main__':
    out = os.path.join(R.HERE, '..', 'docs')
    from PIL import ImageFont
    lab = ImageFont.truetype(os.path.join(R.HERE, '..', 'resources', 'fonts', 'Lato-Bold.ttf'), 20)
    cells = [(variant_a(20, 13), 'A · círculo menor + fila Dataload'), (variant_a(52, 9), 'A · 9:52'),
             (variant_b(20, 13), 'B · barras em baixo'), (variant_b(52, 9), 'B · 9:52')]
    S = 2; w, h = 200 * S + 20, 228 * S + 50
    sheet = Image.new('RGB', (2 * w, 2 * h), (24, 26, 30))
    for i, (im, t) in enumerate(cells):
        c = Image.new('RGB', (w, h), (24, 26, 30)); c.paste(im.resize((200 * S, 228 * S), Image.NEAREST), (10, 42))
        ImageDraw.Draw(c).text((10, 10), t, font=lab, fill=(230, 230, 230)); sheet.paste(c, ((i // 2) * w, (i % 2) * h))
    sheet.save(os.path.join(out, 'fork_variants.png')); print('ok')
