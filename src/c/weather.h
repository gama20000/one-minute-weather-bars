#pragma once
#include <pebble.h>

#define WX_MAX_DAYS 8
#define WX_MAX_HOURS 73
#define WX_TEMP_NONE INT16_MIN
#define WX_POP_NONE 255
#define WX_MM_NONE 0xFFFF

typedef enum { ICON_NONE = 0, ICON_SUN, ICON_PARTLY, ICON_CLOUD, ICON_FOG, ICON_DRIZZLE,
               ICON_RAIN, ICON_SNOW, ICON_STORM } WxIcon;

// Status reported by the phone (last attempt), mirrored in src/pkjs/weather.js
typedef enum { WX_OK = 0, WX_ERR_LOCATION = 1, WX_ERR_NETWORK = 2, WX_ERR_NOT_FOUND = 3,
               WX_ERR_API = 4, WX_ERR_PHONE = 5 } WxStatus;

typedef struct {
  int16_t tmax, tmin;   // whole degrees in the requested unit
  uint8_t pop;          // daily maximum precipitation probability %
  uint8_t icon;         // WxIcon
  uint16_t mm10;        // daily precipitation sum, tenths of mm
} WxDay;

typedef struct {
  bool valid;
  uint8_t ndays, units, nhours;
  uint32_t fetched_at;  // UTC epoch of the forecast download
  uint32_t day0_start;  // UTC epoch of 00:00 (location time) of the first forecast day
  uint32_t day0_ymd;    // YYYYMMDD of that day at the weather location
  WxDay day[WX_MAX_DAYS];
  uint16_t hourly[WX_MAX_HOURS];  // tenths of mm for the hour ending at day0_start + i h
} Weather;

void weather_init(void);
const Weather *weather_get(void);
// Store a forecast blob received from the phone (also persisted). Returns false if malformed.
bool weather_set_blob(const uint8_t *data, uint16_t len);
void weather_set_status(uint8_t status);
uint8_t weather_status(void);
// Changes whenever the forecast or the status changes (used to invalidate the render cache).
uint32_t weather_version(void);

// Index into day[] of the forecast day whose location date equals the watch date
// `ymd`; -1000 when the forecast does not cover it.
int weather_day_offset(uint32_t watch_ymd);
// Today's precipitation in tenths of mm for forecast day `d`; rest_of_day sums only
// the hours still to come (from the hourly forecast). WX_MM_NONE when unknown.
uint16_t weather_mm(int d, bool rest_of_day, time_t now);

// Whether the cache is older than allowed (shown discreetly on the dial).
bool weather_is_stale(time_t now);
// Called every minute: decide whether to ask the phone for a new forecast.
bool weather_should_request(time_t now);
void weather_mark_requested(time_t now);
void weather_request_failed(void);

uint32_t ymd_from_tm(const struct tm *t);
int32_t days_from_ymd(uint32_t ymd);
