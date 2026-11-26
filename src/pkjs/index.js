// PebbleKit JS: configuration page and forecast, from the Pebble app's own weather (plugin
// source "weather/location", mobile app 2.0+) or from Open-Meteo (own location + HTTP).
var Clay = require('@rebble/clay');
var buildConfig = require('./config');
var customFn = require('./config_custom');
var settingsToWatch = require('./settings_map');
var wx = require('./weather');

var LS_SETTINGS = 'omw-settings';
var LS_LAST_POS = 'omw-last-pos';
var LS_GEOCODE = 'omw-geocode';
var LS_PENDING = 'omw-pending';    // settings not yet delivered to the watch: { invalidate }
var LS_LAST_OK = 'omw-last-ok';    // ms of the last forecast delivered to the watch
var CMD_FETCH = 1;        // watch -> phone: send a forecast
var CMD_READY = 2;        // phone -> watch: JS started, the watch decides whether to ask
var CMD_INVALIDATE = 3;   // phone -> watch (with settings): the cached forecast is obsolete
var SRC_PEBBLE = '0';     // wx_source: the Pebble app's weather (default) ...
                          // ... or '1': Open-Meteo

var busy = false;
var pluginBroken = false;   // the Pebble app refused its weather source: Open-Meteo this session
var retryTimer = null;

function lsGet(k, def) {
  try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; }
}
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } }

function settings() { return lsGet(LS_SETTINGS, {}); }

function phoneLang() {
  var l = (navigator && navigator.language) ? navigator.language.toLowerCase() : 'en';
  return l.indexOf('pt') === 0 ? 'pt' : 'en';
}
function configLang(s) {
  if (String(s.lang) === '1') return 'pt';
  if (String(s.lang) === '2') return 'en';
  return phoneLang();
}

function send(dict, done) {
  Pebble.sendAppMessage(dict, function () { if (done) done(true); },
    function (e) { console.log('send failed ' + JSON.stringify(e)); if (done) done(false); });
}

function sendStatus(code) { send({ status: code }); }

function get(url, timeoutMs, cb) {
  var req = new XMLHttpRequest();
  var finished = false;
  var timer = setTimeout(function () {
    if (finished) return; finished = true;
    try { req.abort(); } catch (e) { /* ignore */ }
    cb(wx.STATUS.NETWORK);
  }, timeoutMs);
  req.onload = function () {
    if (finished) return; finished = true; clearTimeout(timer);
    if (req.status !== 200) { console.log('HTTP ' + req.status + ' ' + url.split('?')[0]); cb(wx.STATUS.API); return; }
    try { cb(wx.STATUS.OK, JSON.parse(req.responseText)); } catch (e) { cb(wx.STATUS.API); }
  };
  req.onerror = function () { if (finished) return; finished = true; clearTimeout(timer); cb(wx.STATUS.NETWORK); };
  req.open('GET', url);
  req.send();
}

// --- location (Open-Meteo only) ---
function manualLocation(s, cb) {
  var name = (s.loc_name || '').trim();
  if (!name) { cb(wx.STATUS.NOT_FOUND); return; }
  var cache = lsGet(LS_GEOCODE, null);
  if (cache && cache.name === name) { cb(wx.STATUS.OK, cache.lat, cache.lon); return; }
  get(wx.geocodeUrl(name, configLang(s)), 15000, function (st, json) {
    if (st !== wx.STATUS.OK) { cb(st); return; }
    var r = json && json.results && json.results[0];
    if (!r) { cb(wx.STATUS.NOT_FOUND); return; }
    lsSet(LS_GEOCODE, { name: name, lat: r.latitude, lon: r.longitude });
    cb(wx.STATUS.OK, r.latitude, r.longitude);
  });
}

function autoLocation(cb) {
  var last = lsGet(LS_LAST_POS, null);
  if (!navigator.geolocation) {
    if (last) cb(wx.STATUS.OK, last.lat, last.lon); else cb(wx.STATUS.LOCATION);
    return;
  }
  navigator.geolocation.getCurrentPosition(function (pos) {
    var p = { lat: pos.coords.latitude, lon: pos.coords.longitude, t: Date.now() };
    lsSet(LS_LAST_POS, p);
    cb(wx.STATUS.OK, p.lat, p.lon);
  }, function (err) {
    console.log('location error ' + (err && err.code));
    // Permission denied / GPS unavailable: fall back to the last known position, if any.
    if (last) cb(wx.STATUS.OK, last.lat, last.lon); else cb(wx.STATUS.LOCATION);
  }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 30 * 60 * 1000 });
}

// --- forecast ---
function source(s) { return s.wx_source === undefined ? SRC_PEBBLE : String(s.wx_source); }
function nativeAvailable() { return !pluginBroken && typeof Pebble.subscribeToSource === 'function'; }

// Settings that change what a forecast request returns.
function forecastKey(s) {
  return [String(s.units), source(s), s.loc_mode || '', (s.loc_name || '').trim()].join('|');
}

function weatherNeeded(s) {
  // Defaults are "shown"; skip the network only when the user turned everything off.
  return s.wx_inside !== false || s.wx_bars !== false || (parseInt(s.tap_mode, 10) || 0) !== 0;
}

// One reading of the Pebble app's weather, then unsubscribe: the app keeps its forecast up to
// date on its own, so this costs no GPS fix and no download here.
// cb(status, blob); status null = source unavailable, use Open-Meteo.
function fetchNative(fahrenheit, cb) {
  var done = false, sub = null;
  var timer = setTimeout(function () { finish(wx.STATUS.NETWORK); }, 20000);
  function finish(st, blob) {
    if (done) return;
    done = true;
    clearTimeout(timer);
    if (sub) { try { sub.unsubscribe(); } catch (e) { /* ignore */ } }
    cb(st, blob);
  }
  try {
    sub = Pebble.subscribeToSource({
      category: 'weather', item: 'location', properties: wx.PLUGIN_PROPERTIES, limit: 1,
      onData: function (env) {
        var nowMs = Date.now();
        // Data the source still calls valid counts as fresh; expired data keeps its age.
        var at = (env && env.validUntilMs && env.validUntilMs < nowMs) ? env.validUntilMs : nowMs;
        try { finish(wx.STATUS.OK, wx.buildBlobFromPlugin(env, fahrenheit, Math.floor(at / 1000))); }
        catch (e) { console.log('pebble weather: ' + e.message); finish(e.status || wx.STATUS.API); }
      },
      onError: function (err) {
        var code = err && err.code;
        console.log('pebble weather error ' + code);
        if (code === 'PLUGIN_UNAVAILABLE' || code === 'PERMISSION_DENIED' || code === 'INVALID_REQUEST') {
          pluginBroken = true;
          finish(null);
        } else {
          finish(wx.STATUS.NETWORK);   // TIMEOUT, RATE_LIMITED, UNKNOWN: the watch backs off
        }
      }
    });
  } catch (e) {
    console.log('subscribeToSource failed ' + e);
    pluginBroken = true;
    finish(null);
    return;
  }
  // Data delivered synchronously, before `sub` was assigned.
  if (done && sub) { try { sub.unsubscribe(); } catch (e) { /* ignore */ } }
}

// Own location + Open-Meteo. alive() is checked between the steps, so a request the user no
// longer wants (weather turned off, other units or place) stops before the download.
// cb(status, blob); status null = abandoned.
function fetchOpenMeteo(s, fahrenheit, alive, cb) {
  var locate = s.loc_mode === 'manual' ? function (c) { manualLocation(s, c); } : autoLocation;
  locate(function (st, lat, lon) {
    if (!alive()) { cb(null); return; }
    if (st !== wx.STATUS.OK) { console.log('location status ' + st); cb(st); return; }
    get(wx.forecastUrl(lat, lon, fahrenheit), 20000, function (st2, json) {
      if (st2 !== wx.STATUS.OK) { console.log('forecast status ' + st2); cb(st2); return; }
      try { cb(wx.STATUS.OK, wx.buildBlob(json, fahrenheit, Math.floor(Date.now() / 1000))); }
      catch (e) { console.log('parse error ' + e); cb(wx.STATUS.API); }
    });
  });
}

// Only ever started by the watch (cmd 1): it alone knows the forecast age, the "no weather"
// schedule and the wrist-tap mode.
function fetchWeather() {
  var s = settings();
  if (busy || !weatherNeeded(s)) return;
  busy = true;
  var key = forecastKey(s);
  var fahrenheit = String(s.units) === '1';
  function alive() { var n = settings(); return weatherNeeded(n) && forecastKey(n) === key; }
  function finish(st, blob) {
    busy = false;
    if (!alive()) {
      // Settings changed meanwhile: drop this result (the watch would take it as fresh) and, if
      // the forecast is still wanted, fetch once with the current settings.
      console.log('settings changed during fetch');
      if (weatherNeeded(settings())) fetchWeather();
      return;
    }
    if (st === null) return;
    if (st !== wx.STATUS.OK) { sendStatus(st); return; }
    syncSettings(function () {
      send({ wx: blob }, function (ok) { if (ok) lsSet(LS_LAST_OK, Date.now()); });
    });
    console.log('forecast sent (' + blob.length + ' bytes)');
  }
  function openMeteo() { fetchOpenMeteo(s, fahrenheit, alive, finish); }
  if (source(s) === SRC_PEBBLE && nativeAvailable()) {
    console.log('forecast from the Pebble app');
    fetchNative(fahrenheit, function (st, blob) {
      if (st !== null) { finish(st, blob); return; }
      if (!alive()) { finish(null); return; }
      console.log('Pebble app weather unavailable: Open-Meteo');
      openMeteo();
    });
  } else {
    console.log('forecast from Open-Meteo');
    openMeteo();
  }
}

// --- settings delivery ---
// Settings saved on the phone stay pending until the watch acknowledges them, so a Bluetooth
// failure cannot leave the two sides with different units or colours.
// cb(delivered): true / false, or null when nothing was pending.
var syncWaiters = null;   // callbacks waiting for the settings message in flight

function syncSettings(cb) {
  if (syncWaiters) { if (cb) syncWaiters.push(cb); return; }   // one message at a time
  var p = lsGet(LS_PENDING, null);
  if (!p) { if (cb) cb(null); return; }
  syncWaiters = cb ? [cb] : [];
  var d = settingsToWatch(settings());
  var sentCfg = JSON.stringify(d);
  if (p.invalidate) d.cmd = CMD_INVALIDATE;
  send(d, function (ok) {
    var waiters = syncWaiters;
    syncWaiters = null;
    if (ok) {
      if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
      var now = lsGet(LS_PENDING, null);
      if (JSON.stringify(settingsToWatch(settings())) === sentCfg && !(now && now.invalidate && !p.invalidate)) {
        lsSet(LS_PENDING, null);
      } else {
        syncSettings();   // saved again while this was in flight: deliver the newer version
      }
    } else if (!retryTimer) {
      // One later attempt; after that, the next watch message or JS start retries.
      retryTimer = setTimeout(function () { retryTimer = null; syncSettings(); }, 60000);
    }
    waiters.forEach(function (w) { w(ok); });
  });
}

// --- configuration ---
function rawValue(x) {
  return (x !== null && typeof x === 'object' && 'value' in x) ? x.value : x;
}

// One Clay for the whole session: every `new Clay` adds a 'ready' listener that keeps that
// instance alive, so re-creating it per page opening leaked one instance each time.
var clay = new Clay(buildConfig(configLang(settings())), customFn, { autoHandleEvents: false });

Pebble.addEventListener('showConfiguration', function () {
  // Rebuild only the config so the page language follows the current setting (component
  // types are the same in every language). With autoHandleEvents off, Clay only reads the
  // watch model on 'ready', so fill it in here: without it the page assumes a black & white
  // watch and every colour collapses to white.
  clay.config = buildConfig(configLang(settings()));
  clay.meta = {
    activeWatchInfo: Pebble.getActiveWatchInfo ? Pebble.getActiveWatchInfo() : null,
    accountToken: Pebble.getAccountToken(),
    watchToken: Pebble.getWatchToken(),
    userData: {}
  };
  Pebble.openURL(clay.generateUrl());
});

Pebble.addEventListener('webviewclosed', function (e) {
  if (!e || !e.response) return;
  var raw = clay.getSettings(e.response, false);
  var old = settings();
  var s = {};
  Object.keys(raw).forEach(function (k) { s[k] = rawValue(raw[k]); });
  lsSet(LS_SETTINGS, s);
  if ((old.loc_name || '') !== (s.loc_name || '')) lsSet(LS_GEOCODE, null);
  if (source(s) === SRC_PEBBLE) pluginBroken = false;   // saving again retries the Pebble source
  // No download here: the watch is told its forecast is obsolete and asks for a new one when
  // the weather can actually be shown (schedule, tap mode), once.
  var obsolete = weatherNeeded(s) && (forecastKey(old) !== forecastKey(s) || !weatherNeeded(old));
  var prev = lsGet(LS_PENDING, null);
  lsSet(LS_PENDING, { invalidate: obsolete || !!(prev && prev.invalidate) });
  syncSettings();
});

Pebble.addEventListener('appmessage', function (e) {
  syncSettings();   // the watch is reachable: deliver settings still pending
  if (e.payload && e.payload.cmd === CMD_FETCH) fetchWeather();
});

// The watchface (and this JS) restarts whenever the user returns from an app. The phone never
// fetches on its own here. Pending settings go first (the watch re-checks its forecast when it
// gets them); otherwise "ready" is sent only when the last delivered forecast is old enough to
// be due, so a quick return from an app costs no Bluetooth message.
Pebble.addEventListener('ready', function () {
  console.log('One Minute Weather JS ready');
  syncSettings(function (delivered) {
    if (delivered !== null) return;
    var s = settings();
    if (!weatherNeeded(s)) return;
    var intervalMs = (parseInt(s.interval, 10) || 60) * 60000;
    if (Date.now() - lsGet(LS_LAST_OK, 0) >= intervalMs) send({ cmd: CMD_READY });
  });
});
