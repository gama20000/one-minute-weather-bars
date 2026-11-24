#!/bin/sh
# Build the host test harness (runs the real watch drawing code on a PC).
cd "$(dirname "$0")/host" && gcc -std=c11 -DHOSTDIR="\"$PWD\"" -D_DEFAULT_SOURCE -Wall -Wextra -Wno-unused-parameter -I. -include pebble.h \
  -o host host.c ../../src/c/settings.c ../../src/c/weather.c ../../src/c/draw.c \
  ../../src/c/clock_render.c ../../src/c/weather_render.c ../../src/c/i18n.c -lm
