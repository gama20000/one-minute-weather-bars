#pragma once
#include <pebble.h>

typedef struct {
  GFont g14b, g18b, g28, hour, hour_big;
} Fonts;

extern Fonts g_fonts;

void draw_fonts_load(void);
void draw_fonts_unload(void);

GPoint polar(GPoint c, int r, int32_t trig_angle);
int text_width(const char *s, GFont f);
// Draw text whose glyph origin (Pebble text box top-left) is (x, y).
void text_at(GContext *ctx, const char *s, GFont f, int x, int y, GColor col);
void drop_icon(GContext *ctx, int x, int y, GColor col);
// 14 x 11 weather icon with top-left (x, y).
void weather_icon(GContext *ctx, int x, int y, uint8_t icon, GColor base, bool accents, GColor rain);
