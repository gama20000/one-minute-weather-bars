#pragma once
#include <pebble.h>

typedef enum { L_PT = 0, L_EN = 1 } Lang;

// Resolve the active language (setting or watch locale; any "pt*" locale uses PT-PT strings).
Lang i18n_lang(void);
// Upper-case 3-letter weekday for the weather blocks (0 = Sunday).
const char *i18n_wday_block(int wday);
// Calendar weekday (One Minute Hand style, e.g. "Sáb" / "Sat").
const char *i18n_wday_cal(int wday);
const char *i18n_month(int mon);
const char *i18n_today(void);
char i18n_decimal_sep(void);
