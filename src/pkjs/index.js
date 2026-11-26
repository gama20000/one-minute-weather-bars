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
var LS_CFG_ID = 'omw-cfg-id';      // version of the settings that decide whether / what to fetch
var CMD_FETCH = 1;        // watch -> phone: send a forecast
var CMD_READY = 2;        // phone -> watch: JS started, the watch decides whether to ask
var CMD_INVALIDATE = 3;   // phone -> watch (with settings): the cached forecast is obsolete
var SRC_PEBBLE = '0';     // wx_source: the Pebble app's weather (default) ...
                          // ... or '1': Open-Meteo

var busy = false;
var askedAgain = false;      // cmd 1 arrived while a fetch was running, after the last forecast change
var pluginBroken = false;   // the Pebble app refused its weather source: Open-Meteo this session
var retryTimer = null;
var syncRetried = false;    // the timed settings retry was used in this failure streak
var resyncedId = null;      // settings version already resent to a watch that asked with another

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
    var json;
    try { json = JSON.parse(req.responseText); } catch (e) { cb(wx.STATUS.API); return; }
    cb(wx.STATUS.OK, json);   // outside the try: an error in cb must not run cb a second time
  };
  req.onerror = function () { if (finished) return; finished = true; clearTimeout(timer); cb(wx.STATUS.NETWORK); };
  try {
    req.open('GET', url);
    req.send();
  } catch (e) {
    if (finished) return; finished = true; clearTimeout(timer);
    console.log('request failed ' + e);
    cb(wx.STATUS.NETWORK);
  }
}

// --- location (Open-Meteo only) ---
// Finite numbers in range: a malformed answer or stored value is never used (nor cached).
function validPos(lat, lon) {
  return typeof lat === 'number' && typeof lon === 'number' && isFinite(lat) && isFinite(lon) &&
    Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
}

function manualLocation(s, cb) {
  var name = (s.loc_name || '').trim();
  if (!name) { cb(wx.STATUS.NOT_FOUND); return; }
  var cache = lsGet(LS_GEOCODE, null);
  if (cache && cache.name === name) {
    if (validPos(cache.lat, cache.lon)) { cb(wx.STATUS.OK, cache.lat, cache.lon); return; }
    lsSet(LS_GEOCODE, null);   // malformed (stored by an older version): look it up again
  }
  get(wx.geocodeUrl(name, configLang(s)), 15000, function (st, json) {
    if (st !== wx.STATUS.OK) { cb(st); return; }
    var r = json && json.results && json.results[0];
    if (!r) { cb(wx.STATUS.NOT_FOUND); return; }
    if (!validPos(r.latitude, r.longitude)) { console.log('geocoding: bad coordinates'); cb(wx.STATUS.API); return; }
    lsSet(LS_GEOCODE, { name: name, lat: r.latitude, lon: r.longitude });
    cb(wx.STATUS.OK, r.latitude, r.longitude);
  });
}

function autoLocation(cb) {
  var last = lsGet(LS_LAST_POS, null);
  if (last && !validPos(last.lat, last.lon)) last = null;
  var done = false, timer = null;
  // Permission denied / GPS unavailable / no answer at all: the last known position, if any.
  function fallback() {
    if (done) return; done = true;
    if (timer) clearTimeout(timer);
    if (last) cb(wx.STATUS.OK, last.lat, last.lon); else cb(wx.STATUS.LOCATION);
  }
  if (!navigator.geolocation) { fallback(); return; }
  // Some phones never call back: without this the request (and `busy`) would never end.
  timer = setTimeout(function () { timer = null; console.log('location: no answer'); fallback(); }, 25000);
  try {
    navigator.geolocation.getCurrentPosition(function (pos) {
      var c = pos && pos.coords;
      if (!c || !validPos(c.latitude, c.longitude)) { console.log('location: bad coordinates'); fallback(); return; }
      if (done) return; done = true;
      clearTimeout(timer);
      var p = { lat: c.latitude, lon: c.longitude, t: Date.now() };
      lsSet(LS_LAST_POS, p);
      cb(wx.STATUS.OK, p.lat, p.lon);
    }, function (err) {
      console.log('location error ' + (err && err.code));
      fallback();
    }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 30 * 60 * 1000 });
  } catch (e) {
    console.log('location failed ' + e);
    fallback();
  }
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

// Settings that decide whether the watch asks for a forecast (visibility, schedule, tap mode,
// interval) and what it gets. Their version (cfg_id) goes with the settings to the watch, which
// echoes it in cmd 1: a request made with an older version is not served, whatever the order
// in which the request and the acknowledgement of the new settings arrive.
var REQUEST_KEYS = ['interval', 'wx_inside', 'wx_bars', 'tap_mode', 'sched_on', 'sched_start',
                    'sched_end', 'sched_days', 'sched_scope'];
function requestKey(s) {
  var d = settingsToWatch(s);
  return forecastKey(s) + '|' + REQUEST_KEYS.map(function (k) { return d[k]; }).join('|');
}
function cfgId() { var v = lsGet(LS_CFG_ID, 0); return typeof v === 'number' && isFinite(v) ? v : 0; }

// Whether the watch asked with the current settings. No cfg_id (a watch build without it): only
// when no settings are waiting for delivery.
function requestCurrent(payload) {
  if (payload.cfg_id === undefined || payload.cfg_id === null) return !lsGet(LS_PENDING, null);
  return Number(payload.cfg_id) === cfgId();
}

// A request made with older settings (they may hide the weather now, or want another
// forecast) is not served. The current settings go (again) with cmd 3, which lets the watch
// ask at once, with them, if it still shows the weather.
function staleRequest() {
  console.log('request with old settings: not served');
  var p = lsGet(LS_PENDING, null);
  if (!p) {
    // Delivered already, yet the watch has another version (its storage lost): resend once per
    // version, so a watch that cannot keep it does not start a message loop.
    if (resyncedId === cfgId()) return;
    resyncedId = cfgId();
  }
  lsSet(LS_PENDING, { invalidate: weatherNeeded(settings()) || !!(p && p.invalidate) });
  syncRetried = false;
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
        // A late event of a subscription already answered (or timed out) must not disable the
        // source for the next requests.
        if (done) return;
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
    if (st === wx.STATUS.OK && !validPos(lat, lon)) st = wx.STATUS.LOCATION;
    if (st !== wx.STATUS.OK) { console.log('location status ' + st); cb(st); return; }
    get(wx.forecastUrl(lat, lon, fahrenheit), 20000, function (st2, json) {
      if (st2 !== wx.STATUS.OK) { console.log('forecast status ' + st2); cb(st2); return; }
      try { cb(wx.STATUS.OK, wx.buildBlob(json, fahrenheit, Math.floor(Date.now() / 1000))); }
      catch (e) { console.log('parse error ' + e); cb(wx.STATUS.API); }
    });
  });
}

// Only ever started by the watch (cmd 1 with the current settings, see requestCurrent): it
// alone knows the forecast age, the "no weather" schedule and the wrist-tap mode.
function fetchWeather() {
  var s = settings();
  if (busy) { askedAgain = true; return; }
  if (!weatherNeeded(s)) return;
  busy = true;
  askedAgain = false;
  var id = cfgId();
  var fahrenheit = String(s.units) === '1';
  function alive() { return cfgId() === id; }   // no new version of the request settings
  // `busy` stays set until the result is sent or dropped, settings delivery included.
  function finish(st, blob) {
    if (!alive()) {
      // Settings changed meanwhile: drop this result (the watch would take it as fresh). Fetch
      // again only if the watch asked, with the new settings, while this one ran; otherwise it
      // asks after them (the save sent cmd 3) if it can show the weather.
      busy = false;
      console.log('settings changed during fetch');
      if (askedAgain && weatherNeeded(settings())) fetchWeather();
      return;
    }
    if (st === null) { busy = false; return; }
    if (st !== wx.STATUS.OK) { busy = false; sendStatus(st); return; }
    syncSettings(function (delivered) {
      if (delivered === false) {
        // The watch still has the old settings (other units, maybe): sending this forecast would
        // mix them. It stays pending; the watch asks again after its back-off.
        busy = false;
        console.log('settings not delivered: forecast held back');
        return;
      }
      if (!alive()) { finish(st, blob); return; }   // saved again while the settings were in flight
      busy = false;
      send({ wx: blob }, function (ok) { if (ok) lsSet(LS_LAST_OK, Date.now()); });
      console.log('forecast sent (' + blob.length + ' bytes)');
    });
  }
  function openMeteo() { fetchOpenMeteo(s, fahrenheit, alive, finish); }
  try {
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
  } catch (e) {
    // Never leave `busy` set by an unexpected error: no later request could start.
    console.log('fetch failed ' + e);
    if (busy) { busy = false; sendStatus(wx.STATUS.API); }
  }
}

// --- settings delivery ---
// Settings saved on the phone stay pending until the watch acknowledges them, so a Bluetooth
// failure cannot leave the two sides with different units or colours.
// cb(delivered): true / false, or null when nothing was pending.
var syncWaiters = null;   // callbacks waiting for the settings message in flight

function watchSettings() { var d = settingsToWatch(settings()); d.cfg_id = cfgId(); return d; }

function syncSettings(cb) {
  if (syncWaiters) { if (cb) syncWaiters.push(cb); return; }   // one message at a time
  var p = lsGet(LS_PENDING, null);
  if (!p) { if (cb) cb(null); return; }
  syncWaiters = cb ? [cb] : [];
  var d = watchSettings();
  var sentCfg = JSON.stringify(d);
  if (p.invalidate) d.cmd = CMD_INVALIDATE;
  send(d, function (ok) {
    var waiters = syncWaiters;
    syncWaiters = null;
    if (ok) {
      syncRetried = false;
      if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
      var now = lsGet(LS_PENDING, null);
      if (JSON.stringify(watchSettings()) === sentCfg && !(now && now.invalidate && !p.invalidate)) {
        lsSet(LS_PENDING, null);
      } else {
        syncSettings();   // saved again while this was in flight: deliver the newer version
      }
    } else if (!retryTimer && !syncRetried) {
      // One later attempt per failure streak (a failed retry does not schedule another); after
      // that, only the next watch message, settings save or JS start retries.
      syncRetried = true;
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
  // New version of the settings that decide the request: requests made before it (queued,
  // running or still on their way) are not served. A running one is dropped, so the watch gets
  // cmd 3 and asks again at once, with these settings, if it can show the weather.
  var changed = requestKey(old) !== requestKey(s);
  if (changed) { lsSet(LS_CFG_ID, cfgId() + 1); askedAgain = false; }
  var obsolete = weatherNeeded(s) && (forecastKey(old) !== forecastKey(s) || !weatherNeeded(old) ||
                                      (changed && busy));
  var prev = lsGet(LS_PENDING, null);
  lsSet(LS_PENDING, { invalidate: obsolete || !!(prev && prev.invalidate) });
  syncRetried = false;   // a new save gets its own timed retry
  syncSettings();
});

Pebble.addEventListener('appmessage', function (e) {
  var payload = e.payload || {};
  var ask = payload.cmd === CMD_FETCH;
  var current = ask && requestCurrent(payload);   // before the delivery below changes it
  if (ask && !current) staleRequest();
  syncSettings();   // the watch is reachable: deliver settings still pending
  if (current) fetchWeather();
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
