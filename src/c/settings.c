#include "settings.h"

#define PERSIST_SETTINGS_VERSION 1
#define PERSIST_SETTINGS 2
#define SETTINGS_VERSION 2   // v2: themes renumbered, rain colours, power saving

Settings g_settings;
static Palette s_effective;

// ---- Theme presets (Pebble 64-colour palette) ----
static Palette prv_theme(Theme t) {
  Palette p;
  switch (t) {
    case THEME_CLASSIC:
      // Inspired by One Minute Hand: white on black, blue hand, restrained weather colours.
      p = (Palette){ GColorBlack, GColorWhite, GColorPictonBlue, GColorCobaltBlue, GColorWhite,
                     GColorWhite, GColorWhite, GColorWhite, GColorWhite, GColorWhite,
                     GColorWhite, GColorLightGray, GColorPictonBlue, GColorPictonBlue,
                     GColorLightGray };
      break;
    case THEME_MONO:
      p = (Palette){ GColorBlack, GColorWhite, GColorWhite, GColorBlack, GColorWhite, GColorWhite,
                     GColorWhite, GColorWhite, GColorWhite, GColorWhite, GColorWhite,
                     GColorLightGray, GColorLightGray, GColorWhite, GColorWhite };
      break;
    case THEME_HIGH_CONTRAST:
      p = (Palette){ GColorWhite, GColorBlack, GColorBlack, GColorBlack, GColorBlack, GColorBlack,
                     GColorBlack, GColorBlack, GColorBlack, GColorBlack, GColorBlack, GColorBlack,
                     GColorBlack, GColorBlack, GColorBlack };
      break;
    case THEME_CUSTOM:
      p = g_settings.custom;
      break;
    case THEME_COLORFUL:
    default:
      p = (Palette){ GColorBlack, GColorWhite, GColorChromeYellow, GColorOrange, GColorChromeYellow,
                     GColorWhite, GColorWhite, GColorWhite, GColorWhite, GColorWhite,
                     GColorChromeYellow, GColorPictonBlue, GColorVividCerulean, GColorVividCerulean,
                     GColorLightGray };
      break;
  }
  return p;
}

// Perceived brightness 0..300 from the 2-bit channels.
static int prv_luma(GColor c) { return (30 * c.r + 59 * c.g + 11 * c.b) * 100 / 300; }

// Legibility guard: an essential element whose colour is too close to the
// background is replaced by black or white, whichever contrasts with it.
static GColor prv_guard(GColor fg, GColor bg) {
  int d = prv_luma(fg) - prv_luma(bg);
  if (d < 0) d = -d;
  if (d >= 20) return fg;   // luma scale 0..100
  return prv_luma(bg) >= 50 ? GColorBlack : GColorWhite;
}

static void prv_recompute(void) {
  Theme t = g_settings.theme < THEME_COUNT ? (Theme)g_settings.theme : THEME_COLORFUL;
  Palette p = prv_theme(t);
  GColor bg = p.bg;
  p.hour = prv_guard(p.hour, bg);
  p.hand = prv_guard(p.hand, bg);
  p.tick0 = prv_guard(p.tick0, bg);
  p.tick5 = prv_guard(p.tick5, bg);
  p.tick1 = prv_guard(p.tick1, bg);
  p.wday = prv_guard(p.wday, bg);
  p.mdate = prv_guard(p.mdate, bg);
  p.wtext = prv_guard(p.wtext, bg);
  p.tmax = prv_guard(p.tmax, bg);
  p.tmin = prv_guard(p.tmin, bg);
  p.pop = prv_guard(p.pop, bg);
  p.mm = prv_guard(p.mm, bg);
  p.icon = prv_guard(p.icon, bg);
  // hand_in (fill) may match the background: the outline keeps the hand visible.
  s_effective = p;
}

static void prv_defaults(void) {
  memset(&g_settings, 0, sizeof(g_settings));
  g_settings.theme = THEME_COLORFUL;
  g_settings.custom = prv_theme(THEME_COLORFUL);
  static const uint8_t RAIN_DEFAULT[RAIN_STOPS][3] = {
    { 0xFF, 0xFF, 0xFF }, { 0xBD, 0xEF, 0xFF }, { 0x38, 0xBD, 0xF8 }, { 0x17, 0x62, 0xFF } };
  memcpy(g_settings.rain_rgb, RAIN_DEFAULT, sizeof(RAIN_DEFAULT));
  g_settings.day_start = 7 * 60;
  g_settings.night_start = 23 * 60;
  g_settings.day_refresh = 60;
  g_settings.night_refresh = 900;
  g_settings.peek_secs = 60;
  g_settings.time_fmt = TIME_AUTO;
  g_settings.date_fmt = DATE_DAY;
  g_settings.lang = LANG_AUTO;
  g_settings.units = 0;
  g_settings.interval_min = 60;
  g_settings.precip_mode = PRECIP_FULL_DAY;
  g_settings.ndays = 6;
  g_settings.show_battery = 0;
  g_settings.wx_inside = 1;
  g_settings.wx_bars = 1;
  g_settings.tap_mode = TAP_NONE;
  g_settings.sched_on = 0;
  g_settings.sched_days = 0x3E;          // Monday..Friday
  g_settings.sched_start = 9 * 60;
  g_settings.sched_end = 18 * 60;
}

void settings_load(void) {
  prv_defaults();
  if (persist_exists(PERSIST_SETTINGS) &&
      persist_read_int(PERSIST_SETTINGS_VERSION) == SETTINGS_VERSION) {
    persist_read_data(PERSIST_SETTINGS, &g_settings, sizeof(g_settings));
  }
  g_settings.ndays = 6;
  if (g_settings.interval_min < 15) g_settings.interval_min = 60;
  prv_recompute();
}

void settings_save(void) {
  persist_write_int(PERSIST_SETTINGS_VERSION, SETTINGS_VERSION);
  persist_write_data(PERSIST_SETTINGS, &g_settings, sizeof(g_settings));
}

static bool prv_int(DictionaryIterator *it, uint32_t key, int32_t *out) {
  Tuple *t = dict_find(it, key);
  if (!t) return false;
  switch (t->type) {
    case TUPLE_INT:
    case TUPLE_UINT:
      if (t->length == 1) *out = t->type == TUPLE_INT ? t->value->int8 : t->value->uint8;
      else if (t->length == 2) *out = t->type == TUPLE_INT ? t->value->int16 : t->value->uint16;
      else *out = t->value->int32;
      return true;
    case TUPLE_CSTRING:
      *out = atoi(t->value->cstring);
      return true;
    default:
      return false;
  }
}

static bool prv_color(DictionaryIterator *it, uint32_t key, GColor *c) {
  int32_t v;
  if (!prv_int(it, key, &v)) return false;
  *c = GColorFromHEX(v);
  return true;
}

bool settings_apply_message(DictionaryIterator *it) {
  bool any = false;
  int32_t v;
  if (prv_int(it, MESSAGE_KEY_theme, &v)) { g_settings.theme = v; any = true; }
  Palette *c = &g_settings.custom;
  any |= prv_color(it, MESSAGE_KEY_color_bg, &c->bg);
  any |= prv_color(it, MESSAGE_KEY_color_hour, &c->hour);
  any |= prv_color(it, MESSAGE_KEY_color_hand, &c->hand);
  any |= prv_color(it, MESSAGE_KEY_color_hand_in, &c->hand_in);
  any |= prv_color(it, MESSAGE_KEY_color_tick0, &c->tick0);
  any |= prv_color(it, MESSAGE_KEY_color_tick5, &c->tick5);
  any |= prv_color(it, MESSAGE_KEY_color_tick1, &c->tick1);
  any |= prv_color(it, MESSAGE_KEY_color_wday, &c->wday);
  any |= prv_color(it, MESSAGE_KEY_color_mdate, &c->mdate);
  any |= prv_color(it, MESSAGE_KEY_color_wtext, &c->wtext);
  any |= prv_color(it, MESSAGE_KEY_color_tmax, &c->tmax);
  any |= prv_color(it, MESSAGE_KEY_color_tmin, &c->tmin);
  any |= prv_color(it, MESSAGE_KEY_color_pop, &c->pop);
  any |= prv_color(it, MESSAGE_KEY_color_mm, &c->mm);
  any |= prv_color(it, MESSAGE_KEY_color_icon, &c->icon);
  if (prv_int(it, MESSAGE_KEY_time_fmt, &v)) { g_settings.time_fmt = v; any = true; }
  if (prv_int(it, MESSAGE_KEY_date_fmt, &v)) { g_settings.date_fmt = v; any = true; }
  if (prv_int(it, MESSAGE_KEY_lang, &v)) { g_settings.lang = v; any = true; }
  if (prv_int(it, MESSAGE_KEY_units, &v)) { g_settings.units = v ? 1 : 0; any = true; }
  if (prv_int(it, MESSAGE_KEY_interval, &v) && v >= 15) { g_settings.interval_min = v; any = true; }
  if (prv_int(it, MESSAGE_KEY_precip_mode, &v)) { g_settings.precip_mode = v ? 1 : 0; any = true; }
  if (prv_int(it, MESSAGE_KEY_ndays, &v)) { g_settings.ndays = (v == 4) ? 4 : 6; any = true; }
  if (prv_int(it, MESSAGE_KEY_show_battery, &v)) { g_settings.show_battery = v ? 1 : 0; any = true; }
  if (prv_int(it, MESSAGE_KEY_wx_inside, &v)) { g_settings.wx_inside = v ? 1 : 0; any = true; }
  if (prv_int(it, MESSAGE_KEY_wx_bars, &v)) { g_settings.wx_bars = v ? 1 : 0; any = true; }
  if (prv_int(it, MESSAGE_KEY_sched_scope, &v) && v >= 0 && v <= SCHED_HIDE_BARS) { g_settings.sched_scope = v; any = true; }
  if (prv_int(it, MESSAGE_KEY_sched_on, &v)) { g_settings.sched_on = v ? 1 : 0; any = true; }
  if (prv_int(it, MESSAGE_KEY_sched_days, &v)) { g_settings.sched_days = v & 0x7F; any = true; }
  if (prv_int(it, MESSAGE_KEY_sched_start, &v) && v >= 0 && v < 1440) { g_settings.sched_start = v; any = true; }
  if (prv_int(it, MESSAGE_KEY_sched_end, &v) && v >= 0 && v < 1440) { g_settings.sched_end = v; any = true; }
  uint32_t rk[RAIN_STOPS] = { MESSAGE_KEY_rain_c0, MESSAGE_KEY_rain_c5, MESSAGE_KEY_rain_c10, MESSAGE_KEY_rain_c20 };
  for (int i = 0; i < RAIN_STOPS; i++) {
    if (prv_int(it, rk[i], &v)) {
      g_settings.rain_rgb[i][0] = (v >> 16) & 0xFF; g_settings.rain_rgb[i][1] = (v >> 8) & 0xFF;
      g_settings.rain_rgb[i][2] = v & 0xFF; any = true;
    }
  }
  if (prv_int(it, MESSAGE_KEY_day_start, &v) && v >= 0 && v < 1440) { g_settings.day_start = v; any = true; }
  if (prv_int(it, MESSAGE_KEY_night_start, &v) && v >= 0 && v < 1440) { g_settings.night_start = v; any = true; }
  if (prv_int(it, MESSAGE_KEY_day_refresh, &v) && (v == 60 || v == 150 || v == 300)) { g_settings.day_refresh = v; any = true; }
  if (prv_int(it, MESSAGE_KEY_night_refresh, &v) && (v == 300 || v == 900 || v == 1800 || v == 60)) { g_settings.night_refresh = v; any = true; }
  if (prv_int(it, MESSAGE_KEY_peek_secs, &v) && v >= 5 && v <= 600) { g_settings.peek_secs = v; any = true; }
  if (prv_int(it, MESSAGE_KEY_tap_mode, &v)) { g_settings.tap_mode = (v >= 0 && v <= TAP_PEEK) ? v : TAP_NONE; any = true; }
  if (any) prv_recompute();
  return any;
}

const Palette *settings_palette(void) { return &s_effective; }

bool settings_icon_accents(void) {
  return g_settings.theme != THEME_MONO && g_settings.theme != THEME_HIGH_CONTRAST;
}

bool settings_is_24h(void) {
  if (g_settings.time_fmt == TIME_12H) return false;
  if (g_settings.time_fmt == TIME_24H) return true;
  return clock_is_24h_style();
}

bool settings_weather_scheduled_off(const struct tm *t) {
  if (!g_settings.sched_on) return false;
  int now = t->tm_hour * 60 + t->tm_min;
  int s = g_settings.sched_start, e = g_settings.sched_end;
  if (s == e) return false;
  if (s < e) {
    // same-day window, e.g. 09:00-18:00 on the selected weekdays
    return (g_settings.sched_days & (1 << t->tm_wday)) && now >= s && now < e;
  }
  // window past midnight, e.g. 22:00-07:00: the day is the one on which it started
  if (now >= s) return g_settings.sched_days & (1 << t->tm_wday);
  if (now < e) return g_settings.sched_days & (1 << ((t->tm_wday + 6) % 7));
  return false;
}

// ---- rain amount colour scale ----
static bool prv_has_gradient(void) {
  return g_settings.theme == THEME_COLORFUL || g_settings.theme == THEME_CLASSIC ||
         g_settings.theme == THEME_CUSTOM;
}

// Nearest of the 64 colours (rounding, not truncation as GColorFromRGB does).
static GColor prv_nearest(int r, int g, int b) {
  return GColorFromRGB(((r + 42) / 85) * 85, ((g + 42) / 85) * 85, ((b + 42) / 85) * 85);
}

GColor settings_rain_color(int mm) {
  const Palette *p = &s_effective;
  if (!prv_has_gradient()) return p->mm;
  static const int STOP_MM[RAIN_STOPS] = { 0, 5, 10, 20 };
  int i = 0;
  if (mm < 0) mm = 0;
  if (mm >= STOP_MM[RAIN_STOPS - 1]) i = RAIN_STOPS - 2, mm = STOP_MM[RAIN_STOPS - 1];
  else while (mm > STOP_MM[i + 1]) i++;
  int span = STOP_MM[i + 1] - STOP_MM[i], t = mm - STOP_MM[i];
  int rgb[3];
  for (int k = 0; k < 3; k++) {
    int a = g_settings.rain_rgb[i][k], b = g_settings.rain_rgb[i + 1][k];
    rgb[k] = a + (b - a) * t / span;              // linear interpolation between stops
  }
  return prv_guard(prv_nearest(rgb[0], rgb[1], rgb[2]), p->bg);
}

GColor settings_nodata_color(void) {
  return prv_luma(s_effective.bg) >= 50 ? GColorDarkGray : GColorLightGray;
}

// ---- power saving: day / night dial update interval ----
static bool prv_is_night(int min_of_day) {
  int d = g_settings.day_start, n = g_settings.night_start;
  if (d == n) return false;
  if (n > d) return min_of_day >= n || min_of_day < d;   // e.g. night 23:00 .. 07:00
  return min_of_day >= n && min_of_day < d;               // night starts before day (e.g. 01:00 .. 08:00)
}

int settings_refresh_period(const struct tm *t) {
  return prv_is_night(t->tm_hour * 60 + t->tm_min) ? g_settings.night_refresh : g_settings.day_refresh;
}

int settings_next_switch(int sec) {
  int best = sec + 86400 * 2;
  // Day/night switch, plus the start and end of the "no weather" window: without them a long
  // night interval could leave the weather visible (or hidden) for up to 30 min too long.
  // The window's weekdays are ignored here: a boundary on an unselected day is one harmless wake.
  int pts[4] = { g_settings.day_start * 60, g_settings.night_start * 60, -1, -1 };
  if (g_settings.sched_on && g_settings.sched_start != g_settings.sched_end) {
    pts[2] = g_settings.sched_start * 60;
    pts[3] = g_settings.sched_end * 60;
  }
  for (int i = 0; i < 4; i++) {
    if (pts[i] < 0) continue;
    int c = pts[i] > sec ? pts[i] : pts[i] + 86400;
    if (c < best) best = c;
  }
  return best;
}

uint32_t settings_peek_ms(void) {
  return (g_settings.peek_secs >= 5 ? g_settings.peek_secs : 60) * 1000u;
}
