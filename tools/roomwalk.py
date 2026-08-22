#!/usr/bin/env python3
"""Show the room CHANGING as the player walks. builder-audio's evidence that an
aisle and the front end are not the same place.

Per 1-second window: energy below 200 Hz, energy above 5 kHz, spectral centroid,
and stereo width. Walking out of an aisle mouth should move all four."""
import sys, wave, math, numpy as np
p = sys.argv[1]
with wave.open(p,'rb') as w:
    sr=w.getframerate(); a=np.frombuffer(w.readframes(w.getnframes()),dtype=np.int16).astype(float)/32768
a=a.reshape(-1,2); m=a.mean(1)
n=int(sr*1.0)
print(f"{p}\n  t     rms    <200Hz   >5kHz  centroid  width")
for s in range(0, len(m)-n, n//2):
    seg=m[s:s+n]*np.hanning(n)
    P=np.abs(np.fft.rfft(seg))**2; f=np.fft.rfftfreq(n,1/sr); tot=P.sum()+1e-30
    lo=P[f<200].sum()/tot; hi=P[f>=5000].sum()/tot
    cen=(P*f).sum()/tot
    L=a[s:s+n,0]; R=a[s:s+n,1]
    wid=np.sqrt(((L-R)**2).mean())/(np.sqrt(((L+R)**2).mean())+1e-12)
    rms=20*math.log10(np.sqrt((m[s:s+n]**2).mean())+1e-12)
    print(f"  {s/sr:4.1f} {rms:7.1f}  {lo*100:6.1f}% {hi*100:6.1f}%  {cen:7.0f}Hz  {wid:5.2f}")
