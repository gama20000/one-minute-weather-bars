# Publicação na loja Pebble (rePebble / Rebble)

Portal: https://dev-portal.rebble.io (login com a conta Rebble). Escolher "Add a Watchface".

## Ficheiros
- `.pbw`: `one-minute-weather-bars.pbw` (versão 1.0.0, plataforma emery)
- Capturas de ecrã: PNG 200x228 (emery), máx. 5, sem moldura, só capturas reais da watchface
- Banner (opcional): 720x320

## Texto da listagem (EN)
One Minute Weather Bars is a one-handed watchface for Pebble Time 2: a full 60-tick dial, a short kite-shaped minute hand and a big digital hour on the opposite side. Six-day forecast (from the Pebble app, or Open-Meteo with no account needed) inside the dial, plus Dataload-style rain bars along the bottom: bar height is rain probability, the number is expected rain in whole mm.

Settings in the Pebble app: themes (colourful, classic, mono, high contrast, custom), rain colour scale, show weather inside the dial and/or as bars, hide weather on a schedule (e.g. working hours), wrist-tap to toggle or peek (duration configurable), power-saving refresh for day and night, units, language (PT/EN), location (automatic or by name).

Needs location and internet permissions (via the phone) to fetch the forecast. Works from cache when offline.

## Texto da listagem (PT)
Watchface de um só ponteiro para o Pebble Time 2: mostrador com 60 marcas, ponteiro de minutos curto e hora digital grande do lado oposto. Previsão a 6 dias (da app Pebble, ou da Open-Meteo sem conta) dentro do círculo e barras de chuva ao estilo Dataload em baixo: altura = probabilidade, número = mm previstos (inteiros).

Definições na app Pebble: temas, escala de cores da chuva, meteorologia dentro do círculo e/ou em barras, horário para esconder a meteorologia, toque no pulso (alternar ou espreitar, com duração), poupança de energia, unidades, idioma e localização.

## Notas de versão 1.0.0
First release.

## Antes de publicar
- Testar no Pebble Time 2 real (legibilidade, toque no pulso, página de definições na app).
- Uma vez pública, a app não pode voltar a privada: usar "Publish Privately" ou "Unlisted" primeiro.
- Campo "source code URL": usar o repositório Forgejo, se for acessível publicamente.
