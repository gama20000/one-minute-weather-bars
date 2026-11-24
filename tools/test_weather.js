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

// --- fixtures for the host harness ---
var dir = path.join(__dirname, 'fixtures');
if (!fs.existsSync(dir)) fs.mkdirSync(dir);
fs.writeFileSync(path.join(dir, 'normal.bin'), Buffer.from(blob));
fs.writeFileSync(path.join(dir, 'extreme.bin'), Buffer.from(ex));
console.log('weather.js: all tests passed; fixtures written');
