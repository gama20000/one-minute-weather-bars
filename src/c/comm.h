#pragma once
#include <pebble.h>

typedef void (*CommChangedCallback)(void);

void comm_init(CommChangedCallback on_change);
// Ask the phone for a fresh forecast. Returns true if the message was queued.
bool comm_request_weather(void);
