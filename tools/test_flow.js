// Drives the real src/pkjs/index.js with a fake PebbleKit JS runtime (no phone, no network):
// settings delivery, forecast sources, retries and leaks. Usage: node tools/test_flow.js
var Module = require('module');
var path = require('path');
var assert = require('assert');
var root = path.join(__dirname, '..');
var log = console.log.bind(console);
console.log = function () {};   // the app's own logging

// opts.plugin: the phone app has subscribeToSource. opts.manual: AppMessage acks are given by
// the test (env.ack) instead of at once.
function setup(opts) {
  opts = opts || {};
  var env = { listeners: {}, sent: [], acks: [], xhrs: [], store: {}, geo: [], subs: [], unsubs: 0,
              sendFail: false, timers: [], watchCfg: 0 };
  // The watch keeps the cfg_id of the last settings it received and sends it with cmd 1.
  function delivered(m) { if (m.cfg_id !== undefined) env.watchCfg = m.cfg_id; }
  global.localStorage = { getItem: function (k) { return env.store[k] || null; }, setItem: function (k, v) { env.store[k] = v; } };
  Object.defineProperty(global, 'navigator', { configurable: true, value: { language: 'pt-PT', geolocation: {
    getCurrentPosition: function (ok) { env.geo.push(ok); } } } });
  global.Pebble = {
    addEventListener: function (n, f) { (env.listeners[n] = env.listeners[n] || []).push(f); },
    sendAppMessage: function (d, ok, ko) {
      var copy = JSON.parse(JSON.stringify(d));
      env.sent.push(copy);
      if (opts.manual) { env.acks.push({ msg: copy, ok: ok, ko: ko }); return; }
      copy._ok = !env.sendFail;
      if (env.sendFail) { if (ko) ko({}); } else { delivered(copy); if (ok) ok(); }
    },
    openURL: function () {}, getAccountToken: function () { return ''; }, getWatchToken: function () { return ''; },
    getActiveWatchInfo: function () { return { platform: 'emery' }; }
  };
  if (opts.plugin) {
    Pebble.subscribeToSource = function (req) {
      var sub = { req: req, active: true, unsubscribe: function () { if (this.active) env.unsubs++; this.active = false; } };
      env.subs.push(sub);
      return sub;
    };
  }
  global.XMLHttpRequest = function () { var r = this; r.open = function (m, u) { r.url = u; }; r.send = function () { env.xhrs.push(r); }; r.abort = function () {}; };
  global.setTimeout = function (f, ms) { env.timers.push({ f: f, ms: ms, live: true }); return env.timers.length; };
  global.clearTimeout = function (id) { if (env.timers[id - 1]) env.timers[id - 1].live = false; };
  function FakeClay(cfg) { this.config = cfg; Pebble.addEventListener('ready', function () {}); }
  FakeClay.prototype.generateUrl = function () { return 'data:'; };
  FakeClay.prototype.getSettings = function (r) { return JSON.parse(r); };
  var orig = Module._load;
  Module._load = function (req) { return req === '@rebble/clay' ? FakeClay : orig.apply(this, arguments); };
  Object.keys(require.cache).forEach(function (k) { if (k.indexOf(path.join(root, 'src')) === 0) delete require.cache[k]; });
  require(path.join(root, 'src/pkjs/index.js'));
  Module._load = orig;
  env.fire = function (n, e) { (env.listeners[n] || []).slice().forEach(function (f) { f(e || {}); }); };
  env.save = function (s) { env.fire('webviewclosed', { response: JSON.stringify(s) }); };
  env.ask = function () { env.fire('appmessage', { payload: { cmd: 1, cfg_id: env.watchCfg } }); };
  env.wxSent = function () { return env.sent.filter(function (d) { return d.wx; }); };
  env.ack = function (ok) { var a = env.acks.shift(); a.msg._ok = ok; if (ok) { delivered(a.msg); if (a.ok) a.ok(); } else if (a.ko) a.ko({}); };
  env.retries = function () { return env.timers.filter(function (t) { return t.live && t.ms === 60000; }); };
  return env;
}

function plugEnv(unit) {
  var day0 = Math.floor(Date.now() / 86400000) * 86400;
  var s = function (vals, u, shape) { var o = { start: day0, stepSec: 86400 }; o[shape || 'numericValue'] = { values: vals, unit: u }; return { series: o }; };
  return { validUntilMs: Date.now() + 3600e3, instances: [{ properties: {
    utc_offset: { numericValue: { value: 0 } },
    daily_high: s([20, 21, 22, 23, 24, 25, 26], unit || '°C'), daily_low: s([10, 11, 12, 13, 14, 15, 16], unit || '°C'),
    daily_precipitation: s([10, 20, 30, 40, 50, 60, 70], '%'),
    daily_condition_code: s(['sun', 'sun', 'cloudy', 'light_rain', 'sun', 'sun', 'sun'], undefined, 'shortText') } }] };
}
function ok(msg) { log('ok  ' + msg); }
var e, i;

// Clay: one instance, no listener leak
e = setup({ plugin: true });
var n0 = e.listeners.ready.length;
for (i = 0; i < 20; i++) e.fire('showConfiguration');
assert.strictEqual(e.listeners.ready.length, n0); ok('20 openings of the settings: ready listeners stay ' + n0);

// ready: no message when the last forecast is recent; cmd 2 when it is due
e.store['omw-last-ok'] = JSON.stringify(Date.now());
e.fire('ready'); assert.strictEqual(e.sent.length, 0); ok('ready with a recent forecast: no Bluetooth message');
e.store['omw-last-ok'] = JSON.stringify(Date.now() - 61 * 60000);
e.fire('ready'); assert.deepStrictEqual(e.sent.pop(), { cmd: 2, _ok: true }); ok('ready with a due forecast: cmd 2');

// Pebble source (default): cmd 1 -> one subscription, no GPS, no HTTP, unsubscribed
e.ask();
assert.strictEqual(e.subs.length, 1); assert.strictEqual(e.subs[0].req.category, 'weather');
e.subs[0].req.onData(plugEnv());
assert.strictEqual(e.xhrs.length, 0); assert.strictEqual(e.geo.length, 0);
assert.strictEqual(e.unsubs, 1); assert.strictEqual(e.wxSent().length, 1);
assert.strictEqual(e.wxSent()[0].wx[1], 7);
ok('Pebble source: forecast from the subscription, no GPS/HTTP, unsubscribed');
for (i = 0; i < 100; i++) { e.ask(); e.subs[e.subs.length - 1].req.onData(plugEnv()); }
assert.strictEqual(e.subs.filter(function (s) { return s.active; }).length, 0);
ok('100 Pebble-source requests: no subscription left open');

// a late error from a subscription already answered does not disable the Pebble source
e = setup({ plugin: true });
e.ask(); e.subs[0].req.onData(plugEnv());
e.subs[0].req.onError({ code: 'PLUGIN_UNAVAILABLE' });
e.ask();
assert.strictEqual(e.subs.length, 2); assert.strictEqual(e.geo.length, 0);
ok('late PLUGIN_UNAVAILABLE after the data: the Pebble source stays in use');

// older phone app (no subscribeToSource) -> Open-Meteo
e = setup({ plugin: false });
e.ask(); assert.strictEqual(e.geo.length, 1); ok('no plugin API: falls back to Open-Meteo (GPS)');
// plugin refuses -> Open-Meteo
e = setup({ plugin: true });
e.ask(); e.subs[0].req.onError({ code: 'PLUGIN_UNAVAILABLE' });
assert.strictEqual(e.geo.length, 1); ok('PLUGIN_UNAVAILABLE: falls back to Open-Meteo');
// transient error: status to the watch, no fallback
e = setup({ plugin: true });
e.ask(); e.subs[0].req.onError({ code: 'TIMEOUT' });
assert.strictEqual(e.geo.length, 0); assert.strictEqual(e.sent.pop().status, 2); ok('TIMEOUT: network status, no fallback');

// saving settings: no download; settings + cmd 3; the watch asks later
e = setup({ plugin: true });
e.save({ units: '1' });
assert.strictEqual(e.subs.length + e.xhrs.length + e.geo.length, 0);
var last = e.sent.pop(); assert.strictEqual(last.cmd, 3); assert.strictEqual(last.units, 1);
ok('save with new units: settings + cmd 3, no download (the watch decides)');
e.save({ units: '1', theme: '2' });
assert.strictEqual(e.sent.pop().cmd, undefined); ok('save with only a colour change: no cmd 3');

// Bluetooth failure while saving: settings stay pending and go before the next forecast
e = setup({ plugin: true });
e.sendFail = true; e.save({ units: '1' }); e.sendFail = false;
assert(JSON.parse(e.store['omw-pending']).invalidate);
e.ask();                                     // asked with the old settings: not served ...
var cfgIdx = e.sent.findIndex(function (d) { return d.units === 1 && d._ok; });
assert(cfgIdx >= 0, 'pending settings resent');
assert.strictEqual(e.sent[cfgIdx].cmd, 3); assert.strictEqual(e.subs.length, 0);
e.ask();                                     // ... the watch asks again with the new ones
e.subs[0].req.onData(plugEnv());
var wxIdx = e.sent.findIndex(function (d) { return d.wx; });
assert(wxIdx > cfgIdx && e.sent[wxIdx].wx[2] === 1, 'Fahrenheit forecast only after the settings');
assert.strictEqual(JSON.parse(e.store['omw-pending']), null);
ok('Bluetooth failure on save: settings resent before the Fahrenheit forecast');

// settings still not delivered when the forecast is ready: the forecast is held back
// (a colour change keeps the request current, so the fetch itself runs)
e = setup({ plugin: true });
e.sendFail = true; e.save({ theme: '2' });
e.ask(); e.subs[0].req.onData(plugEnv());
assert.strictEqual(e.wxSent().length, 0);
assert(JSON.parse(e.store['omw-pending']));
e.sendFail = false; e.ask();                 // link back: the next request works
e.subs[1].req.onData(plugEnv());
assert.strictEqual(e.wxSent().length, 1);
var th = e.sent.findIndex(function (d) { return d.theme === 2 && d._ok; });
assert(th >= 0 && th < e.sent.indexOf(e.wxSent()[0]));
ok('settings delivery fails: no forecast sent before the settings reach the watch');

// pending settings on JS start
e = setup({ plugin: true });
e.sendFail = true; e.save({ theme: '3' }); e.sendFail = false; e.sent.length = 0;
e.fire('ready'); assert.strictEqual(e.sent.length, 1); assert.strictEqual(e.sent[0].theme, 3);
ok('JS start with pending settings: they are delivered (no extra cmd 2)');

// settings retry: one timed attempt per failure streak, not one every minute
e = setup({ plugin: true });
e.sendFail = true; e.save({ units: '1' });
assert.strictEqual(e.retries().length, 1);
for (i = 0; i < 5; i++) { var r = e.retries()[0]; if (!r) break; r.live = false; r.f(); }
assert.strictEqual(e.sent.length, 2); assert.strictEqual(e.retries().length, 0);
e.save({ units: '0' }); assert.strictEqual(e.retries().length, 1);
e.sendFail = false; var r2 = e.retries()[0]; r2.live = false; r2.f();
assert.strictEqual(JSON.parse(e.store['omw-pending']), null);
ok('settings retry: a failed retry schedules no other; a new save gets its own');

// units saved while the forecast waits for the previous settings: the old result is dropped
e = setup({ plugin: true, manual: true });
e.save({ theme: '2' });                      // settings in flight (no ack yet)
e.ask(); e.subs[0].req.onData(plugEnv());    // forecast in °C ready, waiting for the settings
e.save({ theme: '2', units: '1' });          // user switches to °F meanwhile
e.ack(true);                                 // first settings acknowledged
assert.strictEqual(e.wxSent().length, 0, 'Celsius forecast dropped');
assert.strictEqual(e.subs.length, 1, 'no request of its own: the watch decides');
e.ack(true);                                 // the °F settings (cmd 3) reach the watch ...
e.ask();                                     // ... which asks for a new forecast
assert.strictEqual(e.subs.length, 2);
e.subs[1].req.onData(plugEnv());
while (e.acks.length) e.ack(true);
assert.strictEqual(e.wxSent().length, 1); assert.strictEqual(e.wxSent()[0].wx[2], 1);
var lastCfg = e.sent.map(function (d) { return d.wx ? 'wx' : d.units; }).filter(function (x) { return x !== undefined; });
assert.strictEqual(lastCfg[lastCfg.length - 1], 'wx'); assert.strictEqual(lastCfg[lastCfg.length - 2], 1);
ok('units change while waiting for settings delivery: only the Fahrenheit forecast is sent');

// weather turned off while Open-Meteo waits for the location: no HTTP, nothing sent
e = setup({ plugin: false });
e.save({ wx_source: '1' }); e.sent.length = 0;
e.ask(); assert.strictEqual(e.geo.length, 1);
e.save({ wx_source: '1', wx_inside: false, wx_bars: false, tap_mode: '0' }); e.sent.length = 0;
e.geo[0]({ coords: { latitude: 38.7, longitude: -9.1 } });
assert.strictEqual(e.xhrs.length, 0); assert.strictEqual(e.wxSent().length, 0);
ok('weather off during the location wait: no download, nothing sent');

// units changed and weather hidden by the schedule during the location wait: the watch does
// not ask again, so the phone starts no new location fix or download of its own
e = setup({ plugin: false });
var chosen = { wx_source: '1', units: '0' };
e.save(chosen); e.ask();
assert.strictEqual(e.geo.length, 1);
e.save({ wx_source: '1', units: '1', sched_on: true, sched_scope: '0' });
e.geo[0]({ coords: { latitude: 38.7, longitude: -9.1 } });
assert.strictEqual(e.geo.length, 1); assert.strictEqual(e.xhrs.length, 0);
ok('settings change without a new watch request: no GPS fix or download of its own');

// units change during an Open-Meteo download: one refetch, stale result dropped
e = setup({ plugin: false });
e.ask(); e.geo[0]({ coords: { latitude: 38.7, longitude: -9.1 } });
assert.strictEqual(e.xhrs.length, 1);
e.save({ units: '1' });
e.ask();
var x = e.xhrs[0]; x.status = 200; x.responseText = '{}'; x.onload();
assert.strictEqual(e.geo.length, 2, 'exactly one restart');
e.geo[1]({ coords: { latitude: 38.7, longitude: -9.1 } });
assert.strictEqual(e.xhrs.length, 2); assert(/fahrenheit/.test(e.xhrs[1].url));
assert.strictEqual(e.wxSent().length, 0);
ok('units change mid-download: Celsius result dropped, a single Fahrenheit download');

// a request queued before the settings change does not authorise a new fetch
e = setup({ plugin: false });
e.save({ wx_source: '1', units: '0' });
e.ask(); e.ask();                            // second cmd 1 queued while the first runs
e.save({ wx_source: '1', units: '1', sched_on: true, sched_scope: '0' });
e.geo[0]({ coords: { latitude: 38.7, longitude: -9.1 } });
assert.strictEqual(e.geo.length, 1); assert.strictEqual(e.xhrs.length, 0);
assert.strictEqual(e.wxSent().length, 0);
ok('cmd 1 queued before a settings change: no fetch of its own after it');

// several changes, all after the queued request: still nothing
e = setup({ plugin: false });
e.save({ wx_source: '1', units: '0' });
e.ask(); e.ask();
e.save({ wx_source: '1', units: '1' });
e.save({ wx_source: '1', units: '1', loc_mode: 'manual', loc_name: 'Porto' });
e.geo[0]({ coords: { latitude: 38.7, longitude: -9.1 } });
assert.strictEqual(e.geo.length, 1); assert.strictEqual(e.xhrs.length, 0);
ok('cmd 1 queued before several settings changes: no fetch of its own');

// requests on both sides of a change: exactly one replacement, with the latest settings
e = setup({ plugin: false });
e.save({ wx_source: '1', units: '0' });
e.ask(); e.ask();
e.save({ wx_source: '1', units: '1' });
e.ask(); e.ask();                            // the watch asks after the change (twice)
e.geo[0]({ coords: { latitude: 38.7, longitude: -9.1 } });
assert.strictEqual(e.geo.length, 2, 'exactly one restart');
e.geo[1]({ coords: { latitude: 38.7, longitude: -9.1 } });
assert.strictEqual(e.xhrs.length, 1); assert(/fahrenheit/.test(e.xhrs[0].url));
ok('cmd 1 before and after a settings change: a single Fahrenheit fetch');

// request between two changes: the second change forgets it
e = setup({ plugin: false });
e.save({ wx_source: '1', units: '0' });
e.ask();
e.save({ wx_source: '1', units: '1' });
e.ask();                                     // asked after the first change ...
e.save({ wx_source: '1', units: '1', loc_mode: 'manual', loc_name: 'Porto' });   // ... not the second
e.geo[0]({ coords: { latitude: 38.7, longitude: -9.1 } });
assert.strictEqual(e.geo.length, 1); assert.strictEqual(e.xhrs.length, 0);
e.ask();                                     // the watch asks after the latest settings
assert.strictEqual(e.xhrs.length, 1, 'manual location: geocoding request');
ok('cmd 1 between two settings changes: forgotten; the next request fetches');

// a colour-only save after the request keeps it (no cmd 3: the watch will not ask again)
e = setup({ plugin: false });
e.save({ wx_source: '1', units: '0' });
e.ask();
e.save({ wx_source: '1', units: '1' });
e.ask();
e.save({ wx_source: '1', units: '1', theme: '2' });
e.geo[0]({ coords: { latitude: 38.7, longitude: -9.1 } });
assert.strictEqual(e.geo.length, 2, 'exactly one restart');
ok('colour-only save after the request: the queued request still fetches once');

log('index.js flows: all tests passed');
