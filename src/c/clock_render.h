#pragma once
#include <pebble.h>

void clock_render_init(void);
void clock_render_deinit(void);
// `pointed`: minute the hand points at (its mark is drawn shorter); -1 for none.
void clock_draw_ticks(GContext *ctx, int pointed);
// big: larger digits, used when no forecast is drawn inside the dial.
void clock_draw_hour(GContext *ctx, const struct tm *now, bool big);
void clock_draw_hand(GContext *ctx, int minute);
void clock_draw_calendar(GContext *ctx, const struct tm *now);
// Battery (optional), phone-disconnected and stale-weather indicators in the top corners.
// bars_shown: the rain strip occupies the bottom, indicators are placed above it.
void clock_draw_status(GContext *ctx, bool weather_stale, bool weather_error, bool bars_shown);
void clock_calendar_free(void);
