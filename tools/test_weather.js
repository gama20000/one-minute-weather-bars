// Node tests for src/pkjs/weather.js and fixture blobs for the host harness.
// Run: node tools/test_weather.js
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var wx = require('../src/pkjs/weather.js');

// Synthetic Open-Meteo response (timeformat=unixtime) shaped like the documented API.
// Location Lisbon, day 0 = Saturday 21 Nov 2026 (UTC+0), 8 days.
function fixture(opts) {
  var off = opts.offset || 0;
  var day0 = Date.UTC(2026, 10, 21) / 1000 - off;   // local midnight as UTC epoch
  var d = { time: [], weather_code: [], temperature_2m_max: [], temperature_2m_min: [],
            precipitation_sum: [], precipitation_probability_max: [] };
  for (var i = 0; i < 8; i++) {
    var r = opts.days[i % opts.days.length];
    d.time.push(day0 + i * 86400);
    d.weather_code.push(r[0]); d.temperature_2m_max.push(r[1]); d.temperature_2m_min.push(r[2]);
    d.precipitation_probability_max.push(r[3]); d.precipitation_sum.push(r[4]);
  }
  var h = { time: [], precipitation: [] };
  for (var k = 0; k < 8 * 24; k++) {
    h.time.push(day0 + k * 3600);
    h.precipitation.push(opts.hourly ? opts.hourly(k) : 0);
  }
  return { latitude: 38.72, longitude: -9.14, utc_offset_seconds: off, timezone: 'Europe/Lisbon',
           daily: d, hourly: h };
}

var NORMAL = [[63, 18.2, 9.4, 80, 5.4], [2, 19, 11, 20, 0], [95, 18, 12, 60, 3.1],
              [61, 16, 10, 90, 8], [0, 20, 13, 10, 0], [3, 17, 12, 80, 1.2]];
var EXTREME = [[73, -12.4, -18.4, 100, 123.4], [65, -8, -15, 100, 40], [99, 45, 38, 100, 60],
               [45, -10, -10, 0, 0], [53, 104, 88, 5, 0.1], [0, 115, 99, null, null]];
// hourly: 0.2 mm in each hour ending 01:00..12:00, 0.5 mm 13:00..18:00, 0 afterwards (day 0)
function hourly(k) { if (k >= 1 && k <= 12) return 0.2; if (k >= 13 && k <= 18) return 0.5; return 0; }

var now = Date.UTC(2026, 10, 21, 13, 43) / 1000;

// --- unit tests ---
assert.strictEqual(wx.iconFromWmo(0), wx.ICON.SUN);
assert.strictEqual(wx.iconFromWmo(2), wx.ICON.PARTLY);
assert.strictEqual(wx.iconFromWmo(48), wx.ICON.FOG);
assert.strictEqual(wx.iconFromWmo(81), wx.ICON.RAIN);
assert.strictEqual(wx.iconFromWmo(86), wx.ICON.SNOW);
assert.strictEqual(wx.iconFromWmo(96), wx.ICON.STORM);
assert.strictEqual(wx.iconFromWmo(null), wx.ICON.NONE);

var blob = wx.buildBlob(fixture({ days: NORMAL, hourly: hourly }), false, now);
assert.strictEqual(blob.length, 20 + 8 * 8 + 73 * 2);
assert.ok(blob.length <= 256, 'fits one persist key');
assert.ok(blob.every(function (b) { return b >= 0 && b <= 255 && b === Math.floor(b); }), 'bytes');
var rd16 = function (o) { var v = blob[o] | (blob[o + 1] << 8); return v >= 0x8000 ? v - 0x10000 : v; };
var rd32 = function (o) { return (blob[o] | blob[o + 1] << 8 | blob[o + 2] << 16 | blob[o + 3] << 24) >>> 0; };
assert.strictEqual(rd32(12), 20261121, 'location date of day 0');
assert.strictEqual(rd16(20), 18, 'tmax rounded');
assert.strictEqual(rd16(22), 9, 'tmin rounded');
assert.strictEqual(blob[24], 80, 'pop');
assert.strictEqual(rd16(26) & 0xFFFF, 54, 'mm x10');

var ex = wx.buildBlob(fixture({ days: EXTREME }), true, now);
var rdx = function (o) { var v = ex[o] | (ex[o + 1] << 8); return v >= 0x8000 ? v - 0x10000 : v; };
assert.strictEqual(rdx(20), -12);
assert.strictEqual(rdx(22), -18);
assert.strictEqual(ex[2], 1, 'fahrenheit flag');
assert.strictEqual(ex[20 + 5 * 8 + 4], 255, 'missing pop');
assert.strictEqual((ex[20 + 5 * 8 + 6] | ex[20 + 5 * 8 + 7] << 8), 0xFFFF, 'missing mm');

// Location in another time zone (UTC-5): day boundaries follow the location.
var ny = wx.buildBlob(fixture({ days: NORMAL, offset: -5 * 3600 }), false, now);
assert.strictEqual((ny[8] | ny[9] << 8 | ny[10] << 16 | ny[11] << 24) >>> 0, Date.UTC(2026, 10, 21, 5) / 1000);

assert.throws(function () { wx.buildBlob({}, false, now); });

// --- settings page -> watch message ---
var toWatch = require('../src/pkjs/settings_map.js');
var m = toWatch({ theme: '4', sched_on: true, sched_start: '09:00', sched_end: '18:30',
                  sched_days: [true, true, true, true, true, false, false], tap_mode: '2',
                  wx_inside: false, wx_bars: true, color_bg: '0x0055AA', color_hour: 16777215 });
assert.strictEqual(m.sched_on, 1);
assert.strictEqual(toWatch({ sched_scope: '1' }).sched_scope, 1);
assert.strictEqual(toWatch({ peek_secs: '120' }).peek_secs, 120);
assert.strictEqual(m.sched_start, 540);
assert.strictEqual(m.sched_end, 1110);
assert.strictEqual(m.sched_days, 0x3E, 'Mon..Fri -> bits 1..5');
assert.strictEqual(toWatch({ sched_days: [false, false, false, false, false, true, true] }).sched_days, 0x41, 'Sat+Sun');
assert.strictEqual(m.tap_mode, 2);
assert.strictEqual(m.wx_inside, 0);
assert.strictEqual(m.wx_bars, 1);
assert.strictEqual(m.theme, 4);
assert.strictEqual(m.color_bg, 0x0055AA);
assert.strictEqual(m.color_hour, 0xFFFFFF);
assert.strictEqual(toWatch({ sched_start: '' }).sched_start, undefined, 'empty time ignored');
var e = toWatch({ day_start: '07:00', night_start: '23:30', day_refresh: '150', night_refresh: '900',
                  rain_c5: '0xBDEFFF', rain_c20: 0x1762FF });
assert.strictEqual(e.day_start, 420); assert.strictEqual(e.night_start, 1410);
assert.strictEqual(e.day_refresh, 150); assert.strictEqual(e.night_refresh, 900);
assert.strictEqual(e.rain_c5, 0xBDEFFF); assert.strictEqual(e.rain_c20, 0x1762FF);

// --- Pebble app weather (plugin source "weather/location") ---
// Envelope shaped like the documented API: series start at the place's local midnight.
function pluginEnvelope(o) {
  o = o || {};
  var off = o.offsetMin || 0;
  var day0 = Date.UTC(2026, 10, 21) / 1000 - off * 60;
  var unit = o.unit || '°C';
  var days = o.days || 7;
  var ser = function (step, vals, shape, u) {
    var s = { start: day0, stepSec: step };
    s[shape || 'numericValue'] = u === undefined ? { values: vals } : { values: vals, unit: u };
    return { series: s };
  };
  var hi = [], lo = [], pop = [], code = [];
  var codes = ['light_rain', 'partly_cloudy', 'heavy_rain', 'sun', 'cloudy', 'rain_and_snow', 'unknown'];
  for (var i = 0; i < days; i++) {
    hi.push(unit === '°F' ? 64.4 : 18.2); lo.push(unit === '°F' ? 48.9 : 9.4);
    pop.push(i === 1 ? null : 80); code.push(codes[i % codes.length]);
  }
  var props = {
    utc_offset: { numericValue: { value: off, unit: 'min' } },
    daily_high: ser(86400, hi, 'numericValue', unit),
    daily_low: ser(86400, lo, 'numericValue', unit),
    daily_precipitation: ser(86400, pop, 'numericValue', '%'),
    daily_condition_code: ser(86400, code, 'shortText')
  };
  if (o.hourly) {
    var hv = [];
    for (var k = 0; k < days * 24; k++) hv.push(o.hourly(k));
    props.hourly_precipitation_amount = ser(3600, hv, 'numericValue', 'mm');
  }
  return { pluginUuid: 'x', validUntilMs: Date.now() + 3600e3, instances: [{ instanceId: 'a', properties: props }] };
}
var pb = wx.buildBlobFromPlugin(pluginEnvelope({ offsetMin: 60 }), false, now);
var prd16 = function (o) { var v = pb[o] | (pb[o + 1] << 8); return v >= 0x8000 ? v - 0x10000 : v; };
var prd32 = function (o) { return (pb[o] | pb[o + 1] << 8 | pb[o + 2] << 16 | pb[o + 3] << 24) >>> 0; };
assert.strictEqual(pb.length, 20 + 7 * 8 + 73 * 2, '7 plugin days');
assert.strictEqual(pb[1], 7);
assert.strictEqual(prd32(4), now, 'fetched_at');
assert.strictEqual(prd32(8), Date.UTC(2026, 10, 21) / 1000 - 3600, 'day0 = local midnight');
assert.strictEqual(prd32(12), 20261121, 'location date of day 0');
assert.strictEqual(prd32(16), 3600, 'utc offset minutes -> seconds');
assert.strictEqual(prd16(20), 18); assert.strictEqual(prd16(22), 9);
assert.strictEqual(pb[24], 80, 'pop %');
assert.strictEqual(pb[25], wx.ICON.DRIZZLE, 'light_rain');
assert.strictEqual(prd16(26) & 0xFFFF, 0xFFFF, 'no hourly amounts -> mm unknown');
assert.strictEqual(pb[24 + 8], 255, 'missing pop');
assert.strictEqual(pb[25 + 8], wx.ICON.PARTLY);
assert.strictEqual(pb[25 + 16], wx.ICON.RAIN, 'heavy_rain');
assert.strictEqual(pb[25 + 40], wx.ICON.SNOW, 'rain_and_snow');
assert.strictEqual(pb[25 + 48], wx.ICON.NONE, 'unknown');
assert.strictEqual(prd16(20 + 7 * 8) & 0xFFFF, 0xFFFF, 'hourly slot 0 unknown');
// unit conversion both ways
var pf = wx.buildBlobFromPlugin(pluginEnvelope({ unit: '°F' }), false, now);
assert.strictEqual(pf[20] | (pf[21] << 8), 18, '64.4 F -> 18 C');
var pc = wx.buildBlobFromPlugin(pluginEnvelope(), true, now);
assert.strictEqual(pc[2], 1, 'blob says Fahrenheit');
assert.strictEqual(pc[20] | (pc[21] << 8), 65, '18.2 C -> 65 F');
// hourly amounts: daily mm = sum of the 24 hours; blob slot j = hour ending at day0 + j h
var ph = wx.buildBlobFromPlugin(pluginEnvelope({ hourly: function (k) { return k < 24 ? 0.5 : (k === 30 ? null : 0); } }), false, now);
var H = 20 + 7 * 8;
var hrd = function (o) { return ph[o] | (ph[o + 1] << 8); };
assert.strictEqual(hrd(26), 120, 'day 0: 24 x 0.5 mm = 12.0 mm');
assert.strictEqual(hrd(26 + 8), 0xFFFF, 'day 1 has a missing hour -> unknown');
assert.strictEqual(hrd(26 + 16), 0, 'day 2 dry');
assert.strictEqual(hrd(H), 0xFFFF, 'slot 0 (hour before day 0) unknown');
assert.strictEqual(hrd(H + 2), 5, 'slot 1 = first hour, 0.5 mm');
assert.strictEqual(hrd(H + 2 * 31), 0xFFFF, 'missing hour stays unknown');
// no location in the Pebble app / no forecast
assert.throws(function () { wx.buildBlobFromPlugin({ instances: [] }, false, now); },
              function (err) { return err.status === wx.STATUS.LOCATION; });
assert.throws(function () { wx.buildBlobFromPlugin({ instances: [{ properties: {} }] }, false, now); },
              function (err) { return err.status === wx.STATUS.API; });

// --- missing values are unknown, never 0 ---
var bad = fixture({ days: NORMAL, hourly: hourly });
bad.daily.temperature_2m_max[0] = '';
bad.daily.temperature_2m_min[0] = '   ';
bad.daily.precipitation_probability_max[0] = false;
bad.daily.precipitation_sum[0] = [];
bad.daily.temperature_2m_max[1] = NaN;
bad.daily.temperature_2m_min[1] = Infinity;
bad.daily.precipitation_probability_max[1] = true;
bad.daily.precipitation_sum[1] = -Infinity;
bad.daily.temperature_2m_max[2] = '17.6';            // numeric strings still count
bad.hourly.precipitation[1] = '';
bad.hourly.precipitation[2] = NaN;
var bb = wx.buildBlob(bad, false, now);
var brd = function (o) { return bb[o] | (bb[o + 1] << 8); };
assert.strictEqual(brd(20), 0x8000, "tmax '' -> missing");
assert.strictEqual(brd(22), 0x8000, "tmin '   ' -> missing");
assert.strictEqual(bb[24], 255, 'pop false -> missing');
assert.strictEqual(brd(26), 0xFFFF, 'mm [] -> missing');
assert.strictEqual(brd(28), 0x8000, 'tmax NaN -> missing');
assert.strictEqual(brd(30), 0x8000, 'tmin Infinity -> missing');
assert.strictEqual(bb[32], 255, 'pop true -> missing');
assert.strictEqual(brd(34), 0xFFFF, 'mm -Infinity -> missing');
assert.strictEqual(brd(36), 18, "'17.6' -> 18");
assert.strictEqual(brd(20 + 8 * 8 + 2), 0xFFFF, "hourly '' -> missing");
assert.strictEqual(brd(20 + 8 * 8 + 4), 0xFFFF, 'hourly NaN -> missing');
assert.strictEqual(brd(20 + 8 * 8 + 6), 2, 'hourly 0.2 mm kept');

var pbad = pluginEnvelope({ hourly: function (k) { return k === 0 ? '' : (k === 1 ? Infinity : 0.5); } });
var pp = pbad.instances[0].properties;
pp.daily_high.series.numericValue.values[0] = '';
pp.daily_low.series.numericValue.values[0] = false;
pp.daily_precipitation.series.numericValue.values[0] = NaN;
pp.daily_high.series.numericValue.values[1] = Infinity;
pp.daily_low.series.numericValue.values[1] = [];
pp.daily_precipitation.series.numericValue.values[1] = '  ';
pp.utc_offset.numericValue.value = '';
var bp = wx.buildBlobFromPlugin(pbad, false, now);
var bprd = function (o) { return bp[o] | (bp[o + 1] << 8); };
assert.strictEqual(bprd(16), 0, "utc offset '' -> 0 s");
assert.strictEqual(bprd(20), 0x8000, "plugin high '' -> missing");
assert.strictEqual(bprd(22), 0x8000, 'plugin low false -> missing');
assert.strictEqual(bp[24], 255, 'plugin pop NaN -> missing');
assert.strictEqual(bprd(26), 0xFFFF, 'day 0 has unknown hours -> mm unknown');
assert.strictEqual(bprd(28), 0x8000, 'plugin high Infinity -> missing');
assert.strictEqual(bprd(30), 0x8000, 'plugin low [] -> missing');
assert.strictEqual(bp[32], 255, "plugin pop '  ' -> missing");
assert.strictEqual(bprd(34), 120, 'day 1: 24 x 0.5 mm');
var PH = 20 + 7 * 8;
assert.strictEqual(bprd(PH + 2), 0xFFFF, "hourly '' -> missing");
assert.strictEqual(bprd(PH + 4), 0xFFFF, 'hourly Infinity -> missing');
assert.strictEqual(bprd(PH + 6), 5, 'hourly 0.5 mm kept');
// series with start: null is invalid (no slot matches), not epoch 0
var pnull = pluginEnvelope();
pnull.instances[0].properties.daily_low.series.start = null;
var bn = wx.buildBlobFromPlugin(pnull, false, now);
assert.strictEqual(bn[22] | (bn[23] << 8), 0x8000, 'low series with start null -> missing');
var hnull = pluginEnvelope();
hnull.instances[0].properties.daily_high.series.start = null;
assert.throws(function () { wx.buildBlobFromPlugin(hnull, false, now); },
              function (err) { return err.status === wx.STATUS.API; });

// --- fixtures for the host harness ---
var dir = path.join(__dirname, 'fixtures');
if (!fs.existsSync(dir)) fs.mkdirSync(dir);
fs.writeFileSync(path.join(dir, 'normal.bin'), Buffer.from(blob));
fs.writeFileSync(path.join(dir, 'extreme.bin'), Buffer.from(ex));
console.log('weather.js: all tests passed; fixtures written');
