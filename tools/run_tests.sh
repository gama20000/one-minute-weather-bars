#!/bin/sh
# Runs every check that does not need the Pebble SDK: JS unit tests, C logic tests,
# and the exhaustive overlap test of the real drawing code. Needs node, gcc, python3
# with pillow numpy scipy freetype-py.
set -e
cd "$(dirname "$0")"
node test_weather.js
node test_flow.js
sh build_host.sh
gcc -std=c11 -D_DEFAULT_SOURCE -DHOSTDIR="\"$PWD/host\"" -Wall -Wno-unused-parameter -Ihost -include host/pebble.h \
  -o host/test_logic host/test_logic.c ../src/c/weather.c ../src/c/settings.c -lm
./host/test_logic
python3 check_c.py
