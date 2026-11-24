// Converts the values saved by the configuration page into the AppMessage sent to the watch.
// Pure function: tested with Node in tools/test_weather.js.
var COLOR_KEYS = ['bg', 'hour', 'hand', 'hand_in', 'tick0', 'tick5', 'tick1', 'wday', 'mdate',
                  'wtext', 'tmax', 'tmin', 'pop', 'mm', 'icon'];

function settingsToWatch(s) {
  var d = {};
  ['theme', 'time_fmt', 'lang', 'units', 'interval', 'precip_mode'].forEach(function (k) {
    if (s[k] !== undefined) d[k] = parseInt(s[k], 10) || 0;
  });
  d.show_battery = s.show_battery ? 1 : 0;
  if (s.wx_inside !== undefined) d.wx_inside = s.wx_inside ? 1 : 0;
  if (s.wx_bars !== undefined) d.wx_bars = s.wx_bars ? 1 : 0;
  if (s.tap_mode !== undefined) d.tap_mode = parseInt(s.tap_mode, 10) || 0;
  if (s.sched_on !== undefined) d.sched_on = s.sched_on ? 1 : 0;
  if (s.sched_scope !== undefined) d.sched_scope = parseInt(s.sched_scope, 10) || 0;
  var hm = function (v) {                      // "HH:MM" -> minutes after midnight
    var m = /^(\d{1,2}):(\d{2})/.exec(String(v || ''));
    return m ? Math.min(23, +m[1]) * 60 + Math.min(59, +m[2]) : undefined;
  };
  if (hm(s.sched_start) !== undefined) d.sched_start = hm(s.sched_start);
  if (hm(s.sched_end) !== undefined) d.sched_end = hm(s.sched_end);
  if (hm(s.day_start) !== undefined) d.day_start = hm(s.day_start);
  if (hm(s.night_start) !== undefined) d.night_start = hm(s.night_start);
  ['day_refresh', 'night_refresh', 'peek_secs'].forEach(function (k) {
    if (s[k] !== undefined) d[k] = parseInt(s[k], 10) || 0;
  });
  ['rain_c0', 'rain_c5', 'rain_c10', 'rain_c20'].forEach(function (k) {
    var v = s[k];
    if (v !== undefined && v !== null && v !== '') d[k] = typeof v === 'number' ? v : parseInt(v, 16);
  });
  if (Array.isArray(s.sched_days)) {          // page order Mon..Sun -> watch bit 0 = Sunday
    d.sched_days = s.sched_days.reduce(function (mask, on, i) { return on ? mask | (1 << ((i + 1) % 7)) : mask; }, 0);
  }
  COLOR_KEYS.forEach(function (k) {
    var v = s['color_' + k];
    if (v !== undefined && v !== null && v !== '') d['color_' + k] = typeof v === 'number' ? v : parseInt(v, 16);
  });
  return d;
}

module.exports = settingsToWatch;
