#pragma once
// Geometry validated by tools/mockup (exhaustive overlap check: 60 minutes x 24 hours,
// PT/EN, C/F, negative and 3-digit temperatures, missing data). Change only together
// with the mockup and re-run tools/check.py.

#define SCREEN_W 200
#define SCREEN_H 228

#define DIAL_CX 100
#define DIAL_CY 102
#define DIAL_R  100

// Tick marks: width, length (px)
#define TICK0_W 5
#define TICK0_L 13
#define TICK15_W 5
#define TICK15_L 10
#define TICK5_W 3
#define TICK5_L 9
#define TICK1_W 1
#define TICK1_L 5
#define POINTED_TICK_PCT 40   // length of the mark the hand points at (% of normal, min 2 px)

// Hour digits (Lato Bold 32, tabular figures 19 px wide, ink rows 8..32)
#include "hour_gen.h"   // Lato sizes and measured metrics (tools/gen_hour.py)
#define HOUR_CLEARANCE 5      // gap between hour box and pivot (4 px touches the hand at :00)

// Minute hand (kite, One Minute Hand shape)
#define HAND_LEN 40
#define HAND_W   10
#define HAND_BASE_R 3

// Weather blocks
#define TOP_BLOCK_Y 17
#define SMALL_BLOCK_W 40       // 6-day mode, Gothic 14 bold

// Rain strip under the dial (6 columns of SCREEN_W/6)
#define BAR_BOTTOM 227
#define BAR_H 11
#define BAR_INSET 4
#define BAR_LABEL_Y 199     // Gothic 14 text origin (ink 204..213)

#define ICON_W 14
#define ICON_INK_W 13      // icons use columns 0..13; label gap 1 px
