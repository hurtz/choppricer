#!/usr/bin/env python3
"""Is there a TUNE in here? builder-audio's ear substitute.

audioprobe.py measures whether a clip sounds like a building. This measures
whether it sounds like music, which is a completely different question and the
one the client asked. Three readouts:

  ROLL      a per-frame piano roll of the strongest partial in the melody band,
            printed as note names. A tune shows as held notes and stepwise
            motion; a random walk shows as confetti.
  BASS      the same for the bass band, which is where the harmony's root is.
  PULSE     the onset envelope's autocorrelation -> tempo, and how strong the
            beat is. A groove peaks hard at the beat period; a pad does not.
  REPEAT    self-similarity of the chroma over the clip. A tune with a form in
            it lights up at the phrase length; a generator never repeats and
            reads flat.

  python3 tools/tune.py audio/r2_solo_music.wav
"""
import sys, wave, math, numpy as np

NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']


def load(p):
    with wave.open(p, 'rb') as w:
        sr = w.getframerate()
        a = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(float) / 32768
    ch = w.getnchannels() if False else 2
    return a.reshape(-1, ch).mean(1), sr


def note_of(f):
    if f <= 0:
        return None
    m = 69 + 12 * math.log2(f / 440.0)
    return int(round(m))


def track(m, sr, lo, hi, hop=0.08):
    n = 1 << 13
    H = int(sr * hop)
    out = []
    win = np.hanning(n)
    for s in range(0, len(m) - n, H):
        seg = m[s:s + n] * win
        P = np.abs(np.fft.rfft(seg))
        f = np.fft.rfftfreq(n, 1 / sr)
        band = (f >= lo) & (f < hi)
        if not band.any():
            out.append(None); continue
        Pb = P.copy(); Pb[~band] = 0
        i = int(np.argmax(Pb))
        # parabolic interpolation for a real frequency, not a bin
        if 0 < i < len(Pb) - 1 and Pb[i] > 0:
            a0, b0, c0 = Pb[i - 1], Pb[i], Pb[i + 1]
            d = 0.5 * (a0 - c0) / (a0 - 2 * b0 + c0 + 1e-12)
        else:
            d = 0
        fr = (i + d) * sr / n
        amp = float(Pb[i])
        out.append((fr, amp))
    return out


for p in sys.argv[1:]:
    m, sr = load(p)
    print(f"\n{p}  {len(m)/sr:.1f}s")

    for label, lo, hi in [('ROLL', 320, 1400), ('BASS', 70, 320)]:
        tr = track(m, sr, lo, hi)
        amps = np.array([x[1] if x else 0 for x in tr])
        thr = np.percentile(amps[amps > 0], 45) if (amps > 0).any() else 0
        line, held, last = [], 0, None
        for x in tr:
            if not x or x[1] < thr:
                line.append(' . '); last = None; continue
            mm = note_of(x[0])
            nm = NAMES[mm % 12] + str(mm // 12 - 1)
            if mm == last:
                line.append(' - '); held += 1
            else:
                line.append(f"{nm:>3}"[:3]); last = mm
        s = ''.join(line)
        print(f"  {label} ({lo}-{hi}Hz)  held {held*100//max(1,len(tr))}% of frames")
        for i in range(0, len(s), 120):
            print('    ' + s[i:i + 120])

    # ---- PULSE
    n = 1024
    H = 256
    S = []
    for s in range(0, len(m) - n, H):
        S.append(np.abs(np.fft.rfft(m[s:s + n] * np.hanning(n))))
    S = np.array(S)
    flux = np.maximum(0, np.diff(S, axis=0)).sum(1)
    flux -= flux.mean()
    ac = np.correlate(flux, flux, 'full')[len(flux) - 1:]
    ac /= ac[0] + 1e-12
    fps = sr / H
    lo_l, hi_l = int(fps * 0.28), int(fps * 1.2)          # 50-215 bpm
    k = lo_l + int(np.argmax(ac[lo_l:hi_l]))
    print(f"  PULSE   beat {60*fps/k:6.1f} bpm   strength {ac[k]:.3f}"
          f"   (>0.15 = you can tap your foot to it)")

    # ---- REPEAT: chroma self-similarity at phrase lengths
    n = 1 << 14
    H = int(sr * 0.25)
    ch = []
    f = np.fft.rfftfreq(n, 1 / sr)
    pc = np.array([note_of(x) % 12 if x > 40 else -1 for x in f])
    for s in range(0, len(m) - n, H):
        P = np.abs(np.fft.rfft(m[s:s + n] * np.hanning(n))) ** 2
        v = np.array([P[(pc == i) & (f > 80) & (f < 2000)].sum() for i in range(12)])
        ch.append(v / (v.sum() + 1e-12))
    ch = np.array(ch)
    if len(ch) > 12:
        best, bl = 0, 0
        for lag in range(4, len(ch) // 2):
            a = ch[:-lag]; b = ch[lag:]
            r = float((a * b).sum() / (math.sqrt((a * a).sum() * (b * b).sum()) + 1e-12))
            if r > best:
                best, bl = r, lag
        base = float((ch[:-1] * ch[1:]).sum() / (math.sqrt((ch[:-1]**2).sum() * (ch[1:]**2).sum()) + 1e-12))
        print(f"  REPEAT  strongest at {bl*0.25:5.2f}s  r={best:.3f}   "
              f"(adjacent-frame r={base:.3f}; a form shows as a peak well above it)")
