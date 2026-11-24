// Live check against the real Open-Meteo API (needs internet): geocoding + forecast,
// blob conversion and consistency of daily vs hourly precipitation. Writes fixtures/live.bin.
var wx = require('../src/pkjs/weather.js');
var fs = require('fs'), path = require('path'), assert = require('assert');
async function get(u) { var r = await fetch(u); assert.strictEqual(r.status, 200, u); return r.json(); }
(async function () {
  var g = await get(wx.geocodeUrl('Lisboa', 'pt'));
  var p = g.results[0];
  console.log('geocode:', p.name, p.country, p.latitude, p.longitude, p.timezone);
  var nf = await get(wx.geocodeUrl('Xyzzyqwertville', 'pt'));
  assert.ok(!nf.results || !nf.results.length, 'unknown place -> no results');
  for (const f of [false, true]) {
    var j = await get(wx.forecastUrl(p.latitude, p.longitude, f));
    assert.strictEqual(j.daily.time.length, 8);
    var blob = wx.buildBlob(j, f, Math.floor(Date.now() / 1000));
    assert.ok(blob.length <= 256);
    var d0 = j.daily.time[0], sum = 0, missing = 0;
    for (var k = 1; k <= 24; k++) {
      var i = j.hourly.time.indexOf(d0 + k * 3600);
      if (i < 0) missing++; else sum += j.hourly.precipitation[i];
    }
    console.log((f ? 'F' : 'C'), 'offset', j.utc_offset_seconds, 'day0', new Date((d0 + j.utc_offset_seconds) * 1000).toISOString().slice(0, 10),
      'max', j.daily.temperature_2m_max.slice(0, 6), 'min', j.daily.temperature_2m_min.slice(0, 6),
      'pop', j.daily.precipitation_probability_max.slice(0, 6), 'mm', j.daily.precipitation_sum.slice(0, 6),
      'codes', j.daily.weather_code.slice(0, 6), '| hourly day0 sum', sum.toFixed(2), 'missing', missing);
    assert.strictEqual(missing, 0);
    // hourly values cover the preceding hour: hours ending 01:00..24:00 must add up to the daily sum
    assert.ok(Math.abs(sum - j.daily.precipitation_sum[0]) < 0.15, 'hourly vs daily');
    if (!f) fs.writeFileSync(path.join(__dirname, 'fixtures', 'live.bin'), Buffer.from(blob));
  }
  console.log('live Open-Meteo test passed');
})().catch(function (e) { console.error(e); process.exit(1); });
