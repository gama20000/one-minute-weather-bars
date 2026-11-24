#pragma once
#include <pebble.h>

typedef enum { THEME_COLORFUL = 0, THEME_CLASSIC, THEME_MONO, THEME_HIGH_CONTRAST, THEME_CUSTOM, THEME_COUNT } Theme;
typedef enum { TIME_AUTO = 0, TIME_12H, TIME_24H } TimeFmt;
typedef enum { DATE_DAY = 0, DATE_DAY_MONTH, DATE_MONTH_DAY } DateFmt;
typedef enum { LANG_AUTO = 0, LANG_PT, LANG_EN } LangSetting;
typedef enum { PRECIP_FULL_DAY = 0, PRECIP_REST_OF_DAY } PrecipMode;
// Wrist tap (flick): nothing / toggle weather on-off / show all weather for a set time.
typedef enum { TAP_NONE = 0, TAP_TOGGLE, TAP_PEEK } TapMode;
// What the scheduled window hides.
typedef enum { SCHED_HIDE_ALL = 0, SCHED_HIDE_INSIDE, SCHED_HIDE_BARS } SchedScope;

// pop = rain-probability bars; mm = raindrop icon and millimetres in themes without gradient.
typedef struct {
  GColor bg, hour, hand, hand_in, tick0, tick5, tick1, wday, mdate,
         wtext, tmax, tmin, pop, mm, icon;
} Palette;

// Colour scale for the forecast amount of rain (not its probability): 0, 5, 10, >= 20 mm.
#define RAIN_STOPS 4

typedef struct __attribute__((__packed__)) {
  uint8_t theme;
  Palette custom;          // colours used by the Custom theme
  uint8_t time_fmt;
  uint8_t date_fmt;
  uint8_t lang;
  uint8_t units;           // 0 Celsius, 1 Fahrenheit (display only; JS requests the unit)
  uint16_t interval_min;   // weather refresh interval
  uint8_t precip_mode;
  uint8_t ndays;           // 6 or 4
  uint8_t show_battery;
  uint8_t wx_inside;       // forecast blocks inside the dial
  uint8_t wx_bars;         // rain strip under the dial
  uint8_t tap_mode;        // TapMode
  uint8_t sched_on;        // hide the weather during a daily time window
  uint8_t sched_days;      // bit 0 = Sunday .. bit 6 = Saturday
  uint16_t sched_start;    // minutes after midnight (local watch time)
  uint16_t sched_end;      // end (exclusive); end < start = window past midnight
  uint8_t rain_rgb[RAIN_STOPS][3];   // 24-bit colours of the rain scale (0/5/10/20 mm)
  uint16_t day_start;      // minutes after midnight: day period starts
  uint16_t night_start;    // minutes after midnight: night period starts
  uint16_t day_refresh;    // seconds between dial updates by day (60, 150, 300)
  uint16_t night_refresh;  // seconds between dial updates at night (300, 900, 1800)
  uint8_t sched_scope;     // SchedScope (0 = both, the default for older settings)
  uint16_t peek_secs;      // wrist tap "show": how long the weather stays (0 = default 60 s)
  uint8_t reserved[5];
} Settings;

extern Settings g_settings;

void settings_load(void);
void settings_save(void);
// Apply keys from an AppMessage; returns true if anything changed.
bool settings_apply_message(DictionaryIterator *iter);
// Effective colours for the active theme, with the legibility guard applied.
const Palette *settings_palette(void);
// Whether icons use colour accents (sun yellow, rain blue).
bool settings_icon_accents(void);
bool settings_is_24h(void);
// Duration of the wrist-tap weather peek, in ms.
uint32_t settings_peek_ms(void);
// True when the weather must be hidden at this local time (scheduled window).
bool settings_weather_scheduled_off(const struct tm *t);
// Colour for a forecast amount of rain in whole mm (gradient, legibility-guarded).
GColor settings_rain_color(int mm);
// Distinct colour for "no data" values (grey that contrasts with the background).
GColor settings_nodata_color(void);
// Seconds between dial updates at this local time (day or night setting).
int settings_refresh_period(const struct tm *t);
// Seconds after midnight of the next day/night switch after `sec_of_day` (may be + 86400).
int settings_next_switch(int sec_of_day);
