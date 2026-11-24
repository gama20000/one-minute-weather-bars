// Minimal host-side stand-in for the Pebble SDK, used only by tools/host to run the
// watchface's drawing and weather logic on a PC. Drawing calls are logged as text and
// replayed by tools/replay.py with the real Pebble fonts. NOT part of the watch build.
#pragma once
#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>
#include <string.h>
#include <stdio.h>
#include <stdlib.h>
#include <time.h>
#include <math.h>

typedef union GColor8 {
  uint8_t argb;
  struct { uint8_t b:2; uint8_t g:2; uint8_t r:2; uint8_t a:2; };
} GColor8;
typedef GColor8 GColor;

static inline GColor gc_(uint8_t r, uint8_t g, uint8_t b) { GColor c; c.a = 3; c.r = r; c.g = g; c.b = b; return c; }
#define GColorFromHEX(v) gc_((((v) >> 16) & 0xFF) / 85, (((v) >> 8) & 0xFF) / 85, ((v) & 0xFF) / 85)
#define GColorBlack gc_(0,0,0)
#define GColorWhite gc_(3,3,3)
#define GColorLightGray gc_(2,2,2)
#define GColorPictonBlue gc_(1,2,3)
#define GColorCobaltBlue gc_(0,1,2)
#define GColorChromeYellow gc_(3,2,0)
#define GColorOrange gc_(3,1,0)
#define GColorVividCerulean gc_(0,2,3)
#define GColorYellow gc_(3,3,0)
#define GColorRed gc_(3,0,0)
#define GColorBrightGreen gc_(1,3,0)
#define GColorFromRGB(r, g, b) gc_((r) / 85, (g) / 85, (b) / 85)
static inline bool gcolor_equal(GColor a, GColor b) { return a.argb == b.argb; }

typedef struct { int16_t x, y; } GPoint;
typedef struct { int16_t w, h; } GSize;
typedef struct { GPoint origin; GSize size; } GRect;
#define GPoint(x, y) ((GPoint){ (x), (y) })
#define GSize(w, h) ((GSize){ (w), (h) })
#define GRect(x, y, w, h) ((GRect){ { (x), (y) }, { (w), (h) } })
typedef enum { GCornerNone = 0 } GCornerMask;
typedef enum { GTextOverflowModeFill = 0 } GTextOverflowMode;
typedef enum { GTextAlignmentLeft = 0 } GTextAlignment;
typedef const char *GFont;
typedef void GTextAttributes;

typedef struct GContext { GColor stroke, fill, text; int width; } GContext;
#define GColorClear ((GColor){ .argb = 0 })
#define GColorDarkGray gc_(1,1,1)
typedef struct GBitmap { int res; GColor pal[2]; int w, h; } GBitmap;
typedef enum { GCompOpAssign = 0, GCompOpSet = 1 } GCompOp;
GBitmap *gbitmap_create_with_resource(uint32_t res);
void gbitmap_destroy(GBitmap *b);
GColor *gbitmap_get_palette(const GBitmap *b);
GRect gbitmap_get_bounds(const GBitmap *b);
void graphics_context_set_compositing_mode(GContext *c, GCompOp op);
void graphics_draw_bitmap_in_rect(GContext *c, const GBitmap *b, GRect r);
typedef struct Layer Layer;

#define FONT_KEY_GOTHIC_14_BOLD "G14B"
#define FONT_KEY_GOTHIC_18_BOLD "G18B"
#define FONT_KEY_GOTHIC_28 "G28"
#include "host_res.h"
static inline GFont fonts_get_system_font(const char *k) { return k; }
static inline int resource_get_handle(int id) { return id; }
const char *host_font_name(int res);
static inline GFont fonts_load_custom_font(int h) { return host_font_name(h); }
static inline void fonts_unload_custom_font(GFont f) { (void)f; }

#define TRIG_MAX_RATIO 0xffff
#define TRIG_MAX_ANGLE 0x10000
int32_t sin_lookup(int32_t a);
int32_t cos_lookup(int32_t a);

void graphics_context_set_stroke_color(GContext *c, GColor col);
void graphics_context_set_fill_color(GContext *c, GColor col);
void graphics_context_set_text_color(GContext *c, GColor col);
void graphics_context_set_stroke_width(GContext *c, uint8_t w);
void graphics_context_set_antialiased(GContext *c, bool on);
void graphics_draw_line(GContext *c, GPoint a, GPoint b);
void graphics_draw_pixel(GContext *c, GPoint p);
void graphics_fill_circle(GContext *c, GPoint p, uint16_t r);
void graphics_draw_circle(GContext *c, GPoint p, uint16_t r);
void graphics_fill_rect(GContext *c, GRect r, uint16_t radius, GCornerMask m);
void graphics_draw_rect(GContext *c, GRect r);
void graphics_draw_text(GContext *c, const char *s, GFont f, GRect box, GTextOverflowMode o,
                        GTextAlignment a, GTextAttributes *attr);
GSize graphics_text_layout_get_content_size(const char *s, GFont f, GRect box, GTextOverflowMode o,
                                            GTextAlignment a);

typedef struct { uint32_t num_points; GPoint *points; } GPathInfo;
typedef struct { GPathInfo info; int32_t rotation; GPoint offset; } GPath;
GPath *gpath_create(GPathInfo *i);
void gpath_destroy(GPath *p);
void gpath_rotate_to(GPath *p, int32_t a);
void gpath_move_to(GPath *p, GPoint o);
void gpath_draw_filled(GContext *c, GPath *p);
void gpath_draw_outline(GContext *c, GPath *p);

typedef struct { uint8_t charge_percent; bool is_charging; bool is_plugged; } BatteryChargeState;
BatteryChargeState battery_state_service_peek(void);
bool connection_service_peek_pebble_app_connection(void);
bool clock_is_24h_style(void);
const char *i18n_get_system_locale(void);

#define PERSIST_DATA_MAX_LENGTH 256
bool persist_exists(uint32_t k);
int32_t persist_read_int(uint32_t k);
int persist_write_int(uint32_t k, int32_t v);
int persist_read_data(uint32_t k, void *buf, size_t n);
int persist_write_data(uint32_t k, const void *buf, size_t n);

typedef enum { TUPLE_BYTE_ARRAY = 0, TUPLE_CSTRING = 1, TUPLE_UINT = 2, TUPLE_INT = 3 } TupleType;
typedef struct {
  uint32_t key; TupleType type; uint16_t length;
  union { uint8_t data[256]; char cstring[256]; uint8_t uint8; uint16_t uint16; int8_t int8;
          int16_t int16; int32_t int32; uint32_t uint32; } value[1];
} Tuple;
typedef struct { Tuple *tuples; int count; } DictionaryIterator;
Tuple *dict_find(DictionaryIterator *it, uint32_t key);

enum { MESSAGE_KEY_theme = 1, MESSAGE_KEY_color_bg, MESSAGE_KEY_color_hour, MESSAGE_KEY_color_hand,
  MESSAGE_KEY_color_hand_in, MESSAGE_KEY_color_tick0, MESSAGE_KEY_color_tick5, MESSAGE_KEY_color_tick1,
  MESSAGE_KEY_color_wday, MESSAGE_KEY_color_mdate, MESSAGE_KEY_color_wtext, MESSAGE_KEY_color_tmax,
  MESSAGE_KEY_color_tmin, MESSAGE_KEY_color_pop, MESSAGE_KEY_color_mm, MESSAGE_KEY_color_icon,
  MESSAGE_KEY_time_fmt, MESSAGE_KEY_date_fmt, MESSAGE_KEY_lang, MESSAGE_KEY_units, MESSAGE_KEY_interval,
  MESSAGE_KEY_precip_mode, MESSAGE_KEY_ndays, MESSAGE_KEY_show_battery, MESSAGE_KEY_wx,
  MESSAGE_KEY_status, MESSAGE_KEY_cmd, MESSAGE_KEY_wx_inside, MESSAGE_KEY_wx_bars, MESSAGE_KEY_tap_mode, MESSAGE_KEY_sched_on, MESSAGE_KEY_sched_start,
  MESSAGE_KEY_sched_end, MESSAGE_KEY_sched_days, MESSAGE_KEY_rain_c0, MESSAGE_KEY_rain_c5,
  MESSAGE_KEY_rain_c10, MESSAGE_KEY_rain_c20, MESSAGE_KEY_day_start, MESSAGE_KEY_night_start,
  MESSAGE_KEY_day_refresh, MESSAGE_KEY_night_refresh, MESSAGE_KEY_sched_scope, MESSAGE_KEY_peek_secs };

#define APP_LOG(level, ...) ((void)0)
