#include "weather.h"
#include "settings.h"

#define PERSIST_WX_BLOB 3
#define PERSIST_WX_STATUS 4
#define BLOB_VERSION 1
#define BLOB_HEADER 20
#define BLOB_DAY 8

static Weather s_wx;
static uint8_t s_status = WX_OK;
static time_t s_last_request = 0;
static uint8_t s_fail_count = 0;
static bool s_obsolete;            // phone said the forecast no longer matches the settings
static uint32_t s_version = 1;     // bumped whenever the forecast changes (render cache)

static uint16_t rd16(const uint8_t *p) { return p[0] | (p[1] << 8); }
static uint32_t rd32(const uint8_t *p) { return p[0] | (p[1] << 8) | (p[2] << 16) | ((uint32_t)p[3] << 24); }

static bool prv_parse(const uint8_t *b, uint16_t len, Weather *out) {
  if (len < BLOB_HEADER || b[0] != BLOB_VERSION) return false;
  uint8_t nd = b[1], nh = b[3];
  if (nd == 0 || nd > WX_MAX_DAYS || nh > WX_MAX_HOURS) return false;
  if (len < BLOB_HEADER + nd * BLOB_DAY + nh * 2) return false;
  memset(out, 0, sizeof(*out));
  out->ndays = nd;
  out->units = b[2];
  out->nhours = nh;
  out->fetched_at = rd32(b + 4);
  out->day0_start = rd32(b + 8);
  out->day0_ymd = rd32(b + 12);
  const uint8_t *p = b + BLOB_HEADER;
  for (int i = 0; i < nd; i++, p += BLOB_DAY) {
    out->day[i].tmax = (int16_t)rd16(p);
    out->day[i].tmin = (int16_t)rd16(p + 2);
    out->day[i].pop = p[4];
    out->day[i].icon = p[5];
    out->day[i].mm10 = rd16(p + 6);
  }
  for (int i = 0; i < nh; i++, p += 2) out->hourly[i] = rd16(p);
  out->valid = true;
  return true;
}

void weather_init(void) {
  memset(&s_wx, 0, sizeof(s_wx));
  if (persist_exists(PERSIST_WX_BLOB)) {
    uint8_t buf[PERSIST_DATA_MAX_LENGTH];
    int n = persist_read_data(PERSIST_WX_BLOB, buf, sizeof(buf));
    if (n > 0) prv_parse(buf, n, &s_wx);
  }
  if (persist_exists(PERSIST_WX_STATUS)) s_status = persist_read_int(PERSIST_WX_STATUS);
}

const Weather *weather_get(void) { return &s_wx; }

bool weather_set_blob(const uint8_t *data, uint16_t len) {
  Weather w;
  if (!prv_parse(data, len, &w)) return false;
  s_wx = w;
  s_version++;
  if (len <= PERSIST_DATA_MAX_LENGTH) persist_write_data(PERSIST_WX_BLOB, data, len);
  s_fail_count = 0;
  s_obsolete = false;
  weather_set_status(WX_OK);
  return true;
}

bool weather_set_status(uint8_t st) {
  // Repeated identical errors: no flash write. The dial shows the status through the
  // render cache key (error flag), so the forecast version is not bumped here.
  if (st == s_status) return false;
  s_status = st;
  persist_write_int(PERSIST_WX_STATUS, st);
  return true;
}

uint8_t weather_status(void) { return s_status; }

uint32_t ymd_from_tm(const struct tm *t) {
  return (t->tm_year + 1900) * 10000 + (t->tm_mon + 1) * 100 + t->tm_mday;
}

// Days since 1970-01-01 (proleptic Gregorian), H. Hinnant's algorithm.
int32_t days_from_ymd(uint32_t ymd) {
  int32_t y = ymd / 10000, m = (ymd / 100) % 100, d = ymd % 100;
  y -= m <= 2;
  int32_t era = (y >= 0 ? y : y - 399) / 400;
  int32_t yoe = y - era * 400;
  int32_t doy = (153 * (m + (m > 2 ? -3 : 9)) + 2) / 5 + d - 1;
  int32_t doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
  return era * 146097 + doe - 719468;
}

int weather_day_offset(uint32_t watch_ymd) {
  if (!s_wx.valid) return -1000;
  return (int)(days_from_ymd(watch_ymd) - days_from_ymd(s_wx.day0_ymd));
}

uint16_t weather_mm(int d, bool rest, time_t now) {
  if (!s_wx.valid || d < 0 || d >= s_wx.ndays) return WX_MM_NONE;
  if (!rest) return s_wx.day[d].mm10;
  // Hourly value i covers the hour ending at day0_start + i h; day d owns i = 24d+1 .. 24d+24.
  int32_t since = (int32_t)(now - (time_t)s_wx.day0_start) - d * 86400;
  int first = (since < 0) ? 1 : since / 3600 + 1;   // current hour counted whole
  if (first > 24) return 0;
  uint32_t sum = 0;
  for (int h = first; h <= 24; h++) {
    int i = 24 * d + h;
    if (i >= s_wx.nhours || s_wx.hourly[i] == WX_MM_NONE) return WX_MM_NONE;
    sum += s_wx.hourly[i];
  }
  return sum > 65534 ? 65534 : sum;
}

static int32_t prv_interval_s(void) { return g_settings.interval_min * 60; }

bool weather_is_stale(time_t now) {
  if (!s_wx.valid) return true;
  return (int32_t)(now - s_wx.fetched_at) > 2 * prv_interval_s() + 15 * 60;
}

bool weather_should_request(time_t now) {
  bool due = !s_wx.valid || s_obsolete || (int32_t)(now - s_wx.fetched_at) >= prv_interval_s();
  if (!due) return false;
  // Back-off after failures: 5, 10, 20, 40 ... minutes, capped at the refresh interval.
  int32_t wait = 5 * 60;
  for (int i = 1; i < s_fail_count; i++) wait *= 2;
  if (wait > prv_interval_s()) wait = prv_interval_s();
  return s_last_request == 0 || (int32_t)(now - s_last_request) >= wait;
}

void weather_mark_requested(time_t now) {
  s_last_request = now;
  if (s_fail_count < 6) s_fail_count++;   // reset when a forecast arrives
}

void weather_request_failed(void) {
  // The message never reached the phone. Only the first attempt (PebbleKit JS usually still
  // starting) is retried at the next wake-up; later failures keep the back-off, so a link
  // that stays broken costs one attempt every 10, 20, 40... minutes instead of every minute.
  if (s_fail_count <= 1) s_last_request = 0;
}

void weather_invalidate(void) {
  // New units / place / source: due now, and the back-off of the old request no longer applies.
  // The old forecast stays on the dial until the new one arrives.
  s_obsolete = true;
  s_fail_count = 0;
  s_last_request = 0;
}

uint32_t weather_version(void) { return s_version; }
