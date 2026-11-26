// Unit tests of the watch-side weather logic (real src/c/weather.c) on the host.
#include "pebble.h"
#include "../../src/c/weather.h"
#include "../../src/c/settings.h"
#include <assert.h>

int32_t sin_lookup(int32_t a) { return (int32_t)lround(sin(a * 2.0 * M_PI / TRIG_MAX_ANGLE) * TRIG_MAX_RATIO); }
int32_t cos_lookup(int32_t a) { return (int32_t)lround(cos(a * 2.0 * M_PI / TRIG_MAX_ANGLE) * TRIG_MAX_RATIO); }
bool clock_is_24h_style(void) { return true; }
static int32_t s_ints[16]; static bool s_has[16]; static uint8_t s_data[16][256]; static int s_len[16];
bool persist_exists(uint32_t k) { return s_has[k]; }
int32_t persist_read_int(uint32_t k) { return s_ints[k]; }
int persist_write_int(uint32_t k, int32_t v) { s_ints[k] = v; s_has[k] = true; return 4; }
int persist_read_data(uint32_t k, void *b, size_t n) { memcpy(b, s_data[k], s_len[k]); return s_len[k]; }
int persist_write_data(uint32_t k, const void *b, size_t n) { memcpy(s_data[k], b, n); s_len[k] = n; s_has[k] = true; return n; }
Tuple *dict_find(DictionaryIterator *it, uint32_t key) { return NULL; }

static int load(const char *name) {
  char p[256]; snprintf(p, sizeof(p), "%s/../fixtures/%s", HOSTDIR, name);
  FILE *f = fopen(p, "rb"); uint8_t b[512]; int n = fread(b, 1, sizeof(b), f); fclose(f);
  return weather_set_blob(b, n);
}

int main(void) {
  settings_load();
  // calendar arithmetic: month, year and leap-year boundaries
  assert(days_from_ymd(19700101) == 0);
  assert(days_from_ymd(20270101) - days_from_ymd(20261231) == 1);
  assert(days_from_ymd(20280301) - days_from_ymd(20280228) == 2);   // 2028 is a leap year
  assert(days_from_ymd(20261201) - days_from_ymd(20261130) == 1);

  // no data
  assert(weather_day_offset(20261121) == -1000);
  assert(weather_mm(0, false, 0) == WX_MM_NONE);
  assert(weather_should_request(1795268580));

  assert(load("normal.bin"));
  const Weather *w = weather_get();
  assert(w->valid && w->ndays == 8 && w->nhours == 73);
  assert(w->day[0].tmax == 18 && w->day[0].tmin == 9 && w->day[0].pop == 80 && w->day[0].mm10 == 54);
  assert(weather_day_offset(20261121) == 0);
  assert(weather_day_offset(20261122) == 1);       // after local midnight "today" moves on
  assert(weather_day_offset(20261120) == -1);

  time_t day0 = 1795219200;                        // 2026-11-21 00:00 UTC (Lisbon)
  // full day = daily sum; rest-of-day from hourly: 0.2 mm x12 (to 12:00) + 0.5 mm x6 (13..18h)
  assert(weather_mm(0, false, day0 + 13 * 3600 + 43 * 60) == 54);
  assert(weather_mm(0, true, day0) == 12 * 2 + 6 * 5);                   // whole day ahead
  assert(weather_mm(0, true, day0 + 13 * 3600 + 43 * 60) == 5 * 5);     // hours ending 14..18
  assert(weather_mm(0, true, day0 + 18 * 3600) == 0);                    // after 18:00 nothing left
  assert(weather_mm(0, true, day0 + 17 * 3600 + 59 * 60) == 5);          // current hour counted whole
  assert(weather_mm(1, true, day0 + 86400 + 60) == 0);                   // next day, from hourly
  assert(weather_mm(3, true, day0) == WX_MM_NONE);                       // beyond hourly range

  // refresh policy (interval 60 min): fresh -> no request; stale after 2 intervals + 15 min
  time_t fetched = w->fetched_at;
  assert(!weather_should_request(fetched + 59 * 60));
  assert(weather_should_request(fetched + 61 * 60));
  assert(!weather_is_stale(fetched + 2 * 3600));
  assert(weather_is_stale(fetched + 2 * 3600 + 16 * 60));
  // back-off: after a request with no answer, wait before asking again
  weather_mark_requested(fetched + 61 * 60);
  assert(!weather_should_request(fetched + 62 * 60));
  assert(weather_should_request(fetched + 67 * 60));
  // delivery failures (Bluetooth up, message never reaches JS): only the first is retried
  // at the next wake-up, later ones keep the back-off
  weather_request_failed();
  assert(weather_should_request(fetched + 62 * 60));
  weather_mark_requested(fetched + 62 * 60);
  weather_request_failed();
  assert(!weather_should_request(fetched + 63 * 60));
  assert(!weather_should_request(fetched + 71 * 60));
  assert(weather_should_request(fetched + 72 * 60));                     // 10 min
  {
    int sent = 0;
    for (int m = 72; m < 72 + 60; m++) {                                   // one wake per minute
      time_t t = fetched + m * 60;
      if (weather_should_request(t)) { sent++; weather_mark_requested(t); weather_request_failed(); }
    }
    assert(sent == 2);                                                    // 72, 92 (+20); next at 132 (+40)
  }
  // phone says the forecast is obsolete (new units/place): due at once despite the back-off
  assert(!weather_should_request(fetched + 100 * 60));
  weather_invalidate();
  assert(weather_should_request(fetched + 100 * 60));
  assert(s_has[6] && s_ints[6] == 1);                  // the mark survives a restart
  // repeated identical status: no write, no change reported
  assert(weather_set_status(WX_ERR_NETWORK));
  assert(!weather_set_status(WX_ERR_NETWORK));
  assert(weather_set_status(WX_OK));

  // persistence: a restart reloads the cached forecast
  weather_init();
  assert(weather_get()->valid && weather_get()->day[2].icon == ICON_STORM);
  // ... and the "obsolete" mark from before the restart: still due at once
  assert(weather_should_request(fetched + 60));
  // the same (expired) forecast delivered again: no flash write / redraw, mark cleared, and the
  // back-off keeps growing instead of restarting at 5 min (Pebble app source not refreshed)
  {
    uint32_t v = weather_version();
    assert(load("normal.bin"));
    assert(weather_version() == v);
    assert(!weather_should_request(fetched + 60));
    assert(s_ints[6] == 0);
    int sent = 0;
    for (int m = 61; m < 121; m++) {
      time_t t = fetched + m * 60;
      if (weather_should_request(t)) { sent++; weather_mark_requested(t); assert(load("normal.bin")); }
    }
    assert(sent == 4);                                                    // 61, 66, 76, 96 (not 12)
    weather_init();
    assert(!weather_should_request(fetched + 60));                         // cleared mark persisted
  }

  // corrupt blob rejected, cache kept
  uint8_t bad[10] = { 9 };
  assert(!weather_set_blob(bad, sizeof(bad)));
  assert(weather_get()->valid);

  assert(load("extreme.bin"));
  assert(weather_get()->day[0].tmax == -12 && weather_get()->day[0].tmin == -18);
  assert(weather_get()->day[5].pop == WX_POP_NONE && weather_get()->day[5].mm10 == WX_MM_NONE);
  // ---- scheduled "no weather" window ----
  struct tm t = {0};
  #define AT(wd, h, m) (t.tm_wday = (wd), t.tm_hour = (h), t.tm_min = (m), settings_weather_scheduled_off(&t))
  g_settings.sched_on = 0;
  assert(!AT(1, 10, 0));                           // off: never hidden
  g_settings.sched_on = 1; g_settings.sched_days = 0x3E;    // Mon..Fri
  g_settings.sched_start = 9 * 60; g_settings.sched_end = 18 * 60;
  assert(!AT(1, 8, 59) && AT(1, 9, 0) && AT(1, 17, 59) && !AT(1, 18, 0));   // Monday
  assert(AT(5, 12, 0));                            // Friday
  assert(!AT(6, 12, 0) && !AT(0, 12, 0));          // weekend shows weather
  g_settings.sched_start = 22 * 60; g_settings.sched_end = 7 * 60;          // past midnight
  assert(AT(5, 23, 0));                            // Friday night
  assert(AT(6, 6, 59));                            // early Saturday belongs to Friday's window
  assert(!AT(6, 7, 0));
  assert(!AT(6, 23, 0));                           // Saturday night not selected
  assert(!AT(1, 3, 0));                            // early Monday belongs to Sunday (not selected)
  g_settings.sched_start = g_settings.sched_end = 600;
  assert(!AT(1, 10, 0));                           // empty window

  // ---- rain amount colour scale (default stops, Colourful theme) ----
  settings_load();
  #define HEX(c) ((c).r * 85 << 16 | (c).g * 85 << 8 | (c).b * 85)
  assert(HEX(settings_rain_color(0)) == 0xFFFFFF);
  assert(HEX(settings_rain_color(5)) == 0xAAFFFF);     // #BDEFFF -> nearest of 64 colours
  assert(HEX(settings_rain_color(10)) == 0x55AAFF);    // #38BDF8 -> nearest
  assert(HEX(settings_rain_color(20)) == 0x0055FF);    // #1762FF -> nearest
  assert(HEX(settings_rain_color(55)) == 0x0055FF);    // >= 20 mm clamps
  // ---- power saving: day/night cadence ----
  struct tm u = {0};
  u.tm_hour = 12; assert(settings_refresh_period(&u) == 60);          // day default 1 min
  u.tm_hour = 23; assert(settings_refresh_period(&u) == 900);         // night default 15 min
  u.tm_hour = 3;  assert(settings_refresh_period(&u) == 900);
  u.tm_hour = 7;  assert(settings_refresh_period(&u) == 60);
  assert(settings_next_switch(12 * 3600) == 23 * 3600);
  assert(settings_next_switch(23 * 3600) == 86400 + 7 * 3600);
  assert(settings_next_switch(2 * 3600) == 7 * 3600);
  // the "no weather" window boundaries wake the dial too (night 30 min, window from 23:01)
  {
    Settings keep = g_settings;
    g_settings.sched_on = 1; g_settings.sched_start = 23 * 60 + 1; g_settings.sched_end = 6 * 60 + 30;
    assert(settings_next_switch(23 * 3600) == 23 * 3600 + 60);              // not 23:30
    assert(settings_next_switch(2 * 3600) == 6 * 3600 + 30 * 60);           // window end first
    assert(settings_next_switch(12 * 3600) == 23 * 3600);                   // night switch first
    g_settings.sched_on = 0;
    assert(settings_next_switch(23 * 3600) == 86400 + 7 * 3600);           // off: ignored
    g_settings = keep;
  }
  // every offered interval divides 24 h, so a wake-up always lands on midnight
  int periods[] = { 60, 150, 300, 900, 1800 };
  for (int i = 0; i < 5; i++) assert(86400 % periods[i] == 0);

  puts("weather.c logic: all tests passed");
  return 0;
}
