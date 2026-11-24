// Host harness: runs the real watchface drawing code and logs drawing commands.
// Usage: host <layers> <hour> <minute> <wday> <mday> <mon> <lang 1|2> <theme> <ndays> <blobfile|-> [date_fmt] [time_fmt] [nowutc]
#include "pebble.h"
#include "host_fonts.h"
#include "host_hour.h"
#include "../../src/c/hour_gen.h"
#include "../../src/c/settings.h"
#include "../../src/c/weather.h"
#include "../../src/c/draw.h"
#include "../../src/c/clock_render.h"
#include "../../src/c/weather_render.h"

// ---- trig with Pebble's fixed-point convention ----
int32_t sin_lookup(int32_t a) { return (int32_t)lround(sin(a * 2.0 * M_PI / TRIG_MAX_ANGLE) * TRIG_MAX_RATIO); }
int32_t cos_lookup(int32_t a) { return (int32_t)lround(cos(a * 2.0 * M_PI / TRIG_MAX_ANGLE) * TRIG_MAX_RATIO); }

static unsigned col(GColor c) { return (c.r * 85u) << 16 | (c.g * 85u) << 8 | (c.b * 85u); }
void graphics_context_set_stroke_color(GContext *c, GColor x) { c->stroke = x; }
void graphics_context_set_fill_color(GContext *c, GColor x) { c->fill = x; }
void graphics_context_set_text_color(GContext *c, GColor x) { c->text = x; }
void graphics_context_set_stroke_width(GContext *c, uint8_t w) { c->width = w; }
void graphics_context_set_antialiased(GContext *c, bool on) { (void)c; (void)on; }
void graphics_draw_line(GContext *c, GPoint a, GPoint b) { printf("L %d %d %d %d %d %06x\n", a.x, a.y, b.x, b.y, c->width, col(c->stroke)); }
void graphics_draw_pixel(GContext *c, GPoint p) { printf("P %d %d %06x\n", p.x, p.y, col(c->stroke)); }
void graphics_fill_circle(GContext *c, GPoint p, uint16_t r) { printf("FC %d %d %d %06x\n", p.x, p.y, r, col(c->fill)); }
void graphics_draw_circle(GContext *c, GPoint p, uint16_t r) { printf("DC %d %d %d %06x\n", p.x, p.y, r, col(c->stroke)); }
void graphics_fill_rect(GContext *c, GRect r, uint16_t rad, GCornerMask m) { (void)rad; (void)m; printf("FR %d %d %d %d %06x\n", r.origin.x, r.origin.y, r.size.w, r.size.h, col(c->fill)); }
void graphics_draw_rect(GContext *c, GRect r) { printf("DR %d %d %d %d %06x\n", r.origin.x, r.origin.y, r.size.w, r.size.h, col(c->stroke)); }

static const signed char *adv_table(GFont f) {
  if (!strcmp(f, "G14B")) return ADV_G14B;
  if (!strcmp(f, "G18B")) return ADV_G18B;
  if (!strcmp(f, "G28")) return ADV_G28;
  if (!strcmp(f, "HOURL")) return ADV_HOUR_L;
  return ADV_HOUR_S;
}
const char *host_font_name(int res) { return res == RESOURCE_ID_HOUR_L && HOUR_L_PX != HOUR_S_PX ? "HOURL" : "HOURS"; }
GSize graphics_text_layout_get_content_size(const char *s, GFont f, GRect box, GTextOverflowMode o, GTextAlignment a) {
  const signed char *t = adv_table(f);
  int w = 0;
  for (const unsigned char *p = (const unsigned char *)s; *p;) {
    unsigned cp = *p++;
    if (cp >= 0xC0 && *p) { cp = ((cp & 0x1F) << 6) | (*p++ & 0x3F); }
    w += cp < 256 ? t[cp] : 0;
  }
  (void)box; (void)o; (void)a;
  return GSize(w, 20);
}
void graphics_draw_text(GContext *c, const char *s, GFont f, GRect box, GTextOverflowMode o, GTextAlignment a, GTextAttributes *x) {
  (void)o; (void)a; (void)x;
  printf("T %s %d %d %06x %s\n", f, box.origin.x, box.origin.y, col(c->text), s);
}

GBitmap *gbitmap_create_with_resource(uint32_t res) {
  GBitmap *b = calloc(1, sizeof(GBitmap)); b->res = res;
  char path[512]; snprintf(path, sizeof(path), "%s/../../resources/%s", HOSTDIR, HOST_RES_FILE[res - 100]);
  FILE *f = fopen(path, "rb"); unsigned char hd[24];
  if (f && fread(hd, 1, 24, f) == 24) { b->w = hd[16] << 24 | hd[17] << 16 | hd[18] << 8 | hd[19]; b->h = hd[20] << 24 | hd[21] << 16 | hd[22] << 8 | hd[23]; }
  if (f) fclose(f);
  return b;
}
void gbitmap_destroy(GBitmap *b) { free(b); }
GColor *gbitmap_get_palette(const GBitmap *b) { return ((GBitmap *)b)->pal; }
GRect gbitmap_get_bounds(const GBitmap *b) { return GRect(0, 0, b->w, b->h); }
void graphics_context_set_compositing_mode(GContext *c, GCompOp op) { (void)c; (void)op; }
void graphics_draw_bitmap_in_rect(GContext *c, const GBitmap *b, GRect r) {
  printf("BM %s %d %d %06x\n", HOST_RES_FILE[b->res - 100], r.origin.x, r.origin.y, col(b->pal[1]));
}

GPath *gpath_create(GPathInfo *i) { GPath *p = calloc(1, sizeof(GPath)); p->info = *i; return p; }
void gpath_destroy(GPath *p) { free(p); }
void gpath_rotate_to(GPath *p, int32_t a) { p->rotation = a; }
void gpath_move_to(GPath *p, GPoint o) { p->offset = o; }
static void path_emit(const char *tag, GContext *c, GPath *p, GColor k) {
  int32_t s = sin_lookup(p->rotation), co = cos_lookup(p->rotation);
  printf("%s %d %06x", tag, c->width, col(k));
  for (uint32_t i = 0; i < p->info.num_points; i++) {
    GPoint q = p->info.points[i];
    int x = (q.x * co - q.y * s) / TRIG_MAX_RATIO + p->offset.x;
    int y = (q.x * s + q.y * co) / TRIG_MAX_RATIO + p->offset.y;
    printf(" %d %d", x, y);
  }
  printf("\n");
}
void gpath_draw_filled(GContext *c, GPath *p) { path_emit("PF", c, p, c->fill); }
void gpath_draw_outline(GContext *c, GPath *p) { path_emit("PO", c, p, c->stroke); }

BatteryChargeState battery_state_service_peek(void) { return (BatteryChargeState){ 70, false, false }; }
static bool s_bt = false;   // draw the 'phone disconnected' icon in tests
bool connection_service_peek_pebble_app_connection(void) { return s_bt; }
static bool s_24h = true;
bool clock_is_24h_style(void) { return s_24h; }
static const char *s_locale = "pt_PT";
const char *i18n_get_system_locale(void) { return s_locale; }

static int32_t s_ints[16]; static bool s_has[16]; static uint8_t s_data[16][256]; static int s_len[16];
bool persist_exists(uint32_t k) { return k < 16 && s_has[k]; }
int32_t persist_read_int(uint32_t k) { return s_ints[k]; }
int persist_write_int(uint32_t k, int32_t v) { s_ints[k] = v; s_has[k] = true; return 4; }
int persist_read_data(uint32_t k, void *b, size_t n) { size_t m = (size_t)s_len[k] < n ? (size_t)s_len[k] : n; memcpy(b, s_data[k], m); return m; }
int persist_write_data(uint32_t k, const void *b, size_t n) { memcpy(s_data[k], b, n); s_len[k] = n; s_has[k] = true; return n; }
Tuple *dict_find(DictionaryIterator *it, uint32_t key) {
  for (int i = 0; i < it->count; i++) if (it->tuples[i].key == key) return &it->tuples[i];
  return NULL;
}

static void set_int(Tuple *t, uint32_t key, int32_t v) { t->key = key; t->type = TUPLE_INT; t->length = 4; t->value->int32 = v; }

int main(int argc, char **argv) {
  if (argc < 11) { fprintf(stderr, "usage\n"); return 2; }
  const char *layers = argv[1];
  struct tm tm = {0};
  tm.tm_hour = atoi(argv[2]); tm.tm_min = atoi(argv[3]); tm.tm_wday = atoi(argv[4]);
  tm.tm_mday = atoi(argv[5]); tm.tm_mon = atoi(argv[6]); tm.tm_year = 126;
  int lang = atoi(argv[7]), theme = atoi(argv[8]), ndays = atoi(argv[9]);
  int date_fmt = argc > 11 ? atoi(argv[11]) : 0;
  int time_fmt = argc > 12 ? atoi(argv[12]) : 2;
  long nowutc = argc > 13 ? atol(argv[13]) : 0;
  int precip = argc > 14 ? atoi(argv[14]) : 0;

  settings_load();
  Tuple tv[8]; DictionaryIterator it = { tv, 0 };
  set_int(&tv[it.count++], MESSAGE_KEY_lang, lang);
  set_int(&tv[it.count++], MESSAGE_KEY_theme, theme);
  set_int(&tv[it.count++], MESSAGE_KEY_ndays, ndays);
  set_int(&tv[it.count++], MESSAGE_KEY_date_fmt, date_fmt);
  set_int(&tv[it.count++], MESSAGE_KEY_time_fmt, time_fmt);
  set_int(&tv[it.count++], MESSAGE_KEY_precip_mode, precip);
  settings_apply_message(&it);
  weather_init();
  if (strcmp(argv[10], "-")) {
    FILE *f = fopen(argv[10], "rb"); uint8_t buf[512]; int n = fread(buf, 1, sizeof(buf), f); fclose(f);
    if (!weather_set_blob(buf, n)) { fprintf(stderr, "bad blob\n"); return 3; }
  }
  draw_fonts_load();
  clock_render_init();
  GContext ctx = {0};
  printf("BG %06x\n", col(settings_palette()->bg));
  if (strchr(layers, 't')) { printf("# ticks\n"); clock_draw_ticks(&ctx, strchr(layers, 'p') ? tm.tm_min : -1); }
  if (strchr(layers, 'w')) { printf("# weather\n"); weather_draw_inside(&ctx, &tm, (time_t)nowutc); }
  if (strchr(layers, 'b')) { printf("# bars\n"); weather_draw_bars(&ctx, &tm); }
  if (strchr(layers, 's')) { printf("# status\n"); clock_draw_status(&ctx, true, false, strchr(layers, 'b') != NULL); }
  if (strchr(layers, 'h')) { printf("# hour\n"); clock_draw_hour(&ctx, &tm, false); }
  if (strchr(layers, 'H')) { printf("# hour big\n"); clock_draw_hour(&ctx, &tm, true); }
  if (strchr(layers, 'n')) { printf("# hand\n"); clock_draw_hand(&ctx, tm.tm_min); }
  if (strchr(layers, 'c')) { printf("# cal\n"); clock_draw_calendar(&ctx, &tm); }
  return 0;
}
