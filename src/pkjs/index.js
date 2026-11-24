// PebbleKit JS: configuration page, location and Open-Meteo forecast.
var Clay = require('@rebble/clay');
var buildConfig = require('./config');
var customFn = require('./config_custom');
var settingsToWatch = require('./settings_map');
var wx = require('./weather');

var LS_SETTINGS = 'omw-settings';
var LS_LAST_POS = 'omw-last-pos';
var LS_GEOCODE = 'omw-geocode';
var LS_LAST_OK = 'omw-last-ok';

var busy = false;

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

// --- location ---
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
function fetchWeather() {
  if (busy) return;
  console.log('fetching forecast');
  busy = true;
  var s = settings();
  var fahrenheit = String(s.units) === '1';
  var locate = s.loc_mode === 'manual' ? function (cb) { manualLocation(s, cb); } : autoLocation;
  locate(function (st, lat, lon) {
    if (st !== wx.STATUS.OK) { busy = false; console.log('location status ' + st); sendStatus(st); return; }
    get(wx.forecastUrl(lat, lon, fahrenheit), 20000, function (st2, json) {
      busy = false;
      if (st2 !== wx.STATUS.OK) { console.log('forecast status ' + st2); sendStatus(st2); return; }
      try {
        var blob = wx.buildBlob(json, fahrenheit, Math.floor(Date.now() / 1000));
        send({ wx: blob }, function (ok) { if (ok) lsSet(LS_LAST_OK, Date.now()); });
        console.log('forecast sent (' + blob.length + ' bytes)');
      } catch (e) {
        console.log('parse error ' + e);
        sendStatus(wx.STATUS.API);
      }
    });
  });
}

// --- configuration ---
function rawValue(x) {
  return (x !== null && typeof x === 'object' && 'value' in x) ? x.value : x;
}

var clay = new Clay(buildConfig(configLang(settings())), customFn, { autoHandleEvents: false });

Pebble.addEventListener('showConfiguration', function () {
  // A fresh Clay (so the page language follows the current setting). With autoHandleEvents
  // off, Clay only reads the watch model on 'ready', so fill it in here: without it the page
  // assumes a black & white watch and every colour collapses to white.
  clay = new Clay(buildConfig(configLang(settings())), customFn, { autoHandleEvents: false });
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
  var refetch = weatherNeeded(s) && (String(old.units) !== String(s.units) || old.loc_mode !== s.loc_mode ||
                (old.loc_name || '') !== (s.loc_name || '') || !weatherNeeded(old));
  if ((old.loc_name || '') !== (s.loc_name || '')) lsSet(LS_GEOCODE, null);
  send(settingsToWatch(s), function () { if (refetch) fetchWeather(); });
});

Pebble.addEventListener('appmessage', function (e) {
  if (e.payload && e.payload.cmd !== undefined) fetchWeather();
});

// The watchface (and this JS) restarts whenever the user returns from an app: only fetch
// on start-up when the last successful forecast is older than the refresh interval.
function weatherNeeded(s) {
  // Defaults are "shown"; skip the network only when the user turned everything off.
  return s.wx_inside !== false || s.wx_bars !== false || (parseInt(s.tap_mode, 10) || 0) !== 0;
}

Pebble.addEventListener('ready', function () {
  console.log('One Minute Weather JS ready');
  if (!weatherNeeded(settings())) return;
  var intervalMs = (parseInt(settings().interval, 10) || 60) * 60000;
  var last = lsGet(LS_LAST_OK, 0);
  if (Date.now() - last >= intervalMs) fetchWeather();
});
