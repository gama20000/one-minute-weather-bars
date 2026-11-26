#pragma once
#include <pebble.h>

// settings_changed: new configuration; otherwise only the forecast / visible status changed.
// The ready callback runs when PebbleKit JS has just started and can take a forecast request.
typedef void (*CommChangedCallback)(bool settings_changed);
typedef void (*CommReadyCallback)(void);

void comm_init(CommChangedCallback on_change, CommReadyCallback on_ready);
// Ask the phone for a fresh forecast. Returns true if the message was queued.
bool comm_request_weather(void);
