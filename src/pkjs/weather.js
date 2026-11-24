// Open-Meteo forecast -> compact binary blob for the watch (format in docs/PROTOCOL.md).
// Pure functions: tested with Node in tools/test_weather.js.

var FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
var GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
var NDAYS = 8;          // 6 shown + 2 spare so the watch can roll over midnight without data
var NHOURS = 73;        // hourly sums ending at 00:00 .. 72:00 of the first day (3 days)

var STATUS = { OK: 0, LOCATION: 1, NETWORK: 2, NOT_FOUND: 3, API: 4 };
var ICON = { NONE: 0, SUN: 1, PARTLY: 2, CLOUD: 3, FOG: 4, DRIZZLE: 5, RAIN: 6, SNOW: 7, STORM: 8 };

// WMO weather interpretation codes (Open-Meteo "weather_code": most severe condition of the day).
function iconFromWmo(code) {
  if (code === null || code === undefined) return ICON.NONE;
  if (code <= 1) return ICON.SUN;
  if (code === 2) return ICON.PARTLY;
  if (code === 3) return ICON.CLOUD;
  if (code === 45 || code === 48) return ICON.FOG;
  if (code >= 51 && code <= 57) return ICON.DRIZZLE;
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return ICON.RAIN;
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return ICON.SNOW;
  if (code >= 95) return ICON.STORM;
  return ICON.CLOUD;
}

function forecastUrl(lat, lon, fahrenheit) {
  return FORECAST_URL +
    '?latitude=' + lat.toFixed(3) + '&longitude=' + lon.toFixed(3) +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max' +
    '&hourly=precipitation' +
    '&timezone=auto&timeformat=unixtime&forecast_days=' + NDAYS +
    (fahrenheit ? '&temperature_unit=fahrenheit' : '');
}

function geocodeUrl(name, lang) {
  return GEOCODE_URL + '?count=1&format=json&language=' + (lang === 'pt' ? 'pt' : 'en') +
    '&name=' + encodeURIComponent(name);
}

function u16(arr, v) { arr.push(v & 0xFF, (v >> 8) & 0xFF); }
function u32(arr, v) { arr.push(v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF); }

function num(v) { return (v === null || v === undefined || isNaN(v)) ? null : Number(v); }

function temp16(v) {
  v = num(v);
  if (v === null) return 0x8000;                // INT16_MIN = missing
  v = Math.round(v);
  if (v < -999) v = -999;
  if (v > 999) v = 999;
  return v & 0xFFFF;
}

function mm16(v) {
  v = num(v);
  if (v === null) return 0xFFFF;
  v = Math.round(v * 10);
  return Math.max(0, Math.min(65534, v));
}

function ymd(epochLocal) {          // epoch already shifted to location time
  var d = new Date(epochLocal * 1000);
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}

// json: Open-Meteo response with timeformat=unixtime. Returns an array of bytes.
function buildBlob(json, fahrenheit, nowSec) {
  var daily = json && json.daily;
  if (!daily || !daily.time || !daily.time.length) throw new Error('no daily data');
  var off = json.utc_offset_seconds || 0;
  var n = Math.min(NDAYS, daily.time.length);
  var day0 = daily.time[0];
  var out = [];
  out.push(1, n, fahrenheit ? 1 : 0, NHOURS);
  u32(out, nowSec);
  u32(out, day0);
  u32(out, ymd(day0 + off));
  u32(out, off);
  for (var i = 0; i < n; i++) {
    u16(out, temp16(daily.temperature_2m_max[i]));
    u16(out, temp16(daily.temperature_2m_min[i]));
    var pop = num(daily.precipitation_probability_max && daily.precipitation_probability_max[i]);
    out.push(pop === null ? 255 : Math.max(0, Math.min(100, Math.round(pop))));
    out.push(iconFromWmo(num(daily.weather_code[i])));
    u16(out, mm16(daily.precipitation_sum && daily.precipitation_sum[i]));
  }
  var byTime = {};
  var h = json.hourly || {};
  for (var k = 0; h.time && k < h.time.length; k++) byTime[h.time[k]] = h.precipitation ? h.precipitation[k] : null;
  for (var j = 0; j < NHOURS; j++) {
    var t = day0 + j * 3600;
    u16(out, byTime.hasOwnProperty(t) ? mm16(byTime[t]) : 0xFFFF);
  }
  return out;
}

module.exports = {
  STATUS: STATUS, ICON: ICON, iconFromWmo: iconFromWmo, forecastUrl: forecastUrl,
  geocodeUrl: geocodeUrl, buildBlob: buildBlob, NDAYS: NDAYS, NHOURS: NHOURS
};
