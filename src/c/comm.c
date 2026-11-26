#include "comm.h"
#include "settings.h"
#include "weather.h"

#define CMD_FETCH 1
#define CMD_READY 2        // phone -> watch: PebbleKit JS started
#define CMD_INVALIDATE 3   // phone -> watch, with settings: cached forecast is obsolete
#define PERSIST_CFG_ID 7   // 1-6 are used by settings.c, weather.c and main.c

static CommChangedCallback s_on_change;
static CommReadyCallback s_on_ready;
// Version of the phone settings this watch has (sent with them), echoed in each forecast
// request: the phone serves only requests made with its current settings. Persisted, so a
// restart does not make the first request look old.
static int32_t s_cfg_id;

static void prv_inbox(DictionaryIterator *it, void *ctx) {
  bool wx = false, cfg = false;
  Tuple *t = dict_find(it, MESSAGE_KEY_cmd);
  uint8_t cmd = t ? t->value->uint8 : 0;
  if (cmd == CMD_INVALIDATE) weather_invalidate();   // before the settings: they re-check it
  t = dict_find(it, MESSAGE_KEY_cfg_id);             // before the request the settings may cause
  if (t && (t->type == TUPLE_INT || t->type == TUPLE_UINT)) {
    int32_t v = t->length == 1 ? (int32_t)t->value->uint8
              : t->length == 2 ? (int32_t)t->value->uint16 : t->value->int32;
    if (v != s_cfg_id) { s_cfg_id = v; persist_write_int(PERSIST_CFG_ID, v); }
  }
  t = dict_find(it, MESSAGE_KEY_wx);
  if (t && t->type == TUPLE_BYTE_ARRAY) {
    wx |= weather_set_blob(t->value->data, t->length);
  }
  t = dict_find(it, MESSAGE_KEY_status);
  // A status only shows on the dial while there is no forecast at all.
  if (t && weather_set_status(t->value->uint8) && !weather_get()->valid) wx = true;
  if (settings_apply_message(it)) {
    settings_save();
    cfg = true;
  }
  if ((wx || cfg) && s_on_change) s_on_change(cfg);   // settings change also re-checks the fetch
  if ((cmd == CMD_READY || (cmd == CMD_INVALIDATE && !cfg)) && s_on_ready) s_on_ready();
}

static void prv_dropped(AppMessageResult reason, void *ctx) {
  APP_LOG(APP_LOG_LEVEL_WARNING, "inbox dropped %d", (int)reason);
}

static void prv_outbox_failed(DictionaryIterator *it, AppMessageResult reason, void *ctx) {
  // Phone JS not ready yet (e.g. right after start-up) or link down: see the back-off rules.
  weather_request_failed();
}

void comm_init(CommChangedCallback cb, CommReadyCallback ready) {
  s_on_change = cb;
  s_on_ready = ready;
  s_cfg_id = persist_exists(PERSIST_CFG_ID) ? persist_read_int(PERSIST_CFG_ID) : 0;
  app_message_register_inbox_received(prv_inbox);
  app_message_register_outbox_failed(prv_outbox_failed);
  app_message_register_inbox_dropped(prv_dropped);
  // The forecast blob is < 256 bytes; settings < 300 bytes.
  app_message_open(512, 64);
}

bool comm_request_weather(void) {
  DictionaryIterator *out;
  if (app_message_outbox_begin(&out) != APP_MSG_OK) return false;
  dict_write_uint8(out, MESSAGE_KEY_cmd, CMD_FETCH);
  dict_write_int32(out, MESSAGE_KEY_cfg_id, s_cfg_id);
  return app_message_outbox_send() == APP_MSG_OK;
}
