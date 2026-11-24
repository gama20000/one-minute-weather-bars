#include "i18n.h"
#include "settings.h"

// PT-PT and EN only. UTF-8 literals (Gothic fonts include Latin-1 accents).
static const char *const WDAY_BLOCK[2][7] = {
  { "DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB" },
  { "SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT" },
};
static const char *const WDAY_CAL[2][7] = {
  { "Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb" },
  { "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat" },
};
static const char *const MONTH[2][12] = {
  { "Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez" },
  { "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec" },
};

Lang i18n_lang(void) {
  if (g_settings.lang == LANG_PT) return L_PT;
  if (g_settings.lang == LANG_EN) return L_EN;
  const char *loc = i18n_get_system_locale();
  if (loc && loc[0] == 'p' && loc[1] == 't') return L_PT;
  return L_EN;
}

const char *i18n_wday_block(int w) { return WDAY_BLOCK[i18n_lang()][((w % 7) + 7) % 7]; }
const char *i18n_wday_cal(int w) { return WDAY_CAL[i18n_lang()][((w % 7) + 7) % 7]; }
const char *i18n_month(int m) { return MONTH[i18n_lang()][((m % 12) + 12) % 12]; }
const char *i18n_today(void) { return i18n_lang() == L_PT ? "HOJE" : "TODAY"; }
char i18n_decimal_sep(void) { return i18n_lang() == L_PT ? ',' : '.'; }
