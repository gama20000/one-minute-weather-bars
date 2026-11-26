# Changelog

All notable changes to One Minute Weather Bars (Pebble Time 2 / emery).

## 1.1.1 (2026-11-27)

### Fixes
- Settings saved while a forecast download was in progress could be ignored. The forecast now waits for the newer settings to reach the watch before being served.
- A weather error status could be sent to the watch while a settings delivery was still in flight, overwriting the settings. The error now goes through the same delivery queue.
- Parsing non-numeric temperature or precipitation values from the weather source (e.g. `null`, empty strings) could produce `NaN` on the display. The parser now rejects anything that is not a finite number.
- Rescheduling the minute-update timer on the watch could fail silently when `app_timer_reschedule` was not available, causing the display to stop updating. The timer is now cancelled and recreated when reschedule is unavailable.
- Forecast bar borders were invisible on gray or mid-tone theme backgrounds. The border colour now adapts to maintain contrast against the background.

## 1.1.0 (2026-11-26)

Requires the Pebble mobile app 2.0 or later for the built-in weather source; older apps use Open-Meteo automatically.

### New
- **Weather from the Pebble app.** The forecast now comes from the weather the Pebble mobile app (2.0+) already keeps. The phone makes no GPS fix and no download of its own, which saves battery on the phone as well. Open-Meteo is still available in the settings, and the watchface switches to it automatically when the Pebble app's weather is not available.
- **Calendar centred on the dial.** The weekday and the day of the month now sit on the dial's corner diagonals, mirroring each other. The day number is also centred between the ring and the screen edges.

### Battery and data
- Saving the settings no longer downloads anything. The watch asks for a new forecast only when the weather can actually be shown (scheduled "no weather" window, wrist-tap mode).
- A forecast request made before a settings change is no longer served after it. For example, turning on the "no weather" schedule while a request is running no longer leads to a location fix or a download.
- When the connection to the phone keeps failing, the watch waits longer and longer between attempts instead of retrying every few minutes.
- Settings that fail to reach the watch are retried once after a minute, then whenever the watch is reachable again, instead of every minute.
- Expired forecast data from the Pebble app no longer causes a new request every 5 minutes.
- A forecast or status identical to the stored one is not written to flash again.
- The phone only signals the watch on start-up when the forecast is actually due.
- The dial also wakes at the start and end of the "no weather" window, so the change shows on time even with the slower night refresh.
- Turning off the wrist-tap peek mode also cancels a pending peek timer, so there is no stray wake-up.

### Fixes
- A forecast in the wrong units could be shown after switching between °C and °F, if the settings did not reach the watch or changed while a forecast was being fetched.
- Settings changed on the phone could be lost when Bluetooth failed. They are now kept until the watch confirms them, and always delivered before the next forecast.
- After the units, place or forecast source changed, restarting the watchface could keep showing the old forecast as if it were current.
- The "rain still expected today" amount could lag by up to 30 minutes in time zones with a half-hour offset (for example UTC+05:30).
- With the wrist-tap toggle mode, turning the mode off and on again could bring back the alternative view after a restart.
- A late error from the Pebble app's weather could switch the watchface to Open-Meteo (and the phone's GPS) for the rest of the session.
- On phones that never answer a location request, a forecast request could stay stuck forever. It now falls back to the last known position after 25 seconds.
- Invalid coordinates from the phone or from the place search are ignored instead of being used or cached.
- Opening the settings page repeatedly used more and more memory on the phone.

## 1.0.0 (2026-11-24)
- First release.
