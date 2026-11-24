#pragma once
#include <pebble.h>

// Top "today" block and the 5 day blocks inside the dial.
void weather_draw_inside(GContext *ctx, const struct tm *now_local, time_t now_utc);
// Rain strip under the dial: 6 bars (height = probability) with the mm above each.
void weather_draw_bars(GContext *ctx, const struct tm *now_local);
