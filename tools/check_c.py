"""Exhaustive overlap test of the fork's REAL C code (via tools/host): every minute x every
hour (24h + 12h), PT/EN, all weekdays and days of month (curved calendar), forecast
normal / extreme / missing, rain strip and status icons. 1 px clearance required."""
import sys, itertools
import numpy as np
from scipy.ndimage import binary_dilation
from replay import run_host, replay

def mask(log, grow=0):
    m = np.array(replay(log, bg=False).convert('L')) > 0
    return binary_dilation(m, iterations=grow) if grow else m

def g(m): return binary_dilation(m, iterations=1)

def main():
    issues = []
    ticks = mask(run_host('t', 0, 0))
    inside = np.zeros_like(ticks); bars = np.zeros_like(ticks)
    for lang, blob, wd in itertools.product((1, 2), ('normal', 'extreme', 'live', None), range(7)):
        w = mask(run_host('w', 12, 0, wday=wd, lang=lang, blob=blob))
        b = mask(run_host('b', 12, 0, wday=wd, lang=lang, blob=blob))
        inside |= w; bars |= b
    cal = np.zeros_like(ticks)
    for lang, wd, md in itertools.product((1, 2), range(7), range(1, 32)):
        cal |= mask(run_host('c', 0, 0, wday=wd, mday=md, lang=lang))
    status_n = mask(run_host('s', 0, 0))
    status_b = mask(run_host('sb', 0, 0, blob=None)) & ~mask(run_host('b', 0, 0, blob=None))
    pairs = [('inside', inside), ('bars', bars), ('cal', cal), ('ticks', ticks),
             ('status+bars', status_b), ('status', status_n)]
    skip = {('bars', 'status+bars'), ('status+bars', 'status'), ('inside', 'status')}
    for (na, a), (nb, b) in itertools.combinations(pairs, 2):
        if (na, nb) in skip or (nb, na) in skip: continue
        if {na, nb} == {'status', 'bars'}: continue   # status-without-strip never coexists with the strip
        n = int((a & g(b)).sum())
        if n: issues.append(('static', na, nb, n))
    static = g(inside | bars | cal | ticks | status_b | status_n)
    for m in range(60):
        hand = mask(run_host('n', 0, m))
        if (hand & static).any(): issues.append(('hand', m, int((hand & static).sum())))
        for tf, h in [(2, h) for h in range(24)] + [(1, h) for h in (0, 1, 10, 11, 12, 13, 22, 23)]:
            hr = mask(run_host('h', h, m, time_fmt=tf))
            if (hr & (static | g(hand))).any(): issues.append(('hour', m, h, tf))
    print('checked; issues:', len(issues))
    for i in issues[:40]: print('  ', i)
    return 1 if issues else 0

if __name__ == '__main__':
    sys.exit(main())
