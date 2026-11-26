// One Minute Weather — One Minute Hand with an integrated multi-day forecast.
#include <pebble.h>
#include "settings.h"
#include "weather.h"
#include "comm.h"
#include "draw.h"
#include "clock_render.h"
#include "weather_render.h"

static Window *s_window;
static Layer *s_layer;

// ---- what weather to show (settings + wrist tap) ----
#define PERSIST_TAP_TOGGLED 5
static bool s_toggled;            // TAP_TOGGLE: showing the alternative view
static bool s_peeking;            // TAP_PEEK: temporarily showing everything
static AppTimer *s_peek_timer;
static bool s_tap_subscribed;

static bool s_sched_off;          // inside the scheduled "no weather" window

static void prv_visible(bool *inside, bool *bars) {
  bool bi = g_settings.wx_inside, bb = g_settings.wx_bars;
  if (s_sched_off) {   // scheduled window: hide both, only the dial forecast, or only the rain strip
    if (g_settings.sched_scope != SCHED_HIDE_BARS) bi = false;
    if (g_settings.sched_scope != SCHED_HIDE_INSIDE) bb = false;
  }
  if (g_settings.tap_mode == TAP_PEEK && s_peeking) { bi = bb = true; }
  else if (g_settings.tap_mode == TAP_TOGGLE && s_toggled) {
    // Alternative view: without weather if the normal view has some, otherwise with all of it.
    bool any = bi || bb;
    bi = bb = !any;
  }
  *inside = bi; *bars = bb;
}

// Network only when the forecast can actually appear on the dial.
static bool prv_weather_needed(void) {
  if (g_settings.tap_mode != TAP_NONE) return true;
  bool inside = g_settings.wx_inside, bars = g_settings.wx_bars;
  if (s_sched_off) {
    if (g_settings.sched_scope != SCHED_HIDE_BARS) inside = false;
    if (g_settings.sched_scope != SCHED_HIDE_INSIDE) bars = false;
  }
  return inside || bars;
}

static void prv_set_toggled(bool v) {
  if (s_toggled == v) return;   // flash write only on change
  s_toggled = v;
  persist_write_bool(PERSIST_TAP_TOGGLED, v);
}

// Re-evaluate the schedule (every minute and after a settings change). Entering or leaving
// the window resets the tap toggle, so the configured view always comes back.
static void prv_update_schedule(void) {
  time_t now = time(NULL);
  bool off = settings_weather_scheduled_off(localtime(&now));
  if (off != s_sched_off) {
    s_sched_off = off;
    prv_set_toggled(false);
  }
}

// ---- render cache ----------------------------------------------------------------
// Weather, calendar and status icons change rarely, but Pebble redraws every layer on each
// frame. They are drawn once into an off-screen copy of the screen; every minute that copy
// is blitted and only the ticks (the pointed one changes), the hour and the hand are drawn
// on top. The copy is rebuilt only when something it shows changes (see CacheKey).
typedef struct {
  uint32_t wx_version, ymd;
  int32_t wx_hour;
  uint8_t inside, bars, stale, error, bt, battery;
} CacheKey;

static GBitmap *s_cache;
static bool s_cache_valid;
static CacheKey s_cache_key;

static void prv_cache_invalidate(void) { s_cache_valid = false; }

static void prv_draw_static(GContext *ctx, GRect b, const struct tm *local, time_t now,
                            bool inside, bool bars, bool stale, bool error) {
  graphics_context_set_fill_color(ctx, settings_palette()->bg);
  graphics_fill_rect(ctx, b, 0, GCornerNone);
  if (inside) weather_draw_inside(ctx, local, now);
  if (bars) weather_draw_bars(ctx, local);
  clock_draw_calendar(ctx, local);
  clock_draw_status(ctx, stale, error, bars);
}

// Copy the frame buffer (which now holds the static part) into the cache bitmap.
static bool prv_cache_store(GContext *ctx) {
  GBitmap *fb = graphics_capture_frame_buffer(ctx);
  if (!fb) return false;
  bool ok = false;
  if (s_cache && gbitmap_get_bytes_per_row(fb) == gbitmap_get_bytes_per_row(s_cache)) {
    memcpy(gbitmap_get_data(s_cache), gbitmap_get_data(fb),
           gbitmap_get_bytes_per_row(fb) * gbitmap_get_bounds(fb).size.h);
    ok = true;
  }
  graphics_release_frame_buffer(ctx, fb);
  return ok;
}

static void prv_update(Layer *layer, GContext *ctx) {
#ifdef PROFILE_FRAMES
  uint16_t t0 = time_ms(NULL, NULL);
#endif
  time_t now = time(NULL);
  struct tm local = *localtime(&now);
  GRect b = layer_get_bounds(layer);
  graphics_context_set_antialiased(ctx, true);

  bool inside, bars;
  prv_visible(&inside, &bars);
  const Weather *w = weather_get();
  bool shown = inside || bars;
  bool error = shown && !w->valid && weather_status() != WX_OK;
  bool stale = shown && w->valid && weather_is_stale(now);

  CacheKey key;
  memset(&key, 0, sizeof(key));
  key.wx_version = weather_version();
  key.ymd = ymd_from_tm(&local);
  // "rain still expected today" changes every forecast hour, which follows the weather
  // location's clock (not UTC hours: UTC+05:30 would show the old amount for 30 min)
  key.wx_hour = (inside && g_settings.precip_mode == PRECIP_REST_OF_DAY) ? weather_hour_index(now) : 0;
  key.inside = inside; key.bars = bars; key.stale = stale; key.error = error;
  key.bt = connection_service_peek_pebble_app_connection();
  key.battery = g_settings.show_battery ? battery_state_service_peek().charge_percent : 0;

  bool hit = s_cache && s_cache_valid && memcmp(&key, &s_cache_key, sizeof(key)) == 0;
  if (hit) {
    graphics_draw_bitmap_in_rect(ctx, s_cache, b);
  } else {
    prv_draw_static(ctx, b, &local, now, inside, bars, stale, error);
    s_cache_valid = prv_cache_store(ctx);
    s_cache_key = key;
  }
  // per-minute part
  clock_draw_ticks(ctx, local.tm_min);
  clock_draw_hour(ctx, &local, !inside);
  clock_draw_hand(ctx, local.tm_min);       // drawn last: always visible
#ifdef PROFILE_FRAMES   // development only: build with -DPROFILE_FRAMES
  uint16_t t1 = time_ms(NULL, NULL);
  APP_LOG(APP_LOG_LEVEL_DEBUG, "frame %s %d ms", hit ? "cache" : "full", (int)((uint16_t)(t1 - t0)));
#endif
}

static void prv_maybe_fetch(void) {
  time_t now = time(NULL);
  if (!prv_weather_needed()) return;
  if (!connection_service_peek_pebble_app_connection()) return;
  if (weather_should_request(now) && comm_request_weather()) weather_mark_requested(now);
}

// ---- dial update cadence (power saving) ---------------------------------------------
// Four independent things:
//  1. time (hour + hand): redrawn at the day/night interval set by the user (below);
//  2. weather drawing: only when what it shows changes (render cache, see CacheKey);
//  3. forecast download: by its own interval, checked at each wake-up and on reconnection;
//  4. date / calendar: every interval divides 24 h, so a wake-up always lands on 00:00.
// Every minute -> MINUTE_UNIT ticks (aligned by the system, the cheapest option).
// Longer intervals -> no tick subscription, one single one-shot AppTimer to the next
// boundary of the interval (aligned to midnight) or the next day/night switch.
static AppTimer *s_wake_timer;
static bool s_minute_ticks;
static void prv_wake(void);
static void prv_tick(struct tm *t, TimeUnits changed) { prv_wake(); }
static void prv_wake_timer(void *ctx) { s_wake_timer = NULL; prv_wake(); }

static void prv_schedule(void) {
  time_t now;
  uint16_t ms;
  time_ms(&now, &ms);
  struct tm lt = *localtime(&now);
  int period = settings_refresh_period(&lt);
  if (period <= 60) {
    if (s_wake_timer) { app_timer_cancel(s_wake_timer); s_wake_timer = NULL; }
    if (!s_minute_ticks) { tick_timer_service_subscribe(MINUTE_UNIT, prv_tick); s_minute_ticks = true; }
    return;
  }
  if (s_minute_ticks) { tick_timer_service_unsubscribe(); s_minute_ticks = false; }
  int sec = lt.tm_hour * 3600 + lt.tm_min * 60 + lt.tm_sec;
  int next = (sec / period + 1) * period;
  int sw = settings_next_switch(sec);
  if (sw < next) next = sw;
  uint32_t delay = (uint32_t)(next - sec) * 1000 - ms + 50;   // land just after the boundary
  if (s_wake_timer) app_timer_reschedule(s_wake_timer, delay);
  else s_wake_timer = app_timer_register(delay, prv_wake_timer, NULL);
}

static void prv_wake(void) {
  prv_update_schedule();
  layer_mark_dirty(s_layer);
  prv_maybe_fetch();           // cheap check; network only when the forecast interval has elapsed
  prv_schedule();
}

static void prv_peek_end(void *ctx) {
  s_peek_timer = NULL;
  s_peeking = false;
  layer_mark_dirty(s_layer);
}

static void prv_tap(AccelAxisType axis, int32_t direction) {
  if (g_settings.tap_mode == TAP_TOGGLE) {
    prv_set_toggled(!s_toggled);
  } else if (g_settings.tap_mode == TAP_PEEK) {
    s_peeking = true;
    if (s_peek_timer) app_timer_reschedule(s_peek_timer, settings_peek_ms());
    else s_peek_timer = app_timer_register(settings_peek_ms(), prv_peek_end, NULL);
  }
  layer_mark_dirty(s_layer);
}

// The accelerometer tap service is only used when a tap behaviour is configured.
static void prv_update_tap_service(void) {
  bool want = g_settings.tap_mode != TAP_NONE;
  if (want && !s_tap_subscribed) accel_tap_service_subscribe(prv_tap);
  if (!want && s_tap_subscribed) accel_tap_service_unsubscribe();
  s_tap_subscribed = want;
  // Persisted too: otherwise turning the mode off and on again would bring back, after a
  // restart, the alternative view from before.
  if (g_settings.tap_mode != TAP_TOGGLE) prv_set_toggled(false);
  if (g_settings.tap_mode != TAP_PEEK) {
    s_peeking = false;
    if (s_peek_timer) { app_timer_cancel(s_peek_timer); s_peek_timer = NULL; }   // no stray wake-up
  }
}

static void prv_changed(bool settings_changed) {
  layer_mark_dirty(s_layer);     // forecast / status: the render cache key decides what to redraw
  if (!settings_changed) return;
  prv_cache_invalidate();
  prv_update_schedule();
  prv_update_tap_service();
  window_set_background_color(s_window, settings_palette()->bg);
  prv_maybe_fetch();
  prv_schedule();
}

static void prv_connection(bool connected) {
  layer_mark_dirty(s_layer);
  if (connected) prv_maybe_fetch();
}

static void prv_battery(BatteryChargeState s) {
  if (g_settings.show_battery) layer_mark_dirty(s_layer);
}

static void prv_window_load(Window *w) {
  Layer *root = window_get_root_layer(w);
  // 200 x 228 x 8 bit = 45.6 KB; without it the face simply draws everything each minute.
  s_cache = gbitmap_create_blank(layer_get_bounds(root).size, GBitmapFormat8Bit);
  s_layer = layer_create(layer_get_bounds(root));
  layer_set_update_proc(s_layer, prv_update);
  layer_add_child(root, s_layer);
}

static void prv_window_unload(Window *w) {
  layer_destroy(s_layer);
  if (s_cache) { gbitmap_destroy(s_cache); s_cache = NULL; }
}

static void prv_js_ready_timer(void *ctx) { prv_maybe_fetch(); }
static void prv_phone_ready(void) { prv_maybe_fetch(); }

static void prv_init(void) {
  settings_load();
  weather_init();
  draw_fonts_load();
  clock_render_init();
  comm_init(prv_changed, prv_phone_ready);

  s_window = window_create();
  window_set_background_color(s_window, settings_palette()->bg);
  window_set_window_handlers(s_window, (WindowHandlers){ .load = prv_window_load, .unload = prv_window_unload });
  window_stack_push(s_window, true);

  prv_schedule();
  connection_service_subscribe((ConnectionHandlers){ .pebble_app_connection_handler = prv_connection });
  battery_state_service_subscribe(prv_battery);
  s_toggled = persist_exists(PERSIST_TAP_TOGGLED) && persist_read_bool(PERSIST_TAP_TOGGLED);
  {
    time_t now = time(NULL);
    s_sched_off = settings_weather_scheduled_off(localtime(&now));
  }
  prv_update_tap_service();
  // Give PebbleKit JS a moment to start before the first request. If it is not up yet, the
  // phone's "ready" message (or the next wake-up) triggers the one quick retry allowed.
  app_timer_register(3000, prv_js_ready_timer, NULL);
}

static void prv_deinit(void) {
  if (s_minute_ticks) tick_timer_service_unsubscribe();
  if (s_wake_timer) app_timer_cancel(s_wake_timer);
  if (s_peek_timer) app_timer_cancel(s_peek_timer);
  connection_service_unsubscribe();
  battery_state_service_unsubscribe();
  if (s_tap_subscribed) accel_tap_service_unsubscribe();
  window_destroy(s_window);
  clock_calendar_free();
  clock_render_deinit();
  draw_fonts_unload();
}

int main(void) {
  prv_init();
  app_event_loop();
  prv_deinit();
}
