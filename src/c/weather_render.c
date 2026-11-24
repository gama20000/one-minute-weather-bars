#include "weather_render.h"
#include "weather.h"
#include "settings.h"
#include "i18n.h"
#include "layout.h"
#include "draw.h"

// Fixed top-left positions inside the dial (validated by tools/check_c.py).
// Order: day +1 .. +5, clockwise from the top right.
static const GPoint BLOCKS[5] = { {146, 66}, {146, 109}, {80, 152}, {14, 109}, {14, 66} };

static const WxDay NO_DAY = { WX_TEMP_NONE, WX_TEMP_NONE, WX_POP_NONE, ICON_CLOUD, WX_MM_NONE };

static const WxDay *prv_day(int idx) {
  const Weather *w = weather_get();
  if (!w->valid || idx < 0 || idx >= w->ndays) return &NO_DAY;
  return &w->day[idx];
}

static void prv_temp(char *buf, size_t n, int16_t t, bool degree) {
  if (t == WX_TEMP_NONE) snprintf(buf, n, degree ? "--°" : "--");
  else snprintf(buf, n, degree ? "%d°" : "%d", t);
}

// Whole millimetres, rounded to the nearest integer (today at the top and the bars).
static int prv_mm_int(uint16_t mm10) { return (mm10 + 5) / 10; }

// Bars: whole millimetres, like today's amount at the top.
static void prv_mm_short(char *buf, size_t n, uint16_t mm10) {
  if (mm10 == WX_MM_NONE) snprintf(buf, n, "--");
  else snprintf(buf, n, "%d", prv_mm_int(mm10));
}

static void prv_mm(char *buf, size_t n, uint16_t mm10) {
  if (mm10 == WX_MM_NONE) { snprintf(buf, n, "-- mm"); return; }
  snprintf(buf, n, "%d mm", prv_mm_int(mm10));
}

// Amount colour (gradient) - never the probability; grey for missing data.
static GColor prv_mm_color(uint16_t mm10) {
  return mm10 == WX_MM_NONE ? settings_nodata_color() : settings_rain_color(prv_mm_int(mm10));
}

// Block: [DAY icon] / [max min]
static void prv_block(GContext *ctx, int x, int y, const char *lab, const WxDay *d) {
  const Palette *p = settings_palette();
  GFont f = g_fonts.g14b;
  int lw = text_width(lab, f);
  int x0 = x + (SMALL_BLOCK_W - (lw + 1 + ICON_INK_W)) / 2;
  text_at(ctx, lab, f, x0, y - 1, p->wtext);
  weather_icon(ctx, x0 + lw + 1, y + 3, d->icon, p->icon, settings_icon_accents(), p->mm);
  char a[8], b[8];
  prv_temp(a, sizeof(a), d->tmax, false);
  prv_temp(b, sizeof(b), d->tmin, false);
  int aw = text_width(a, f);
  int tx = x + (SMALL_BLOCK_W - (aw + 4 + text_width(b, f))) / 2;
  text_at(ctx, a, f, tx, y + 11, p->tmax);
  text_at(ctx, b, f, tx + aw + 4, y + 11, p->tmin);
}

// Top: [HOJE icon] / [drop 6,2 mm] / [17° / 11°]
static void prv_top(GContext *ctx, const WxDay *d, uint16_t mm10) {
  const Palette *p = settings_palette();
  const int cx = DIAL_CX, y = TOP_BLOCK_Y;
  const char *lab = i18n_today();
  int lw = text_width(lab, g_fonts.g14b);
  int x0 = cx - (lw + 2 + ICON_W) / 2;
  text_at(ctx, lab, g_fonts.g14b, x0, y - 5, p->wtext);
  weather_icon(ctx, x0 + lw + 2, y - 1, d->icon, p->icon, settings_icon_accents(), p->mm);
  char mm[16];
  prv_mm(mm, sizeof(mm), mm10);
  int mw = 7 + text_width(mm, g_fonts.g18b);
  int mx = cx - mw / 2;
  drop_icon(ctx, mx, y + 14, p->mm);
  text_at(ctx, mm, g_fonts.g18b, mx + 7, y + 6, prv_mm_color(mm10));
  char a[8], b[8];
  prv_temp(a, sizeof(a), d->tmax, true);
  prv_temp(b, sizeof(b), d->tmin, true);
  const char *parts[3] = { a, "/", b };
  GColor cols[3] = { p->tmax, p->wtext, p->tmin };
  int ws[3], sum = 0;
  for (int i = 0; i < 3; i++) { ws[i] = text_width(parts[i], g_fonts.g18b); sum += ws[i] + 2; }
  int x = cx - sum / 2;
  for (int i = 0; i < 3; i++) { text_at(ctx, parts[i], g_fonts.g18b, x, y + 20, cols[i]); x += ws[i] + 2; }
}

void weather_draw_inside(GContext *ctx, const struct tm *now, time_t now_utc) {
  // "today" = forecast day whose date at the weather location equals the watch's date.
  int off = weather_day_offset(ymd_from_tm(now));
  bool rest = g_settings.precip_mode == PRECIP_REST_OF_DAY;
  const WxDay *today = prv_day(off);
  uint16_t mm = (today != &NO_DAY) ? weather_mm(off, rest, now_utc) : WX_MM_NONE;
  prv_top(ctx, today, mm);
  for (int i = 0; i < 5; i++) {
    prv_block(ctx, BLOCKS[i].x, BLOCKS[i].y, i18n_wday_block(now->tm_wday + 1 + i), prv_day(off + 1 + i));
  }
}

// Dataload-style strip under the dial: today .. +5 from left to right. The bar height is
// the day's precipitation probability (same scale for all days); the number is the mm.
void weather_draw_bars(GContext *ctx, const struct tm *now) {
  const Palette *p = settings_palette();
  int off = weather_day_offset(ymd_from_tm(now));
  for (int i = 0; i < 6; i++) {
    const WxDay *d = prv_day(off + i);
    int x = i * SCREEN_W / 6, xm = (2 * i + 1) * SCREEN_W / 12;
    int bx = x + BAR_INSET, bw = SCREEN_W / 6 - 2 * BAR_INSET + 1;
    graphics_context_set_stroke_color(ctx, (p->bg.r + p->bg.g + p->bg.b >= 6) ? GColorLightGray : GColorDarkGray);
    graphics_context_set_stroke_width(ctx, 1);
    graphics_draw_rect(ctx, GRect(bx, BAR_BOTTOM - BAR_H, bw, BAR_H + 1));
    if (d->pop != WX_POP_NONE && d->pop > 0) {
      int h = (BAR_H * d->pop + 50) / 100;
      if (h > 0) {
        graphics_context_set_fill_color(ctx, p->pop);          // bar = probability
        graphics_fill_rect(ctx, GRect(bx, BAR_BOTTOM - h + 1, bw, h), 0, GCornerNone);
      }
    }
    char t[8];
    prv_mm_short(t, sizeof(t), d->mm10);
    text_at(ctx, t, g_fonts.g14b, xm - text_width(t, g_fonts.g14b) / 2, BAR_LABEL_Y, prv_mm_color(d->mm10));
  }
}
