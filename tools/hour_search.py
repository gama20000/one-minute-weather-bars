"""Finds the largest safe Lato size for the hour digits, with and without the forecast inside
the dial, by running the real C placement code for every minute x every hour (24h and 12h)
against everything else on the dial (1 px clearance). Usage: python3 tools/hour_search.py"""
import itertools, os, subprocess, sys
import numpy as np
from scipy.ndimage import binary_dilation
HERE = os.path.dirname(os.path.abspath(__file__))

def g(m): return binary_dilation(m, iterations=1)

def rebuild(s, l):
    subprocess.run([sys.executable, os.path.join(HERE, 'gen_hour.py'), str(s), str(l)], check=True, capture_output=True)
    subprocess.run(['sh', os.path.join(HERE, 'build_host.sh')], check=True)
    import importlib, replay; importlib.reload(replay)
    return replay

def statics(replay):
    def mask(log): return np.array(replay.replay(log, bg=False).convert('L')) > 0
    rh = replay.run_host
    ticks = mask(rh('t', 0, 0)); inside = np.zeros_like(ticks); bars = np.zeros_like(ticks); cal = np.zeros_like(ticks)
    for lang, blob, wd in itertools.product((1, 2), ('normal', 'extreme', 'live', None), range(7)):
        inside |= mask(rh('w', 12, 0, wday=wd, lang=lang, blob=blob)); bars |= mask(rh('b', 12, 0, wday=wd, lang=lang, blob=blob))
    for lang, wd, md in itertools.product((1, 2), range(7), range(1, 32)):
        cal |= mask(rh('c', 0, 0, wday=wd, mday=md, lang=lang))
    status = mask(rh('sb', 0, 0, blob=None)) | mask(rh('s', 0, 0, blob=None))
    return mask, ticks, inside, bars, cal, status

def ok(replay, mask, static, flag):
    rh = replay.run_host
    for m in range(60):
        hand = g(mask(rh('n', 0, m)))
        for tf, h in [(2, h) for h in range(24)] + [(1, h) for h in (1, 10, 11, 12)]:
            hr = mask(rh(flag, h, m, time_fmt=tf))
            if (hr & (static | hand)).any(): return False, (m, h, tf)
    return True, None

def main():
    best_s = best_l = 32
    for s in range(33, 46):
        replay = rebuild(s, 32); mask, ticks, inside, bars, cal, status = statics(replay)
        good, why = ok(replay, mask, g(ticks | inside | bars | cal | status), 'h')
        print('with weather', s, 'OK' if good else 'collides %s' % (why,)); sys.stdout.flush()
        if not good: break
        best_s = s
    for l in range(36, 80, 2):
        replay = rebuild(best_s, l); mask, ticks, inside, bars, cal, status = statics(replay)
        good, why = ok(replay, mask, g(ticks | bars | cal | status), 'H')   # no forecast inside
        print('without weather', l, 'OK' if good else 'collides %s' % (why,)); sys.stdout.flush()
        if not good: break
        best_l = l
    print('BEST', best_s, best_l)

if __name__ == '__main__':
    main()
