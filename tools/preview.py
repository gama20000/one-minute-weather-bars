"""Preview sheet rendered from the real C code (tools/host). Output: docs/preview.png and docs/preview_60min.gif"""
import os
from PIL import Image, ImageDraw, ImageFont
from replay import frame, HERE
OUT = os.path.join(HERE, '..', 'docs')
LATO = os.path.join(HERE, '..', 'resources', 'fonts', 'Lato-Bold.ttf')
S = 2
lab = ImageFont.truetype(LATO, 20)
def cell(img, title):
    c = Image.new('RGB', (200 * S + 20, 228 * S + 50), (24, 26, 30))
    c.paste(img.resize((200 * S, 228 * S), Image.NEAREST), (10, 42))
    ImageDraw.Draw(c).text((10, 10), title, font=lab, fill=(230, 230, 230)); return c
shots = [
  (frame('twhnc', 13, 20, theme=0), '13:20 · PT · Original'),
  (frame('twhnc', 13, 20, theme=2), '13:20 · PT · Meteo colorida'),
  (frame('twhnc', 23, 45, lang=2, theme=2, blob='extreme', wday=6, mday=21), '23:45 · EN · extremos (°F)'),
  (frame('twhnc', 0, 7, lang=1, theme=0, blob=None, time_fmt=1), '12:07 · 12h · sem dados'),
  (frame('twhnc', 10, 52, theme=1, date_fmt=1), '10:52 · Monocromático'),
  (frame('twhnc', 18, 33, theme=3, date_fmt=2, lang=2), '18:33 · Alto contraste · EN'),
  (frame('twhnc', 9, 0, theme=2, ndays=4), '9:00 · 4 dias'),
  (frame('twhnc', 23, 59, wday=4, mday=31, mon=11, theme=0), '31 Dez · fora da previsão'),
]
w, h = 200 * S + 20, 228 * S + 50
sheet = Image.new('RGB', (2 * w, 4 * h), (24, 26, 30))
for i, (im, t) in enumerate(shots): sheet.paste(cell(im, t), ((i % 2) * w, (i // 2) * h))
sheet.save(os.path.join(OUT, 'preview.png'))
gif = [cell(frame('twhnc', 13, m, theme=2), '13:%02d' % m) for m in range(60)]
gif[0].save(os.path.join(OUT, 'preview_60min.gif'), save_all=True, append_images=gif[1:], duration=250, loop=0)
print('written docs/preview.png, docs/preview_60min.gif')
