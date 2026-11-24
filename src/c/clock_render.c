// Dial, hour, minute hand and calendar. Drawing principles, the kite-shaped hand, the
// hour placed opposite the hand, the calendar position and the phone/battery indicators
// come from One Minute Hand (c) 2025 Justin Hendrick, MIT licence (docs/LICENSE-one-minute-hand.txt).
#include "clock_render.h"
#include "layout.h"
#include "settings.h"
#include "i18n.h"
#include "draw.h"
#include "curved_gen.h"

static const GPoint CENTER = { DIAL_CX, DIAL_CY };
static GPath *s_hand_path;
static GPathInfo s_hand_info;
static GPoint s_hand_points[4];

void clock_render_init(void) {
  s_hand_points[0] = GPoint(0, 0);
  s_hand_points[1] = GPoint(HAND_W / 2, -HAND_LEN * 3 / 10);
  s_hand_points[2] = GPoint(0, -HAND_LEN);
  s_hand_points[3] = GPoint(-HAND_W / 2, -HAND_LEN * 3 / 10);
  s_hand_info = (GPathInfo){ .num_points = 4, .points = s_hand_points };
  s_hand_path = gpath_create(&s_hand_info);
}

void clock_render_deinit(void) {
  if (s_hand_path) gpath_destroy(s_hand_path);
}

void clock_draw_ticks(GContext *ctx, int pointed) {
  const Palette *p = settings_palette();
  for (int m = 0; m < 60; m++) {
    int w, len;
    GColor c;
    if (m == 0) { w = TICK0_W; len = TICK0_L; c = p->tick0; }
    else if (m % 15 == 0) { w = TICK15_W; len = TICK15_L; c = p->tick5; }
    else if (m % 5 == 0) { w = TICK5_W; len = TICK5_L; c = p->tick5; }
    else { w = TICK1_W; len = TICK1_L; c = p->tick1; }
    // The mark the hand points at is shortened: the notch shows the exact minute at a glance.
    if (m == pointed) len = len * POINTED_TICK_PCT / 100 > 2 ? len * POINTED_TICK_PCT / 100 : 2;
    int32_t a = TRIG_MAX_ANGLE * m / 60;
    // Thick Pebble lines have round caps: pull the inner end in by half the width
    // so the visible tick keeps the validated length.
    int inner = DIAL_R - len + (w > 1 ? w / 2 : 0);
    graphics_context_set_stroke_color(ctx, c);
    graphics_context_set_stroke_width(ctx, w);
    graphics_draw_line(ctx, polar(CENTER, inner, a), polar(CENTER, DIAL_R, a));
  }
}

void clock_draw_hour(GContext *ctx, const struct tm *now, bool big) {
  int hour = now->tm_hour;
  if (!settings_is_24h()) {
    hour %= 12;
    if (hour == 0) hour = 12;
  }
  static char buf[4];
  snprintf(buf, sizeof(buf), "%d", hour);
  int n = strlen(buf);
  // Larger digits when no weather is shown inside the dial (sizes from tools/gen_hour.py).
  const int digit_w = big ? HOUR_L_DIGIT_W : HOUR_S_DIGIT_W;
  const int ink_top = big ? HOUR_L_INK_TOP : HOUR_S_INK_TOP;
  const int ink_bot = big ? HOUR_L_INK_BOTTOM : HOUR_S_INK_BOTTOM;
  int hw2 = digit_w * n;                           // 2 x half-width
  int hh2 = ink_bot - ink_top;                     // 2 x half-height
  // Direction opposite the hand; the box edge keeps HOUR_CLEARANCE from the pivot.
  int32_t a = TRIG_MAX_ANGLE * now->tm_min / 60 + TRIG_MAX_ANGLE / 2;
  int32_t ux = sin_lookup(a), uy = -cos_lookup(a);
  int32_t aux = ux < 0 ? -ux : ux, auy = uy < 0 ? -uy : uy;
  // dist = CLEARANCE + |ux|*hw + |uy|*hh   (unit vector scaled by TRIG_MAX_RATIO)
  int32_t dist = HOUR_CLEARANCE + (aux * hw2 + auy * hh2) / 2 / TRIG_MAX_RATIO;
  int px = DIAL_CX + (ux * dist + (ux >= 0 ? 1 : -1) * TRIG_MAX_RATIO / 2) / TRIG_MAX_RATIO;
  int py = DIAL_CY + (uy * dist + (uy >= 0 ? 1 : -1) * TRIG_MAX_RATIO / 2) / TRIG_MAX_RATIO;
  int x = px - hw2 / 2;
  int y = py - (ink_top + ink_bot) / 2;
  text_at(ctx, buf, big ? g_fonts.hour_big : g_fonts.hour, x, y, settings_palette()->hour);
}

void clock_draw_hand(GContext *ctx, int minute) {
  const Palette *p = settings_palette();
  gpath_rotate_to(s_hand_path, TRIG_MAX_ANGLE * minute / 60);
  gpath_move_to(s_hand_path, CENTER);
  graphics_context_set_fill_color(ctx, p->hand_in);
  gpath_draw_filled(ctx, s_hand_path);
  graphics_context_set_stroke_color(ctx, p->hand);
  graphics_context_set_stroke_width(ctx, 2);
  gpath_draw_outline(ctx, s_hand_path);
  graphics_context_set_fill_color(ctx, p->hand);
  graphics_fill_circle(ctx, CENTER, HAND_BASE_R);
}

// Curved calendar: weekday over the top-left of the dial, day of month over the top-right.
// Pebble cannot rotate text, so each word is a pre-rendered 1-bit image (tools/gen_curved.py)
// whose palette is recoloured at runtime.
static GBitmap *s_wd_bmp, *s_day_bmp;
static uint32_t s_wd_res, s_day_res;

static GBitmap *prv_cached(GBitmap **bmp, uint32_t *cur, uint32_t res) {
  if (*bmp && *cur == res) return *bmp;
  if (*bmp) gbitmap_destroy(*bmp);
  *bmp = gbitmap_create_with_resource(res);
  *cur = res;
  return *bmp;
}

static void prv_draw_curved(GContext *ctx, GBitmap *bmp, int x, int y, GColor col) {
  if (!bmp) return;
  GColor *pal = gbitmap_get_palette(bmp);
  if (pal) { pal[0] = GColorClear; pal[1] = col; }
  GSize sz = gbitmap_get_bounds(bmp).size;
  graphics_context_set_compositing_mode(ctx, GCompOpSet);
  graphics_draw_bitmap_in_rect(ctx, bmp, GRect(x, y, sz.w, sz.h));
  graphics_context_set_compositing_mode(ctx, GCompOpAssign);
}

void clock_draw_calendar(GContext *ctx, const struct tm *now) {
  const Palette *p = settings_palette();
  const CurvedImg *wd = (i18n_lang() == L_PT ? CURVED_WD_PT : CURVED_WD_EN) + (now->tm_wday % 7);
  const CurvedImg *day = CURVED_DAY + (now->tm_mday - 1) % 31;
  prv_draw_curved(ctx, prv_cached(&s_wd_bmp, &s_wd_res, wd->res), wd->x, wd->y, p->wday);
  prv_draw_curved(ctx, prv_cached(&s_day_bmp, &s_day_res, day->res), day->x, day->y, p->mdate);
}

void clock_calendar_free(void) {
  if (s_wd_bmp) { gbitmap_destroy(s_wd_bmp); s_wd_bmp = NULL; }
  if (s_day_bmp) { gbitmap_destroy(s_day_bmp); s_day_bmp = NULL; }
}

// ---- top corners ----
#define PHONE_Y 24
#define PHONE_X 12
static void prv_phone_disconnected(GContext *ctx, GPoint z, GColor fg, GColor bg) {
  static const uint8_t raster[PHONE_Y][PHONE_X] = {
    {0,0,0,0,0,0,0,0,0,0,0,0}, {0,0,1,1,1,1,1,1,1,1,0,0}, {0,1,1,1,1,1,1,1,1,1,1,0},
    {0,1,1,1,1,1,1,1,1,1,1,0}, {0,1,0,0,0,0,0,0,0,0,1,0}, {0,1,0,0,0,0,0,0,0,0,1,0},
    {0,1,0,0,0,0,0,0,0,0,1,0}, {0,1,2,0,0,0,0,0,0,2,1,0}, {0,1,2,2,0,0,0,0,2,2,1,0},
    {0,1,0,2,2,0,0,2,2,0,1,0}, {0,1,0,0,2,2,2,2,0,0,1,0}, {0,1,0,0,0,2,2,0,0,0,1,0},
    {0,1,0,0,2,2,2,2,0,0,1,0}, {0,1,0,2,2,0,0,2,2,0,1,0}, {0,1,2,2,0,0,0,0,2,2,1,0},
    {0,1,2,0,0,0,0,0,0,2,1,0}, {0,1,0,0,0,0,0,0,0,0,1,0}, {0,1,0,0,0,0,0,0,0,0,1,0},
    {0,1,0,0,0,0,0,0,0,0,1,0}, {0,1,1,1,1,1,1,1,1,1,1,0}, {0,1,1,1,1,0,0,1,1,1,1,0},
    {0,1,1,1,1,0,0,1,1,1,1,0}, {0,0,1,1,1,1,1,1,1,1,0,0}, {0,0,0,0,0,0,0,0,0,0,0,0},
  };
  for (int y = 0; y < PHONE_Y; y++) {
    for (int x = 0; x < PHONE_X; x++) {
      int v = raster[y][x];
      if (!v) continue;
      graphics_context_set_stroke_color(ctx, v == 1 ? fg : GColorRed);
      graphics_draw_pixel(ctx, GPoint(z.x + x, z.y + y));
    }
  }
  (void)bg;
}

static void prv_battery(GContext *ctx, int lft, int top, GColor fg) {
  const int w = 10, h = 34;
  int bot = top + h, rgt = lft + w;
  graphics_context_set_stroke_color(ctx, fg);
  graphics_context_set_stroke_width(ctx, 1);
  graphics_draw_rect(ctx, GRect(lft, top, w + 1, h + 1));
  graphics_draw_line(ctx, GPoint(lft + 2, top - 1), GPoint(rgt - 2, top - 1));
  BatteryChargeState bcs = battery_state_service_peek();
  int fill = (h - 1) * bcs.charge_percent / 100;
  graphics_context_set_fill_color(ctx, bcs.charge_percent <= 20 ? GColorRed : GColorBrightGreen);
  graphics_fill_rect(ctx, GRect(lft + 1, bot - fill, w - 1, fill), 0, GCornerNone);
}

// Small clock = forecast older than allowed; "!" when the last update failed and nothing is cached.
static void prv_stale(GContext *ctx, int x, int y, GColor fg, bool error) {
  graphics_context_set_stroke_color(ctx, fg);
  graphics_context_set_stroke_width(ctx, 1);
  if (error) {
    text_at(ctx, "!", g_fonts.g18b, x + 3, y - 5, fg);
    return;
  }
  GPoint c = GPoint(x + 5, y + 5);
  graphics_draw_circle(ctx, c, 5);
  graphics_draw_line(ctx, c, GPoint(c.x, c.y - 3));
  graphics_draw_line(ctx, c, GPoint(c.x + 2, c.y + 1));
}

void clock_draw_status(GContext *ctx, bool stale, bool error, bool bars_shown) {
  const Palette *p = settings_palette();
  // The top corners hold the curved calendar: indicators go to the bottom corners,
  // or just above the rain strip when it is shown.
  int bottom = bars_shown ? BAR_LABEL_Y + 2 : SCREEN_H - 3;
  int x = 3;
  if (g_settings.show_battery) {
    prv_battery(ctx, x, bottom - 35, p->wday);
    x += 13;
  }
  if (!connection_service_peek_pebble_app_connection()) {
    prv_phone_disconnected(ctx, GPoint(x, bottom - PHONE_Y), p->wday, p->bg);
  }
  if (stale || error) prv_stale(ctx, SCREEN_W - 14, bottom - 12, p->icon, error);
}
