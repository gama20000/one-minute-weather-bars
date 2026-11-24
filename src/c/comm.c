#include "comm.h"
#include "settings.h"
#include "weather.h"

#define CMD_FETCH 1

static CommChangedCallback s_on_change;

static void prv_inbox(DictionaryIterator *it, void *ctx) {
  bool changed = false;
  Tuple *t = dict_find(it, MESSAGE_KEY_wx);
  if (t && t->type == TUPLE_BYTE_ARRAY) {
    changed |= weather_set_blob(t->value->data, t->length);
  }
  t = dict_find(it, MESSAGE_KEY_status);
  if (t) {
    weather_set_status(t->value->uint8);
    changed = true;
  }
  if (settings_apply_message(it)) {
    settings_save();
    changed = true;
  }
  if (changed && s_on_change) s_on_change();
}

static void prv_dropped(AppMessageResult reason, void *ctx) {
  APP_LOG(APP_LOG_LEVEL_WARNING, "inbox dropped %d", (int)reason);
}

static void prv_outbox_failed(DictionaryIterator *it, AppMessageResult reason, void *ctx) {
  // Phone JS not ready yet (e.g. right after start-up): allow a retry on the next minute.
  weather_request_failed();
}

void comm_init(CommChangedCallback cb) {
  s_on_change = cb;
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
  return app_message_outbox_send() == APP_MSG_OK;
}
