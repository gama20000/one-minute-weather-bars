// Forecast (Open-Meteo or the Pebble app) -> compact binary blob for the watch (docs/PROTOCOL.md).
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

// ---- Pebble app weather (plugin source "weather/location", mobile app 2.0+) ----------------
// Same blob as buildBlob, from the subscription envelope { validUntilMs, instances: [{ properties }] }.
// Series: { start (UTC epoch of values[0], the place's local midnight), stepSec, numericValue:
// { values, unit } | shortText: { values } }. Assumed (to confirm on a device): an hourly value
// covers the hour that *starts* at its slot, as the daily ones cover the day that starts there.
var PLUGIN_PROPERTIES = ['utc_offset', 'daily_high', 'daily_low', 'daily_precipitation',
                         'daily_condition_code', 'hourly_precipitation_amount'];

function iconFromPluginCode(code) {
  switch (code) {
    case 'sun': return ICON.SUN;
    case 'partly_cloudy': return ICON.PARTLY;
    case 'cloudy': return ICON.CLOUD;
    case 'light_rain': return ICON.DRIZZLE;
    case 'heavy_rain': return ICON.RAIN;
    case 'light_snow': case 'heavy_snow': case 'rain_and_snow': return ICON.SNOW;
    default: return ICON.NONE;
  }
}

function seriesOf(props, name) { var p = props[name]; return (p && p.series) || null; }

// Value of the series slot that starts at `t` (UTC epoch); null when absent.
function slotAt(series, t, shape) {
  if (!series || series.start === undefined || !series.stepSec) return null;
  var payload = series[shape || 'numericValue'];
  var vals = payload && payload.values;
  if (!vals) return null;
  var k = (t - series.start) / series.stepSec;
  if (k < 0 || k >= vals.length || k !== Math.floor(k)) return null;
  var v = vals[k];
  if (v !== null && typeof v === 'object') v = 'text' in v ? v.text : v.value;
  return v === undefined ? null : v;
}

function unitOf(series) { return (series && series.numericValue && series.numericValue.unit) || ''; }

function tempIn(v, unit, fahrenheit) {
  v = num(v);
  if (v === null) return null;
  var isF = /F/i.test(unit);
  if (fahrenheit && !isF) return v * 9 / 5 + 32;
  if (!fahrenheit && isF) return (v - 32) * 5 / 9;
  return v;
}

function mmIn(v, unit) {
  v = num(v);
  if (v === null) return null;
  return /^in/i.test(unit) ? v * 25.4 : v;
}

function pluginError(status, msg) { var e = new Error(msg); e.status = status; return e; }

function buildBlobFromPlugin(envelope, fahrenheit, nowSec) {
  var inst = envelope && envelope.instances && envelope.instances[0];
  if (!inst) throw pluginError(STATUS.LOCATION, 'no weather location in the Pebble app');
  var P = inst.properties || {};
  var hi = seriesOf(P, 'daily_high'), lo = seriesOf(P, 'daily_low');
  var pop = seriesOf(P, 'daily_precipitation'), code = seriesOf(P, 'daily_condition_code');
  var hmm = seriesOf(P, 'hourly_precipitation_amount');
  if (!hi || hi.start === undefined || !hi.numericValue || !hi.numericValue.values ||
      !hi.numericValue.values.length) throw pluginError(STATUS.API, 'no daily forecast');
  var offv = P.utc_offset && P.utc_offset.numericValue;
  var off = Math.round((num(offv && offv.value) || 0) * 60);     // minutes east of UTC -> s
  var day0 = hi.start;
  var n = Math.min(NDAYS, hi.numericValue.values.length);
  var hunit = unitOf(hmm);
  function hourMm(t) { return mmIn(slotAt(hmm, t), hunit); }     // hour starting at t
  var out = [];
  out.push(1, n, fahrenheit ? 1 : 0, NHOURS);
  u32(out, nowSec);
  u32(out, day0);
  u32(out, ymd(day0 + off));
  u32(out, off);
  for (var i = 0; i < n; i++) {
    var t = day0 + i * 86400;
    u16(out, temp16(tempIn(slotAt(hi, t), unitOf(hi), fahrenheit)));
    u16(out, temp16(tempIn(slotAt(lo, t), unitOf(lo), fahrenheit)));
    var p = num(slotAt(pop, t));
    out.push(p === null ? 255 : Math.max(0, Math.min(100, Math.round(p))));
    var c = slotAt(code, t, 'shortText');
    if (c === null) c = slotAt(code, t, 'longText');
    out.push(iconFromPluginCode(c));
    // No daily amount in the plugin: sum the day's 24 hourly amounts, only when all are there.
    var sum = 0;
    for (var h = 0; h < 24 && sum !== null; h++) {
      var v = hourMm(t + h * 3600);
      sum = v === null ? null : sum + v;
    }
    u16(out, mm16(sum));
  }
  for (var j = 0; j < NHOURS; j++) {
    var hv = j === 0 ? null : hourMm(day0 + (j - 1) * 3600);       // blob slot j ends at day0 + j h
    u16(out, hv === null ? 0xFFFF : mm16(hv));
  }
  return out;
}

module.exports = {
  STATUS: STATUS, ICON: ICON, iconFromWmo: iconFromWmo, forecastUrl: forecastUrl,
  geocodeUrl: geocodeUrl, buildBlob: buildBlob, NDAYS: NDAYS, NHOURS: NHOURS,
  PLUGIN_PROPERTIES: PLUGIN_PROPERTIES, iconFromPluginCode: iconFromPluginCode,
  buildBlobFromPlugin: buildBlobFromPlugin
};
