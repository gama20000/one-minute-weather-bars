#include "draw.h"
#include "weather.h"
#include "layout.h"

Fonts g_fonts;

void draw_fonts_load(void) {
  g_fonts.g14b = fonts_get_system_font(FONT_KEY_GOTHIC_14_BOLD);
  g_fonts.g18b = fonts_get_system_font(FONT_KEY_GOTHIC_18_BOLD);
  g_fonts.g28 = fonts_get_system_font(FONT_KEY_GOTHIC_28);
  g_fonts.hour = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_HOUR_S));
  g_fonts.hour_big = (HOUR_L_PX == HOUR_S_PX) ? g_fonts.hour
                     : fonts_load_custom_font(resource_get_handle(RESOURCE_ID_HOUR_L));
}

void draw_fonts_unload(void) {
  if (g_fonts.hour_big && g_fonts.hour_big != g_fonts.hour) fonts_unload_custom_font(g_fonts.hour_big);
  if (g_fonts.hour) fonts_unload_custom_font(g_fonts.hour);
}

GPoint polar(GPoint c, int r, int32_t a) {
  return GPoint(c.x + (int16_t)(sin_lookup(a) * r / TRIG_MAX_RATIO),
                c.y - (int16_t)(cos_lookup(a) * r / TRIG_MAX_RATIO));
}

int text_width(const char *s, GFont f) {
  return graphics_text_layout_get_content_size(s, f, GRect(0, 0, 400, 60),
                                               GTextOverflowModeFill, GTextAlignmentLeft).w;
}

void text_at(GContext *ctx, const char *s, GFont f, int x, int y, GColor col) {
  graphics_context_set_text_color(ctx, col);
  graphics_draw_text(ctx, s, f, GRect(x, y, 200, 60), GTextOverflowModeFill, GTextAlignmentLeft, NULL);
}

void drop_icon(GContext *ctx, int x, int y, GColor col) {
  // 5 x 7 raindrop
  graphics_context_set_fill_color(ctx, col);
  graphics_context_set_stroke_color(ctx, col);
  graphics_context_set_stroke_width(ctx, 1);
  graphics_fill_circle(ctx, GPoint(x + 2, y + 4), 2);
  graphics_draw_line(ctx, GPoint(x + 2, y), GPoint(x + 2, y + 2));
  graphics_draw_pixel(ctx, GPoint(x + 1, y + 2));
  graphics_draw_pixel(ctx, GPoint(x + 3, y + 2));
}

static void prv_cloud(GContext *ctx, int x, int y, GColor c) {
  graphics_context_set_fill_color(ctx, c);
  graphics_fill_circle(ctx, GPoint(x + 4, y + 6), 3);
  graphics_fill_circle(ctx, GPoint(x + 8, y + 4), 4);
  graphics_fill_circle(ctx, GPoint(x + 10, y + 6), 3);
  graphics_fill_rect(ctx, GRect(x + 3, y + 5, 9, 4), 0, GCornerNone);
}

void weather_icon(GContext *ctx, int x, int y, uint8_t icon, GColor base, bool accents, GColor rain) {
  GColor sun = accents ? GColorChromeYellow : base;
  GColor bolt = accents ? GColorYellow : base;
  GColor wet = accents ? rain : base;
  graphics_context_set_stroke_width(ctx, 1);
  switch (icon) {
    case ICON_SUN: {
      GPoint c = GPoint(x + 7, y + 5);
      graphics_context_set_fill_color(ctx, sun);
      graphics_context_set_stroke_color(ctx, sun);
      graphics_fill_circle(ctx, c, 3);
      for (int k = 0; k < 8; k++) {
        int32_t a = TRIG_MAX_ANGLE * k / 8;
        graphics_draw_line(ctx, polar(c, 5, a), polar(c, 6, a));
      }
      break;
    }
    case ICON_PARTLY:
      graphics_context_set_fill_color(ctx, sun);
      graphics_fill_circle(ctx, GPoint(x + 4, y + 3), 3);
      graphics_context_set_fill_color(ctx, base);
      graphics_fill_circle(ctx, GPoint(x + 6, y + 7), 2);
      graphics_fill_circle(ctx, GPoint(x + 9, y + 5), 3);
      graphics_fill_rect(ctx, GRect(x + 4, y + 7, 9, 3), 0, GCornerNone);
      break;
    case ICON_CLOUD:
      prv_cloud(ctx, x, y + 1, base);
      break;
    case ICON_FOG:
      graphics_context_set_stroke_color(ctx, base);
      graphics_draw_line(ctx, GPoint(x + 1, y + 2), GPoint(x + 12, y + 2));
      graphics_draw_line(ctx, GPoint(x + 3, y + 5), GPoint(x + 13, y + 5));
      graphics_draw_line(ctx, GPoint(x + 1, y + 8), GPoint(x + 11, y + 8));
      break;
    case ICON_DRIZZLE:
    case ICON_RAIN:
    case ICON_SNOW:
    case ICON_STORM:
      prv_cloud(ctx, x, y - 1, base);
      graphics_context_set_stroke_color(ctx, wet);
      if (icon == ICON_RAIN) {
        for (int k = 3; k <= 9; k += 3) graphics_draw_line(ctx, GPoint(x + k + 1, y + 9), GPoint(x + k, y + 11));
      } else if (icon == ICON_DRIZZLE) {
        for (int k = 3; k <= 9; k += 3) graphics_draw_pixel(ctx, GPoint(x + k, y + 10));
      } else if (icon == ICON_SNOW) {
        graphics_context_set_stroke_color(ctx, accents ? GColorWhite : base);
        for (int k = 3; k <= 11; k += 4) {
          graphics_draw_line(ctx, GPoint(x + k - 1, y + 10), GPoint(x + k + 1, y + 10));
          graphics_draw_line(ctx, GPoint(x + k, y + 9), GPoint(x + k, y + 11));
        }
      } else {
        graphics_context_set_stroke_color(ctx, bolt);
        graphics_draw_line(ctx, GPoint(x + 8, y + 7), GPoint(x + 6, y + 10));
        graphics_draw_line(ctx, GPoint(x + 6, y + 10), GPoint(x + 9, y + 10));
        graphics_draw_line(ctx, GPoint(x + 9, y + 10), GPoint(x + 7, y + 13));
      }
      break;
    default:
      break;
  }
}
