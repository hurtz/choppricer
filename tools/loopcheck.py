#!/usr/bin/env python3
"""Does it loop? The check round 1 was killed on and never actually ran.

"Nothing perfectly looped" is the one rule in AUDIO_BRIEF.md that a listener
enforces for free: a seam you can hear destroys the illusion instantly and
permanently, and it is exactly the failure mode of a bed built out of finite
noise buffers. So this measures it instead of asserting it.

Method: 24 log-spaced band energies every 20 ms, normalised per frame (so this
measures TIMBRE OVER TIME and not level), then the normalised autocorrelation of
that feature sequence at every lag from 0.5 s to half the clip.

  A genuine loop of period P spikes at P and at 2P, 3P… and the spike is
  narrow and tall — often 0.9+ against a background of 0.3-0.5.
  A bed with no period has no spike: its top lag is barely above the median and
  the peak wanders if you re-record.

Reported: the best lag, its r, the median r, and the RATIO between them, which
is the number that matters because the absolute r depends on how stationary the
material is. Anything under about 1.25 is "no audible loop".

Also checks the specific periods that COULD loop — the buffer lengths the build
uses — because a seam at a known period is the failure and a coincidental peak
at 13.4 s is not.

  python3 tools/loopcheck.py audio/r2_bed_45s.wav 9.1 7.3 3.7 5.0 21.3
"""
import sys, wave, math, numpy as np


def load(p):
    with wave.open(p, 'rb') as w:
        sr = w.getframerate(); ch = w.getnchannels()
        a = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(float) / 32768
    return a.reshape(-1, ch).mean(1), sr


path = sys.argv[1]
cands = [float(x) for x in sys.argv[2:]]
m, sr = load(path)
dur = len(m) / sr

n, H = 2048, int(sr * 0.02)
edges = np.logspace(math.log10(40), math.log10(min(16000, sr / 2 - 100)), 25)
f = np.fft.rfftfreq(n, 1 / sr)
idx = [np.where((f >= edges[i]) & (f < edges[i + 1]))[0] for i in range(24)]
win = np.hanning(n)

F = []
for s in range(0, len(m) - n, H):
    P = np.abs(np.fft.rfft(m[s:s + n] * win)) ** 2
    v = np.array([P[i].sum() for i in idx]) + 1e-14
    v = np.log(v)
    v -= v.mean()                       # per-frame: timbre, not level
    F.append(v)
F = np.array(F)
F -= F.mean(0)                          # per-band: change, not average colour
F /= (F.std(0) + 1e-12)
fps = sr / H

# Lags under 1.5 s are the material's own slow variation correlating with
# itself, not a loop; including them just reports "audio is continuous".
lags = range(int(fps * 1.5), int(len(F) * 0.5))
r = np.zeros(len(F))
for L in lags:
    a, b = F[:-L], F[L:]
    r[L] = float((a * b).sum() / (math.sqrt((a * a).sum() * (b * b).sum()) + 1e-12))

vals = r[list(lags)]
# The baseline is the SPREAD of the correlations, not their median: on
# non-stationary material the median sits near zero and any ratio against it is
# meaningless (a first pass here reported "13.56x median -> LOOPS" on r=0.255,
# because the median was -0.019). A loop is a peak that stands out from the
# distribution, so measure it in standard deviations.
mu, sd = float(vals.mean()), float(vals.std() + 1e-9)
best = int(np.argmax(r))
z = (r[best] - mu) / sd
print(f"\n{path}   {dur:.1f}s   {len(F)} frames @ {fps:.0f}/s")
print(f"  strongest lag   {best/fps:6.2f}s   r={r[best]:.3f}")
print(f"  background      mean {mu:+.3f}  sd {sd:.3f}")
verdict = "NO AUDIBLE LOOP" if (z < 5 or r[best] < 0.25) else ("suspicious" if z < 9 else "LOOPS")
print(f"  peak            {z:.1f} sd above background   -> {verdict}")
if cands:
    print("  candidate periods (the buffer lengths that COULD seam):")
    for c in cands:
        L = int(c * fps)
        if L >= len(r) or L < 1:
            print(f"    {c:6.2f}s   (longer than half the clip — not testable here)")
            continue
        w2 = max(1, int(fps * 0.06))
        loc = r[max(0, L - w2):L + w2]
        print(f"    {c:6.2f}s   r={loc.max():+.3f}   {((loc.max()-mu)/sd):+5.1f} sd")
