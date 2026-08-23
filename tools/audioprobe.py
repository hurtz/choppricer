#!/usr/bin/env python3
"""Measure a game audio clip against the acoustic signature of a real supermarket.

A PROXY, like tools/edgedensity.py — and that one decoupled from the bar it was
proxying for, so treat these numbers as a smoke test, never as the goal. The ear
is the bar.

  python3 tools/audioprobe.py audio/floor.wav
"""
import sys, wave, math, numpy as np

TARGETS = {
    "mains_hum_db":   (6, 40, "120Hz ballast hum, dB ABOVE the local noise floor"),
    "lf_rumble_frac": (0.18, 0.55, "energy below 200Hz (HVAC + compressors)"),
    "hf_air_frac":    (0.02, 0.20, "energy above 5kHz (cart rattle, till beeps)"),
    "flatness":       (0.10, 0.62, "spectral flatness — noisy, not tonal"),
    "crest_db":       (6.0, 20.0,  "peak-to-RMS; events over a bed, not a wall"),
    "mod_depth":      (0.04, 0.45, "slow amplitude movement, not a static loop"),
    "stereo_width":   (0.05, 0.95, "spatial spread"),
}

def load(path):
    with wave.open(path, "rb") as w:
        n, ch, sw, sr = w.getnframes(), w.getnchannels(), w.getsampwidth(), w.getframerate()
        raw = w.readframes(n)
    dt = {1: np.int8, 2: np.int16, 4: np.int32}[sw]
    a = np.frombuffer(raw, dtype=dt).astype(np.float64)
    a /= float(np.iinfo(dt).max)
    if ch > 1: a = a.reshape(-1, ch)
    else: a = a.reshape(-1, 1)
    return a, sr

def measure(path):
    a, sr = load(path)
    mono = a.mean(axis=1)
    if mono.size < sr: return None
    win = np.hanning(min(65536, mono.size))
    seg = mono[:win.size] * win
    spec = np.abs(np.fft.rfft(seg)) + 1e-12
    freq = np.fft.rfftfreq(win.size, 1 / sr)
    p = spec ** 2
    tot = p.sum()

    def band(lo, hi): return p[(freq >= lo) & (freq < hi)].sum()
    hum_i = np.argmin(np.abs(freq - 120.0))
    lo, hi = max(0, hum_i - 40), hum_i + 40
    local = np.median(spec[lo:hi])
    # Band-limit flatness to the AUDIBLE range. At 48kHz an rfft puts 8192 of 32769
    # bins above 18kHz — a quarter of the measurement in a band nobody can hear — and
    # flatness is a geometric mean, so it is dominated by whatever is quietest. The
    # same file reads 0.032 counting to 24kHz and 0.110 stopping at 16kHz. Measuring
    # the ultrasonic hole was my bug, not the audio's.
    aud = (freq >= 20) & (freq <= 16000)
    pa = p[aud]
    out = {
        "mains_hum_db":   20 * math.log10(spec[hum_i] / (local + 1e-12) + 1e-12),
        "lf_rumble_frac": band(20, 200) / tot,
        "hf_air_frac":    band(5000, sr / 2) / tot,
        "flatness":       float(np.exp(np.mean(np.log(pa))) / np.mean(pa)),
        "crest_db":       20 * math.log10((np.abs(mono).max() + 1e-12) / (np.sqrt((mono ** 2).mean()) + 1e-12)),
    }
    hop = sr // 10
    env = np.array([np.sqrt((mono[i:i + hop] ** 2).mean()) for i in range(0, mono.size - hop, hop)])
    out["mod_depth"] = float(env.std() / (env.mean() + 1e-12)) if env.size > 4 else 0.0
    if a.shape[1] >= 2:
        l, r = a[:, 0], a[:, 1]
        d = np.sqrt(((l - r) ** 2).mean()); s = np.sqrt(((l + r) ** 2).mean()) + 1e-12
        out["stereo_width"] = float(d / s)
    else:
        out["stereo_width"] = 0.0
    out["seconds"] = mono.size / sr
    return out

for path in [a for a in sys.argv[1:] if not a.startswith("--")]:
    m = measure(path)
    print(f"\n{path}")
    if not m:
        print("  too short / unreadable"); continue
    print(f"  {m['seconds']:.1f}s")
    for k, (lo, hi, why) in TARGETS.items():
        v = m[k]
        ok = "ok  " if lo <= v <= hi else "MISS"
        print(f"  {ok} {k:16} {v:8.3f}   want {lo}-{hi}   {why}")
